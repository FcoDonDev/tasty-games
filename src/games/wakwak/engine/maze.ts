/**
 * Laberinto de Wak Wak: grilla propia de 19×21, diseño original (ver
 * PLAN-WAK-WAK.md §2: el layout debe ser propio; solo las mecánicas se
 * inspiran en el clásico maze-chase).
 *
 * Índices row-major: index = row * MAZE_COLS + col. El (0,0) es la esquina
 * superior izquierda.
 *
 * Simbología del layout ASCII:
 *   `#` muro · `.` batería inicial · `o` súper batería · ` ` camino sin batería
 *   `-` puerta del corral (solo drones) · `D` celda del corral (spawn de drone)
 *   `R` spawn del robot
 *
 * El túnel (fila TUNNEL_ROW) hace wrap: salir por el borde izquierdo entra por
 * el derecho y viceversa.
 */

export const MAZE_COLS = 19;
export const MAZE_ROWS = 21;

export type Cell = 'wall' | 'path' | 'door';

export type Direction = 'up' | 'down' | 'left' | 'right';

export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

export const DIR_DELTA: Record<Direction, { dr: number; dc: number }> = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
};

export function oppositeDirection(dir: Direction): Direction {
  return dir === 'up' ? 'down' : dir === 'down' ? 'up' : dir === 'left' ? 'right' : 'left';
}

/**
 * Layout propio (PLAN-WAK-POLISH F4): topología v2 con más cruces de 4 vías
 * (26 vs 20 del v1) y filas largas de velocidad. Pines conservados a propósito
 * (candeados en maze.test.ts):
 *   - fila 15 = corredor del spawn (c4..c14, topes c3/c15): los seeds
 *     sentinelas E2E (seed.ts) usan esas celdas y NO cambian;
 *   - corral/túnel filas 8-10 y puerta (8,9);
 *   - esquinas (1,1),(1,17),(19,1),(19,17) = targets scatter de ai.ts;
 *   - (11,9) = camino SIN batería (' ') = BONUS_CELL (rules.ts).
 * Invariantes estructurales: conectividad total, sin callejones (≥2 salidas),
 * una sola fila de túnel, corral sellado, 4 súper ('o').
 */
export const LAYOUT: readonly string[] = [
  '###################',
  '#o.......#.......o#',
  '#.##.##..#..##.##.#',
  '#.................#',
  '#...##...#...##...#',
  '#......#...#......#',
  '#.##.#.##.##.#.##.#',
  '#.................#',
  '####.####-####.####',
  '.....##DD DD##.....',
  '####.#########.####',
  '####.#... ...#.####',
  '####.#.#####.#.####',
  '#.................#',
  '#.##.#..#.#..#.##.#',
  '#o.#.....R.....#.o#',
  '##.#.#.#####.#.#.##',
  '#........#........#',
  '#....#...#...#....#',
  '#.................#',
  '###################',
];

export interface MazeData {
  /** Topología estática, row-major, largo MAZE_ROWS * MAZE_COLS */
  grid: Cell[];
  /** Celdas de corral (interior, spawn de drones) */
  corralCells: number[];
  /** Celda-puerta del corral: transitable para drones, muro para el robot */
  doorIndex: number;
  /** Spawn del robot */
  robotSpawn: number;
  /** Spawns de los 4 drones (dentro del corral) */
  droneSpawns: number[];
  /** Fila del túnel con wrap lateral */
  tunnelRow: number;
  /** Celdas que inician con batería normal (sin súper) */
  batteryCells: number[];
  /** Celdas que inician con súper batería */
  superCells: number[];
}

export function rowOf(index: number): number {
  return Math.floor(index / MAZE_COLS);
}

export function colOf(index: number): number {
  return index % MAZE_COLS;
}

export function toIndex(row: number, col: number): number {
  return row * MAZE_COLS + col;
}

function buildMaze(): MazeData {
  return parseLayout(LAYOUT);
}

/**
 * Parseo puro de un layout de strings → MazeData (PLAN-WAK-POLISH: extraído
 * para el preview del laberinto, que itera layouts candidatos sin tocar el
 * LAYOUT del juego). Lanza Error ante layout inválido (filas/anchos, carácter
 * desconocido, falta de puerta/spawn/túnel/4 drones).
 */
export function parseLayout(layout: readonly string[]): MazeData {
  const rows = layout.length;
  if (rows !== MAZE_ROWS) throw new Error('layout: filas != MAZE_ROWS');
  const grid: Cell[] = [];
  const corralCells: number[] = [];
  const droneSpawns: number[] = [];
  const batteryCells: number[] = [];
  const superCells: number[] = [];
  let doorIndex = -1;
  let robotSpawn = -1;
  let tunnelRow = -1;

  for (let row = 0; row < rows; row++) {
    const line = layout[row];
    if (line.length !== MAZE_COLS) throw new Error(`layout: fila ${row} con ancho != MAZE_COLS`);
    // Túnel: fila cuyos extremos (col 0 y última) son transitables
    if (line[0] !== '#' && line[MAZE_COLS - 1] !== '#') tunnelRow = row;
    for (let col = 0; col < MAZE_COLS; col++) {
      const index = toIndex(row, col);
      const ch = line[col];
      if (ch === '#') {
        grid.push('wall');
        continue;
      }
      if (ch === '-') {
        grid.push('door');
        doorIndex = index;
        continue;
      }
      grid.push('path');
      if (ch === 'D') {
        corralCells.push(index);
        droneSpawns.push(index);
      } else if (ch === ' ') {
        if (corralCells.length > 0 && corralCells.includes(toIndex(row, col - 1))) {
          corralCells.push(index); // hueco central del corral
        }
      } else if (ch === 'R') {
        robotSpawn = index;
      } else if (ch === '.') {
        batteryCells.push(index);
      } else if (ch === 'o') {
        superCells.push(index);
      } else {
        throw new Error(`layout: carácter desconocido '${ch}' en (${row},${col})`);
      }
    }
  }

  if (doorIndex < 0) throw new Error('layout: falta la puerta del corral');
  if (robotSpawn < 0) throw new Error('layout: falta el spawn del robot');
  if (tunnelRow < 0) throw new Error('layout: falta la fila de túnel');
  if (droneSpawns.length !== 4) throw new Error('layout: se esperaban 4 spawns de drone');

  return { grid, corralCells, doorIndex, robotSpawn, droneSpawns, tunnelRow, batteryCells, superCells };
}

export const MAZE: MazeData = buildMaze();

export function isCorralCell(index: number): boolean {
  return MAZE.corralCells.includes(index);
}

/**
 * Vecina transitada por la entidad dada. El túnel hace wrap en TUNNEL_ROW.
 * `canUseDoor`: true para drones, false para el robot.
 * Devuelve -1 si no hay vecina transitada en esa dirección.
 */
export function neighbor(index: number, dir: Direction, canUseDoor: boolean): number {
  const row = rowOf(index);
  const col = colOf(index);
  const { dr, dc } = DIR_DELTA[dir];
  let nextRow = row + dr;
  let nextCol = col + dc;
  if (nextCol < 0 || nextCol >= MAZE_COLS) {
    if (row !== MAZE.tunnelRow) return -1;
    nextCol = nextCol < 0 ? MAZE_COLS - 1 : 0;
  }
  if (nextRow < 0 || nextRow >= MAZE_ROWS) return -1;
  const next = toIndex(nextRow, nextCol);
  const cell = MAZE.grid[next];
  if (cell === 'wall') return -1;
  if (cell === 'door') return canUseDoor ? next : -1;
  if (isCorralCell(next) && !canUseDoor) return -1;
  return next;
}

/** Posición de render (x, y) en unidades de celda (centro de celda = índice). */
export function cellCenter(index: number): { x: number; y: number } {
  return { x: colOf(index) + 0.5, y: rowOf(index) + 0.5 };
}

/** Distancia euclidiana entre celdas (en unidades de celda). */
export function cellDistance(a: number, b: number): number {
  const dr = rowOf(a) - rowOf(b);
  const dc = colOf(a) - colOf(b);
  return Math.hypot(dr, dc);
}
