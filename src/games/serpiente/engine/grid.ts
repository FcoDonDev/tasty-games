/**
 * Grilla propia de Serpiente 20×20 (D5). Funciones puras, sin dependencias.
 * Índices row-major: index = row * GRID_COLS + col. El (0,0) es la esquina
 * superior izquierda.
 */

export const GRID_COLS = 20;
export const GRID_ROWS = 20;
export const CELL_COUNT = GRID_COLS * GRID_ROWS;

export type Direction = 'up' | 'down' | 'left' | 'right';

export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

export const DIR_DELTA: Record<Direction, { dr: number; dc: number }> = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
};

export function opposite(dir: Direction): Direction {
  return dir === 'up' ? 'down' : dir === 'down' ? 'up' : dir === 'left' ? 'right' : 'left';
}

export function rowOf(index: number): number {
  return Math.floor(index / GRID_COLS);
}

export function colOf(index: number): number {
  return index % GRID_COLS;
}

export function toIndex(row: number, col: number): number {
  return row * GRID_COLS + col;
}

export function manhattan(a: number, b: number): number {
  return Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b));
}

/**
 * Celda vecina en `dir`. Con `wrap=true` (D1 default) atraviesa el borde
 * (módulo por eje); con `wrap=false` salir del tablero devuelve -1
 * (= muerte contra el muro).
 */
export function stepIndex(index: number, dir: Direction, wrap: boolean): number {
  const { dr, dc } = DIR_DELTA[dir];
  const row = rowOf(index) + dr;
  const col = colOf(index) + dc;
  if (wrap) {
    const wrappedRow = (row + GRID_ROWS) % GRID_ROWS;
    const wrappedCol = (col + GRID_COLS) % GRID_COLS;
    return toIndex(wrappedRow, wrappedCol);
  }
  if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) return -1;
  return toIndex(row, col);
}
