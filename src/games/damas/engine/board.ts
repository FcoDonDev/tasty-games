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

/** Sentinelas de performance (PLAN-PERFORMANCE §7): posiciones de alto coste
 * para el hot path de reglas, sin capturas disponibles. */
export const PERF_KINGS_SEED = '__perf_kings__';
/** Sentinelas de performance (PLAN-PERFORMANCE §7): cadena de capturas con
 * muchas ramas (dama voladora + multi-aterrizaje) para medir `applyMove`/
 * `legalMovesForPiece` en el peor caso de ramificación. */
export const PERF_BRANCHING_SEED = '__perf_branching__';

export type SetupSeed =
  | typeof TEST_CAPTURE_SEED
  | typeof TEST_WIN_SEED
  | typeof PERF_KINGS_SEED
  | typeof PERF_BRANCHING_SEED;

/** Mapea el `initialSeed` que llega por query param (solo builds E2E) a sentinel. */
export function parseSetupSeed(initialSeed?: string): SetupSeed | undefined {
  if (initialSeed === 'test-capture') return TEST_CAPTURE_SEED;
  if (initialSeed === 'test-win') return TEST_WIN_SEED;
  if (initialSeed === 'perf-kings') return PERF_KINGS_SEED;
  if (initialSeed === 'perf-branching') return PERF_BRANCHING_SEED;
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
  if (seed === PERF_KINGS_SEED) return perfKingsBoard();
  if (seed === PERF_BRANCHING_SEED) return perfBranchingBoard();
  return standardBoard();
}

/**
 * E2E `perf-kings`: 6 damas del jugador 1 (en filas 2-3, p1 avanza hacia
 * arriba) contra 8 peones del jugador 2 en filas 5-6. Todas las diagonales
 * entre bandos terminan bloqueadas (por ficha propia o por borde con enemiga
 * pegada al límite), así que NO hay capturas disponibles: cada
 * `legalMovesForPiece` ejecuta además el `hasCapture` global sobre todas las
 * fichas — el peor caso del hot path de drag (PLAN-PERFORMANCE §7).
 * p1: 17,19,24,26,28,30 · p2: 40,42,44,46 (fila 5) y 49,51,53,55 (fila 6).
 */
function perfKingsBoard(): Board {
  return boardFromSquares([
    // damas del jugador 1 (filas 2-3)
    [17, piece(1, true, 'a')],
    [19, piece(1, true, 'b')],
    [24, piece(1, true, 'c')],
    [26, piece(1, true, 'd')],
    [28, piece(1, true, 'e')],
    [30, piece(1, true, 'f')],
    // peones del jugador 2 (filas 5-6); los de fila 6 tienen avance libre
    [40, piece(2, false, 'a')],
    [42, piece(2, false, 'b')],
    [44, piece(2, false, 'c')],
    [46, piece(2, false, 'd')],
    [49, piece(2, false, 'e')],
    [51, piece(2, false, 'f')],
    [53, piece(2, false, 'g')],
    [55, piece(2, false, 'h')],
  ]);
}

/**
 * E2E `perf-branching`: una dama del jugador 1 en 44 rodeada de 5 enemigas
 * (33, 35, 37, 51, 53) con pasillo vacío hacia atrás: la captura por NW abre
 * aterrizajes múltiples (26, 17, 8...) y desde 26 continúa la cadena hacia
 * 33 — el caso de ramificación de `kingCaptureChains` (PLAN §7).
 * El jugador 1 está al turno; la partida no terminó.
 */
function perfBranchingBoard(): Board {
  return boardFromSquares([
    [44, piece(1, true, 'a')],
    [33, piece(2, false, 'a')],
    [35, piece(2, false, 'b')],
    [37, piece(2, false, 'c')],
    [51, piece(2, false, 'd')],
    [53, piece(2, false, 'e')],
  ]);
}
