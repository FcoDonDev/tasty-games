import { MAZE_COLS, MAZE_ROWS, toIndex } from '../engine/maze';

/**
 * Validador de layouts candidatos para el preview del laberinto
 * (PLAN-WAK-POLISH F4-iteración). PURO: réplica de los invariantes de
 * maze.test.ts + pines de sentinels/IA/chip + la regla del usuario de
 * NO áreas abiertas 3×3 (solo pasillos de 1 de ancho). Devuelve violaciones
 * como texto para pintarlas en el preview; [] = layout válido.
 */

const DIRS: Record<string, [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

export interface LayoutParse {
  grid: Array<'wall' | 'path' | 'door'>;
  corral: number[];
  door: number;
  spawn: number;
  tunnelRow: number;
  batteries: number[];
  supers: number[];
  /** dims derivadas del layout (T4a: parseo paramétrico por modo) */
  cols: number;
  rows: number;
}

/** Parseo tolerante: no lanza; devuelve null si dims/caracteres inválidos.
 * Paramétrico en dims (T4a); los pines por modo se validan aparte. */
export function parseLenient(
  layout: readonly string[],
  cols: number = MAZE_COLS,
  rows: number = MAZE_ROWS,
): LayoutParse | null {
  if (layout.length !== rows) return null;
  const grid: LayoutParse['grid'] = [];
  const corral: number[] = [];
  const batteries: number[] = [];
  const supers: number[] = [];
  let door = -1;
  let spawn = -1;
  let tunnelRow = -1;
  for (let r = 0; r < rows; r++) {
    const line = layout[r];
    if (line.length !== cols) return null;
    if (line[0] !== '#' && line[cols - 1] !== '#') tunnelRow = r;
    for (let c = 0; c < cols; c++) {
      const i = toIndex(r, c, cols);
      const ch = line[c];
      if (ch === '#') {
        grid.push('wall');
      } else if (ch === '-') {
        grid.push('door');
        door = i;
      } else if (ch === 'D') {
        grid.push('path');
        corral.push(i);
      } else if (ch === ' ') {
        grid.push('path');
        if (corral.includes(i - 1)) corral.push(i);
      } else if (ch === 'R') {
        grid.push('path');
        spawn = i;
      } else if (ch === '.') {
        grid.push('path');
        batteries.push(i);
      } else if (ch === 'o') {
        grid.push('path');
        supers.push(i);
      } else {
        return null;
      }
    }
  }
  return { grid, corral, door, spawn, tunnelRow, batteries, supers, cols, rows };
}

/** Vecino transitable para el robot (sin puerta ni corral), con wrap de túnel. */
function neighbor(p: LayoutParse, i: number, dir: keyof typeof DIRS): number {
  const r = Math.floor(i / p.cols);
  const c = i % p.cols;
  let nr = r + DIRS[dir][0];
  let nc = c + DIRS[dir][1];
  if (nc < 0 || nc >= p.cols) {
    // wrap lateral SOLO en la fila de túnel (misma regla del engine)
    if (r !== p.tunnelRow) return -1;
    nc = nc < 0 ? p.cols - 1 : 0;
  }
  if (nr < 0 || nr >= p.rows) return -1;
  const next = nr * p.cols + nc;
  const cell = p.grid[next];
  if (cell === 'wall' || cell === 'door') return -1;
  if (p.corral.includes(next)) return -1;
  return next;
}

/** Bloques abiertos 3×3 (todo transitable): la regla del usuario (solo pasillos). */
export function openAreas3x3(p: LayoutParse): Array<[number, number]> {
  const found: Array<[number, number]> = [];
  for (let r = 0; r + 2 < p.rows; r++) {
    for (let c = 0; c + 2 < p.cols; c++) {
      let all = true;
      for (let dr = 0; dr < 3 && all; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          if (p.grid[toIndex(r + dr, c + dc)] !== 'path' || p.corral.includes(toIndex(r + dr, c + dc))) {
            all = false;
            break;
          }
        }
      }
      if (all) found.push([r, c]);
    }
  }
  return found;
}

export function validateLayout(layout: readonly string[]): string[] {
  const problems: string[] = [];
  const p = parseLenient(layout);
  if (!p) return ['layout: dims o caracteres inválidos (19×21, símbolos #-. DRo)'];

  // túnel y bordes
  if (p.tunnelRow < 0) problems.push('sin fila de túnel (extremos abiertos)');
  let tunnels = 0;
  for (let r = 0; r < p.rows; r++) if (p.grid[toIndex(r, 0, p.cols)] === 'path') tunnels++;
  if (tunnels !== 1) problems.push(`filas con borde abierto: ${tunnels} (debe ser 1)`);
  for (let c = 0; c < p.cols; c++) {
    if (p.grid[toIndex(0, c, p.cols)] !== 'wall') problems.push(`borde superior abierto en c${c}`);
    if (p.grid[toIndex(p.rows - 1, c, p.cols)] !== 'wall') problems.push(`borde inferior abierto en c${c}`);
  }

  // piezas
  const os = layout.join('').split('o').length - 1;
  const ds = layout.join('').split('D').length - 1;
  const rs = layout.join('').split('R').length - 1;
  if (os !== 4) problems.push(`súper baterías: ${os} (deben ser 4)`);
  if (ds !== 4) problems.push(`spawns de drone 'D': ${ds} (deben ser 4)`);
  if (rs !== 1) problems.push(`spawns de robot 'R': ${rs} (debe ser 1)`);
  if (p.door < 0) problems.push('falta la puerta del corral');

  // corral sellado
  for (const cell of p.corral) {
    for (const dir of Object.keys(DIRS) as Array<keyof typeof DIRS>) {
      if (neighbor(p, cell, dir) >= 0) {
        problems.push(`corral NO sellado en (${Math.floor(cell / p.cols)},${cell % p.cols}) ${dir}`);
      }
    }
  }

  // conectividad + callejones
  const walk = new Set<number>();
  for (let i = 0; i < p.rows * p.cols; i++) {
    if (p.grid[i] !== 'path' || p.corral.includes(i)) continue;
    const dirs = Object.keys(DIRS) as Array<keyof typeof DIRS>;
    if (dirs.some((d) => neighbor(p, i, d) >= 0) || i === p.spawn) walk.add(i);
  }
  if (p.spawn >= 0) {
    const seen = new Set([p.spawn]);
    const q = [p.spawn];
    while (q.length > 0) {
      const cur = q.shift()!;
      for (const dir of Object.keys(DIRS) as Array<keyof typeof DIRS>) {
        const n = neighbor(p, cur, dir);
        if (n >= 0 && walk.has(n) && !seen.has(n)) {
          seen.add(n);
          q.push(n);
        }
      }
    }
    for (const c of walk) {
      if (!seen.has(c)) problems.push(`inaccesible (${Math.floor(c / p.cols)},${c % p.cols})`);
    }
  }
  for (const cell of [...p.batteries, ...p.supers]) {
    if (!walk.has(cell)) problems.push(`batería inaccesible (${Math.floor(cell / p.cols)},${cell % p.cols})`);
  }
  for (const c of walk) {
    const dirs = Object.keys(DIRS) as Array<keyof typeof DIRS>;
    const exits = dirs.filter((d) => neighbor(p, c, d) >= 0).length;
    if (exits < 2) problems.push(`CALLEJÓN (${Math.floor(c / p.cols)},${c % p.cols})`);
  }

  // NO áreas abiertas 3×3 (regla del usuario: solo pasillos)
  for (const [r, c] of openAreas3x3(p)) {
    problems.push(`área abierta 3×3 en filas ${r}-${r + 2}, cols ${c}-${c + 2}`);
  }

  // pines: sentinels E2E / IA / chip
  const at = (r: number, c: number) => layout[r][c];
  if (p.spawn !== toIndex(15, 9)) problems.push('spawn debe ser (15,9)');
  for (let c = 4; c <= 14; c++) if (at(15, c) === '#') problems.push(`fila spawn: c${c} debe ser transitable`);
  if (at(15, 3) !== '#' || at(15, 15) !== '#') problems.push('fila spawn: topes c3/c15 deben ser muro');
  for (const [r, c] of [
    [1, 1],
    [1, 17],
    [19, 1],
    [19, 17],
  ] as const) {
    if (p.grid[toIndex(r, c)] !== 'path') problems.push(`esquina scatter (${r},${c}) debe ser camino`);
  }
  if (p.grid[toIndex(11, 9)] !== 'path' || p.batteries.includes(toIndex(11, 9)) || p.supers.includes(toIndex(11, 9))) {
    problems.push('BONUS_CELL (11,9) debe ser camino sin batería');
  }

  return problems;
}
