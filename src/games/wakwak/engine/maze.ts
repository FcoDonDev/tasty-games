/**
 * Laberinto de Wak Wak: diseño original (ver PLAN-WAK-WAK.md §2: el layout
 * debe ser propio; solo las mecánicas se inspiran en el clásico maze-chase).
 *
 * Índices row-major: index = row * cols + col. El (0,0) es la esquina
 * superior izquierda. Las dims son POR MODO (PLAN-ACCESIBILIDAD T4a):
 * `MAZE_COLS`/`MAZE_ROWS` quedan como dims del modo NORMAL y los helpers
 * aceptan un maze explícito (default = modo normal) para el modo fácil
 * (~11×13). `mazeFor(mode)` es la única fuente de laberintos.
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

/** Modos de laberinto: normal (19×21, 4 drones) y fácil (T4b, ~11×13, 2 drones). */
export type MazeMode = 'normal' | 'facil';

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
 * Layout propio v3 (PLAN-WAK-POLISH F4, aprobado por el usuario en la
 * iteración del preview): SOLO PASILLOS — sin áreas abiertas 3×3 (regla del
 * usuario, candada en maze.test.ts). Más íntimo que el v2 (6 cruces de 4 vías
 * vs 26) y con menos baterías (175 vs 207). Pines conservados a propósito
 * (candeados en maze.test.ts):
 *   - fila 15 = corredor del spawn (c4..c14, topes c3/c15): los seeds
 *     sentinelas E2E (seed.ts) usan esas celdas y NO cambian;
 *   - corral/túnel filas 8-10 y puerta (8,9);
 *   - esquinas (1,1),(1,17),(19,1),(19,17) = targets scatter de ai.ts;
 *   - (11,9) = camino SIN batería (' ') = BONUS_CELL (rules.ts).
 * Invariantes estructurales: conectividad total, sin callejones (≥2 salidas),
 * una sola fila de túnel, corral sellado, 4 súper ('o'), sin 3×3 abiertos.
 */
export const LAYOUT: readonly string[] = [
  '###################',
  '#o.......#.......o#',
  '#.##.###.#.###.##.#',
  '#.................#',
  '#.##.####.####.##.#',
  '#......#...#......#',
  '####.#.#.#.#.#.####',
  '####.#.......#.####',
  '####.####-####.####',
  '.....##DD DD##.....',
  '####.#########.####',
  '####.#... ...#.####',
  '####.#.#####.#.####',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#o.#.....R.....#.o#',
  '##.#.#.#####.#.#.##',
  '#....#...#...#....#',
  '#.##.###.#.###.##.#',
  '#.................#',
  '###################',
];

export interface MazeData {
  /** Dims del modo: los helpers aceptan un maze para los modos no-normales */
  cols: number;
  rows: number;
  /** Topología estática, row-major, largo rows * cols */
  grid: Cell[];
  /** Celdas de corral (interior, spawn de drones) */
  corralCells: number[];
  /** Celda-puerta del corral: transitable para drones, muro para el robot */
  doorIndex: number;
  /** Spawn del robot */
  robotSpawn: number;
  /** Spawns de los drones (dentro del corral; 4 normal / 2 fácil) */
  droneSpawns: number[];
  /** Fila del túnel con wrap lateral */
  tunnelRow: number;
  /** Celdas que inician con batería normal (sin súper) */
  batteryCells: number[];
  /** Celdas que inician con súper batería */
  superCells: number[];
  /** Celda del chip dorado: camino SIN batería (seteada por `mazeFor`) */
  bonusCell: number;
}

export function rowOf(index: number, cols: number = MAZE_COLS): number {
  return Math.floor(index / cols);
}

export function colOf(index: number, cols: number = MAZE_COLS): number {
  return index % cols;
}

export function toIndex(row: number, col: number, cols: number = MAZE_COLS): number {
  return row * cols + col;
}

function buildMaze(): MazeData {
  return mazeFor('normal');
}

/**
 * Parseo puro de un layout de strings → MazeData (PLAN-WAK-POLISH: extraído
 * para el preview del laberinto, que itera layouts candidatos sin tocar el
 * LAYOUT del juego). Paramétrico en dims (deriva cols/rows del layout y
 * valida anchos consistentes) y en cantidad de spawns de drone (T4a).
 * Lanza Error ante layout inválido (anchos, carácter desconocido, falta de
 * puerta/spawn/túnel o cantidad de drones distinta a la esperada).
 * `bonusCell` lo completa `mazeFor` (pin que el ASCII no puede expresar).
 */
export function parseLayout(layout: readonly string[], expectedDrones = 4): MazeData {
  const rows = layout.length;
  const cols = layout[0]?.length ?? 0;
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
    if (line.length !== cols) throw new Error(`layout: fila ${row} con ancho != ${cols}`);
    // Túnel: fila cuyos extremos (col 0 y última) son transitables
    if (line[0] !== '#' && line[cols - 1] !== '#') tunnelRow = row;
    for (let col = 0; col < cols; col++) {
      const index = toIndex(row, col, cols);
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
        if (corralCells.length > 0 && corralCells.includes(toIndex(row, col - 1, cols))) {
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
  if (droneSpawns.length !== expectedDrones) {
    throw new Error(`layout: se esperaban ${expectedDrones} spawns de drone`);
  }

  return {
    cols,
    rows,
    grid,
    corralCells,
    doorIndex,
    robotSpawn,
    droneSpawns,
    tunnelRow,
    batteryCells,
    superCells,
    bonusCell: -1,
  };
}

/** Pin por modo que el ASCII no puede expresar (dims, drones, chip). */
interface MazeSpec {
  layout: readonly string[];
  /** spawns de drone 'D' esperados (4 normal / 2 fácil) */
  expectedDrones: number;
  /** celda del chip dorado: camino SIN batería (row, col) */
  bonusCell: { row: number; col: number };
}

const SPECS: Partial<Record<MazeMode, MazeSpec>> = {
  normal: { layout: LAYOUT, expectedDrones: 4, bonusCell: { row: 11, col: 9 } },
  // 'facil' se diseña en T4b (checkpoint con el usuario) y entra acá en T4c.
};

const built: Partial<Record<MazeMode, MazeData>> = {};

/**
 * Laberinto del modo (memoizado). Lanza si el modo aún no tiene laberinto:
 * hasta T4b solo existe el normal.
 */
export function mazeFor(mode: MazeMode): MazeData {
  const cached = built[mode];
  if (cached) return cached;
  const spec = SPECS[mode];
  if (!spec) throw new Error(`maze: el modo '${mode}' aún no tiene laberinto (T4b)`);
  const maze = parseLayout(spec.layout, spec.expectedDrones);
  maze.bonusCell = toIndex(spec.bonusCell.row, spec.bonusCell.col, maze.cols);
  built[mode] = maze;
  return maze;
}

/** Celda del chip dorado del modo (camino SIN batería en su layout). */
export function bonusCellFor(mode: MazeMode): number {
  return mazeFor(mode).bonusCell;
}

export const MAZE: MazeData = buildMaze();

export function isCorralCell(index: number, maze: MazeData = MAZE): boolean {
  return maze.corralCells.includes(index);
}

/**
 * Vecina transitada por la entidad dada. El túnel hace wrap en `maze.tunnelRow`.
 * `canUseDoor`: true para drones, false para el robot.
 * Devuelve -1 si no hay vecina transitada en esa dirección.
 */
export function neighbor(
  index: number,
  dir: Direction,
  canUseDoor: boolean,
  maze: MazeData = MAZE,
): number {
  const row = rowOf(index, maze.cols);
  const col = colOf(index, maze.cols);
  const { dr, dc } = DIR_DELTA[dir];
  let nextRow = row + dr;
  let nextCol = col + dc;
  if (nextCol < 0 || nextCol >= maze.cols) {
    if (row !== maze.tunnelRow) return -1;
    nextCol = nextCol < 0 ? maze.cols - 1 : 0;
  }
  if (nextRow < 0 || nextRow >= maze.rows) return -1;
  const next = toIndex(nextRow, nextCol, maze.cols);
  const cell = maze.grid[next];
  if (cell === 'wall') return -1;
  if (cell === 'door') return canUseDoor ? next : -1;
  if (isCorralCell(next, maze) && !canUseDoor) return -1;
  return next;
}

/** Posición de render (x, y) en unidades de celda (centro de celda = índice). */
export function cellCenter(index: number, maze: MazeData = MAZE): { x: number; y: number } {
  return { x: colOf(index, maze.cols) + 0.5, y: rowOf(index, maze.cols) + 0.5 };
}

/** Distancia euclidiana entre celdas (en unidades de celda). */
export function cellDistance(a: number, b: number, cols: number = MAZE_COLS): number {
  const dr = rowOf(a, cols) - rowOf(b, cols);
  const dc = colOf(a, cols) - colOf(b, cols);
  return Math.hypot(dr, dc);
}
