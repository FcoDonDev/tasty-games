import {
  COLUMNS,
  colOf,
  forwardDelta,
  otherPlayer,
  promotionRow,
  rowOf,
  type Board,
  type Piece,
  type Player,
} from './board';

/**
 * Movimiento completo: `path` = casillas de aterrizaje en orden (1 para
 * movimiento silencioso / salto simple; >1 para cadena de multi-salto),
 * `captured` = casillas de las fichas capturadas, en el mismo orden.
 * El destino final del movimiento es `path[path.length - 1]`.
 */
export interface Move {
  from: number;
  path: number[];
  captured: number[];
}

const DIAGONAL_DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

/** Paso diagonal con control de bordes; null si sale del tablero. */
function step(index: number, dRow: number, dCol: number): number | null {
  const row = rowOf(index) + dRow;
  const col = colOf(index) + dCol;
  if (row < 0 || row >= 8 || col < 0 || col >= COLUMNS) return null;
  return row * COLUMNS + col;
}

function occupied(board: Board, index: number): boolean {
  return board[index] !== null;
}

/** Clave canónica para comparar movimientos (validación en el store). */
export function moveKey(move: Move): string {
  return `${move.from}>${move.path.join('-')}|${move.captured.join(',')}`;
}

/**
 * Cadenas de captura de un PEÓN. Regla chilena: captura hacia adelante y
 * hacia atrás. La cadena continúa obligatoriamente mientras haya capturas
 * desde la casilla de aterrizaje (L2). Llegar a la fila de coronación
 * termina la cadena (L3). Las fichas ya capturadas en la cadena permanecen
 * en el tablero como bloqueo (no se pueden saltar ni aterrizar sobre ellas
 * ni capturar dos veces).
 */
function manCaptureChains(
  board: Board,
  from: number,
  player: Player,
  capturedIds: ReadonlySet<string>,
): Move[] {
  const results: Move[] = [];
  for (const [dRow, dCol] of DIAGONAL_DIRS) {
    const over = step(from, dRow, dCol);
    if (over === null) continue;
    const target = board[over];
    if (!target || target.player === player || capturedIds.has(target.id)) continue;
    const landing = step(from, dRow * 2, dCol * 2);
    if (landing === null || occupied(board, landing)) continue;

    const nextCaptured = new Set(capturedIds);
    nextCaptured.add(target.id);
    const jump: Move = { from, path: [landing], captured: [over] };

    // Coronación termina el turno (L3): la cadena no continúa
    if (rowOf(landing) === promotionRow(player)) {
      results.push(jump);
      continue;
    }

    const continuations = manCaptureChains(board, landing, player, nextCaptured);
    if (continuations.length === 0) {
      results.push(jump);
    } else {
      for (const c of continuations) {
        results.push({
          from,
          path: [landing, ...c.path],
          captured: [over, ...c.captured],
        });
      }
    }
  }
  return results;
}

/**
 * Cadenas de captura de una DAMA ("dama vuela"): recorre cualquier distancia
 * en diagonal por casillas vacías, captura la primera ficha enemiga y aterriza
 * en cualquier casilla vacía detrás de ella. Desde el aterrizaje la cadena
 * continúa obligatoriamente (L2). Tras el primer enemigo de una dirección la
 * dama no puede seguir volando en esa misma pasada.
 */
function kingCaptureChains(
  board: Board,
  from: number,
  player: Player,
  capturedIds: ReadonlySet<string>,
): Move[] {
  const results: Move[] = [];
  for (const [dRow, dCol] of DIAGONAL_DIRS) {
    let cursor = from;
    // vuelo por casillas vacías hasta topar con una ficha o el borde
    for (;;) {
      const next = step(cursor, dRow, dCol);
      if (next === null) break;
      const occupant = board[next];
      if (occupant === null) {
        cursor = next;
        continue;
      }
      // ficha bloqueante: si es propia o ya capturada, la dirección muere
      if (occupant.player === player || capturedIds.has(occupant.id)) break;

      // enemiga: aterrizar en cualquier casilla vacía detrás de ella
      let landing = next;
      for (;;) {
        const beyond = step(landing, dRow, dCol);
        if (beyond === null || occupied(board, beyond)) break;
        landing = beyond;
        const nextCaptured = new Set(capturedIds);
        nextCaptured.add(occupant.id);
        const continuations = kingCaptureChains(board, landing, player, nextCaptured);
        if (continuations.length === 0) {
          results.push({ from, path: [landing], captured: [next] });
        } else {
          for (const c of continuations) {
            results.push({
              from,
              path: [landing, ...c.path],
              captured: [next, ...c.captured],
            });
          }
        }
      }
      break; // un solo salto por dirección y pasada
    }
  }
  return results;
}

/** Movimientos silenciosos de una ficha (sin regla de captura obligatoria). */
function quietMoves(board: Board, from: number, piece: Piece): Move[] {
  const results: Move[] = [];
  if (!piece.king) {
    const dRow = forwardDelta(piece.player);
    for (const dCol of [-1, 1] as const) {
      const dest = step(from, dRow, dCol);
      if (dest === null || occupied(board, dest)) continue;
      results.push({ from, path: [dest], captured: [] });
    }
    return results;
  }
  for (const [dRow, dCol] of DIAGONAL_DIRS) {
    let cursor = from;
    for (;;) {
      const next = step(cursor, dRow, dCol);
      if (next === null || occupied(board, next)) break;
      results.push({ from, path: [next], captured: [] });
      cursor = next;
    }
  }
  return results;
}

/**
 * Movimientos de captura de la ficha en `from`. La ficha se considera fuera
 * del tablero (su origen queda vacío): durante la cadena puede volvover a
 * pasar por allí y aterrizar en él. [] si no hay capturas.
 */
function captureMovesForPiece(board: Board, from: number, piece: Piece): Move[] {
  const boardWithoutOrigin = board.slice();
  boardWithoutOrigin[from] = null;
  const empty: ReadonlySet<string> = new Set();
  return piece.king
    ? kingCaptureChains(boardWithoutOrigin, from, piece.player, empty)
    : manCaptureChains(boardWithoutOrigin, from, piece.player, empty);
}

/** ¿Existe alguna captura para `player` en el tablero? (regla L2). */
export function hasCapture(board: Board, player: Player): boolean {
  for (let i = 0; i < board.length; i++) {
    const piece = board[i];
    if (!piece || piece.player !== player) continue;
    if (captureMovesForPiece(board, i, piece).length > 0) return true;
  }
  return false;
}

/** Movimientos legales de la ficha en `from` (aplica captura obligatoria). */
export function legalMovesForPiece(board: Board, from: number): Move[] {
  const piece = board[from];
  if (!piece) return [];
  const captures = captureMovesForPiece(board, from, piece);
  if (captures.length > 0) return captures;
  if (hasCapture(board, piece.player)) return []; // captura obligatoria global
  return quietMoves(board, from, piece);
}

/** Todos los movimientos legales de `player`. */
export function legalMoves(board: Board, player: Player): Move[] {
  const results: Move[] = [];
  for (let i = 0; i < board.length; i++) {
    const piece = board[i];
    if (!piece || piece.player !== player) continue;
    results.push(...legalMovesForPiece(board, i));
  }
  return results;
}

/** Ids de fichas de `player` con al menos un movimiento legal (drag habilitado). */
export function movablePieceIds(board: Board, player: Player): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < board.length; i++) {
    const piece = board[i];
    if (!piece || piece.player !== player) continue;
    if (legalMovesForPiece(board, i).length > 0) ids.add(piece.id);
  }
  return ids;
}

/** Casillas destino (final de `path`) legales para la ficha en `from`. */
export function destinationSquares(board: Board, from: number): Set<number> {
  return new Set(legalMovesForPiece(board, from).map((m) => m.path[m.path.length - 1]));
}

/** Aplica un movimiento validado: quita capturadas, mueve y corona (L3). */
export function applyMove(board: Board, move: Move): Board {
  const next = board.slice();
  const piece = next[move.from];
  if (!piece) throw new Error(`movimiento desde casilla vacía: ${move.from}`);
  next[move.from] = null;
  for (const captured of move.captured) next[captured] = null;
  const dest = move.path[move.path.length - 1];
  next[dest] = rowOf(dest) === promotionRow(piece.player) ? { ...piece, king: true } : piece;
  return next;
}

/** ¿Le quedan movimientos/piezas a `player`? (fin de juego, L4). */
export function hasAnyMove(board: Board, player: Player): boolean {
  return legalMoves(board, player).length > 0;
}

export interface GameOutcome {
  over: boolean;
  /** null mientras `over === false`; el ganador es quien acaba de mover */
  winner: Player | null;
}

/** Fin de juego: pierde quien no tiene fichas o no tiene movimientos (L4). */
export function gameOutcome(board: Board, playerToMove: Player): GameOutcome {
  const winner = otherPlayer(playerToMove);
  if (!board.some((piece) => piece?.player === playerToMove)) {
    return { over: true, winner };
  }
  if (!hasAnyMove(board, playerToMove)) {
    return { over: true, winner };
  }
  return { over: false, winner: null };
}
