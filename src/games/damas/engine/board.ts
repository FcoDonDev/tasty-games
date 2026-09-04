/**
 * Tablero de damas 8×8. Índices 0..63 en orden fila-major: index = row * 8 + col.
 * El índice 0 es la esquina superior izquierda (vista del jugador 1).
 *
 * Jugador 1: fichas en las filas 5–7, avanza hacia arriba (fila decrece),
 * corona en la fila 0. Jugador 2: filas 0–2, avanza hacia abajo, corona en la 7.
 * Solo las casillas oscuras son jugables (todas las fichas viven en ellas).
 */

export const BOARD_CELLS = 64;
export const COLUMNS = 8;

export type Player = 1 | 2;
export const PLAYERS: readonly Player[] = [1, 2];

export function otherPlayer(player: Player): Player {
  return player === 1 ? 2 : 1;
}

export interface Piece {
  /** Estable y único: `<player>-<n>` (ej: `1-3`). Lo usan drag y labels a11y */
  id: string;
  player: Player;
  king: boolean;
}

export type Square = Piece | null;
export type Board = Square[]; // length 64

export function rowOf(index: number): number {
  return Math.floor(index / COLUMNS);
}

export function colOf(index: number): number {
  return index % COLUMNS;
}

export function toIndex(row: number, col: number): number {
  return row * COLUMNS + col;
}

/** Casilla jugable (oscura): paridad impar de fila+columna. */
export function isDark(index: number): boolean {
  return (rowOf(index) + colOf(index)) % 2 === 1;
}

/** Fila de coronación de cada jugador. */
export function promotionRow(player: Player): number {
  return player === 1 ? 0 : 7;
}

/** Delta de fila de avance de cada jugador (p1 sube, p2 baja). */
export function forwardDelta(player: Player): number {
  return player === 1 ? -1 : 1;
}

/** Sentinelas para tableros artesanales de tests/E2E (patrón solitario S4). */
export const TEST_CAPTURE_SEED = '__test_capture__';
export const TEST_WIN_SEED = '__test_win__';

export type SetupSeed = typeof TEST_CAPTURE_SEED | typeof TEST_WIN_SEED;

/** Mapea el `initialSeed` que llega por query param (solo builds E2E) a sentinel. */
export function parseSetupSeed(initialSeed?: string): SetupSeed | undefined {
  if (initialSeed === 'test-capture') return TEST_CAPTURE_SEED;
  if (initialSeed === 'test-win') return TEST_WIN_SEED;
  return undefined;
}

export function emptyBoard(): Board {
  return Array<Square>(BOARD_CELLS).fill(null);
}

/** Ficha artesanal con id sufijo (ej: `piece(1, false, 'a')` → id `1-a`). */
export function piece(player: Player, king: boolean, suffix: string): Piece {
  return { id: `${player}-${suffix}`, player, king };
}

/** Construye un tablero artesanal: lista de [casilla, ficha]. */
export function boardFromSquares(placed: ReadonlyArray<readonly [number, Piece]>): Board {
  const board = emptyBoard();
  for (const [index, item] of placed) {
    if (index < 0 || index >= BOARD_CELLS) throw new Error(`casilla fuera de rango: ${index}`);
    if (!isDark(index)) throw new Error(`casilla no jugable: ${index}`);
    board[index] = item;
  }
  return board;
}

/** Reparto estándar: 12 fichas por bando sobre casillas oscuras (3 filas). */
function standardBoard(): Board {
  const board = emptyBoard();
  let p1 = 0;
  let p2 = 0;
  for (let i = 0; i < BOARD_CELLS; i++) {
    if (!isDark(i)) continue;
    const row = rowOf(i);
    if (row <= 2) {
      p2 += 1;
      board[i] = { id: `2-${p2}`, player: 2, king: false };
    } else if (row >= 5) {
      p1 += 1;
      board[i] = { id: `1-${p1}`, player: 1, king: false };
    }
  }
  return board;
}

/**
 * E2E `test-capture`: captura obligatoria y determinista para el jugador 1.
 * - `1-a` en 42 (f5,c2): captura hacia adelante sobre `2-a` (35) aterrizando en 28 (d4).
 * - `1-b` en 44 (f5,c4): también con captura disponible (sobre 35 → 26), sirve
 *   para el intento ilegal (movimiento silencioso prohibido).
 * - `2-b` en 24 (f3,c0): deja al jugador 2 con fichas tras la captura (el juego sigue).
 */
function testCaptureBoard(): Board {
  return boardFromSquares([
    [42, piece(1, false, 'a')],
    [44, piece(1, false, 'b')],
    [35, piece(2, false, 'a')],
    [24, piece(2, false, 'b')],
  ]);
}

/**
 * E2E `test-win`: el jugador 1 captura la última ficha del jugador 2 en un
 * único movimiento (42 → 35 → 28) y gana la partida.
 */
function testWinBoard(): Board {
  return boardFromSquares([
    [42, piece(1, false, 'a')],
    [35, piece(2, false, 'a')],
  ]);
}

export function initialBoard(seed?: SetupSeed): Board {
  if (seed === TEST_CAPTURE_SEED) return testCaptureBoard();
  if (seed === TEST_WIN_SEED) return testWinBoard();
  return standardBoard();
}
