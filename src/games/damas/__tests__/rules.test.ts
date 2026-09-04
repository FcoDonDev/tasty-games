import { boardFromSquares, initialBoard, piece, TEST_CAPTURE_SEED, TEST_WIN_SEED, type Board, type Piece } from '../engine/board';
import {
  applyMove,
  destinationSquares,
  gameOutcome,
  hasAnyMove,
  hasCapture,
  legalMoves,
  legalMovesForPiece,
  moveKey,
  movablePieceIds,
  type Move,
} from '../engine/rules';

const man = (player: 1 | 2, suffix: string): Piece => piece(player, false, suffix);
const king = (player: 1 | 2, suffix: string): Piece => piece(player, true, suffix);

/** Coloca fichas: `[casilla, player, king?, suffix?]`. Id default = índice (único). */
function boardOf(
  ...placed: Array<[number, 1 | 2, boolean?, string?]>
): Board {
  return boardFromSquares(
    placed.map(([index, player, isKing = false, suffix = String(index)]) => [
      index,
      isKing ? king(player, suffix) : man(player, suffix),
    ]) as Array<readonly [number, Piece]>,
  );
}

/** Movimientos como claves `from>path|captured` para asserts compactos. */
function moveKeys(moves: Move[]): string[] {
  return moves.map(moveKey).sort();
}

describe('rules: peón — movimientos silenciosos', () => {
  it('jugador 1 avanza solo hacia adelante (arriba)', () => {
    const board = boardOf([42, 1]);
    expect(moveKeys(legalMovesForPiece(board, 42))).toEqual(['42>33|', '42>35|']);
  });

  it('jugador 2 avanza solo hacia adelante (abajo)', () => {
    const board = boardOf([28, 2]);
    expect(moveKeys(legalMovesForPiece(board, 28))).toEqual(['28>35|', '28>37|']);
  });

  it('no puede avanzar hacia atrás ni saltar fichas propias', () => {
    const board = boardOf([42, 1], [35, 1, false, 'b']);
    // 35 ocupada por propia: el peón solo llega a 33
    expect(moveKeys(legalMovesForPiece(board, 42))).toEqual(['42>33|']);
  });

  it('peón en borde no sale del tablero', () => {
    const board = boardOf([40, 1]);
    expect(moveKeys(legalMovesForPiece(board, 40))).toEqual(['40>33|']);
    const board2 = boardOf([62, 2]);
    expect(legalMovesForPiece(board2, 62)).toEqual([]);
  });
});

describe('rules: captura obligatoria (L2)', () => {
  it('el peón captura hacia adelante', () => {
    const board = boardOf([33, 1], [26, 2, false, 'b']);
    expect(moveKeys(legalMovesForPiece(board, 33))).toEqual(['33>19|26']);
  });

  it('regla chilena: el peón también captura hacia atrás', () => {
    const board = boardOf([33, 1], [42, 2, false, 'b']);
    expect(moveKeys(legalMovesForPiece(board, 33))).toEqual(['33>51|42']);
  });

  it('captura obligatoria global: la ficha sin capturas queda inmovilizada', () => {
    // 'b' (17) tiene captura sobre 26 → 'a' (42) no puede moverse en silencio
    const board = boardOf([42, 1], [17, 1, false, 'b'], [26, 2]);
    expect(legalMovesForPiece(board, 42)).toEqual([]);
    expect(movablePieceIds(board, 1)).toEqual(new Set(['1-b']));
  });
  it('hasCapture refleja la existencia de capturas por bando', () => {
    const board = boardOf([33, 1], [26, 2]);
    // ambos bandos tienen captura: 33→19 (p1) y 26→40 (p2)
    expect(hasCapture(board, 1)).toBe(true);
    expect(hasCapture(board, 2)).toBe(true);
    // bando sin capturas disponibles
    expect(hasCapture(boardOf([33, 1], [1, 2]), 2)).toBe(false);
  });
});

describe('rules: multi-salto de peón (cadena obligatoria)', () => {
  it('la cadena continúa mientras haya capturas; solo se devuelven cadenas maximales', () => {
    // 42 → (sobre 35) → 28 → (sobre 19) → 10; no hay capturas desde 10
    const board = boardOf([42, 1], [35, 2, false, 'b'], [19, 2, false, 'c']);
    expect(moveKeys(legalMovesForPiece(board, 42))).toEqual(['42>28-10|35,19']);
  });

  it('elección libre entre capturas: dos saltos simples posibles', () => {
    const board = boardOf([42, 1], [33, 2, false, 'b'], [35, 2, false, 'c']);
    expect(moveKeys(legalMovesForPiece(board, 42))).toEqual(['42>24|33', '42>28|35']);
  });

  it('no se puede volver a capturar la misma ficha (queda como bloqueo)', () => {
    // tras aterrizar en 28, el salto hacia atrás sobre 35 (ya capturada) está bloqueado
    const board = boardOf([42, 1], [35, 2, false, 'b'], [19, 2, false, 'c']);
    const moves = legalMovesForPiece(board, 42);
    expect(moves).toHaveLength(1);
    expect(moves[0].captured).toEqual([35, 19]);
  });
});

describe('rules: coronación (L3)', () => {
  it('la coronación termina la cadena aunque haya más capturas', () => {
    // 21 → (sobre 12) → 3 (fila de coronación, r0c3). Sin L3, desde 3 seguiría
    // capturando sobre 10 hasta 17.
    const board = boardOf([21, 1], [12, 2, false, 'b'], [10, 2, false, 'c']);
    expect(moveKeys(legalMovesForPiece(board, 21))).toEqual(['21>3|12']);
  });

  it('coronación por movimiento silencioso', () => {
    const board = boardOf([12, 1], [58, 2, false, 'b']);
    expect(moveKeys(legalMovesForPiece(board, 12))).toEqual(['12>3|', '12>5|']);
  });

  it('applyMove corona al llegar a la última fila', () => {
    const board = boardOf([12, 1], [58, 2, false, 'b']);
    const next = applyMove(board, { from: 12, path: [3], captured: [] });
    expect(next[3]).toEqual({ id: '1-12', player: 1, king: true });
    expect(next[12]).toBeNull();
  });

  it('applyMove mantiene king en fichas ya coronadas', () => {
    const board = boardOf([42, 1, true]);
    const next = applyMove(board, { from: 42, path: [33], captured: [] });
    expect(next[33]?.king).toBe(true);
  });

  it('applyMove elimina las fichas capturadas de la cadena completa', () => {
    const board = boardOf([42, 1], [35, 2, false, 'b'], [19, 2, false, 'c']);
    const next = applyMove(board, { from: 42, path: [28, 12], captured: [35, 19] });
    expect(next[12]?.player).toBe(1);
    expect(next[28]).toBeNull();
    expect(next[35]).toBeNull();
    expect(next[19]).toBeNull();
  });
});

describe('rules: dama (dama vuela)', () => {
  it('se desliza cualquier distancia en las 4 diagonales', () => {
    const board = boardOf([28, 1, true], [46, 1, true, 'b']);
    expect(moveKeys(legalMovesForPiece(board, 28))).toEqual([
      '28>10|', '28>14|', '28>19|', '28>1|', '28>21|', '28>35|', '28>37|', '28>42|', '28>49|', '28>56|', '28>7|',
    ]);
  });

  it('captura a distancia y aterriza en cualquier casilla vacía detrás', () => {
    const board = boardOf([28, 1, true], [42, 2, false, 'b']);
    expect(moveKeys(legalMovesForPiece(board, 28))).toEqual(['28>49|42', '28>56|42']);
  });

  it('no puede pasar sobre ficha propia', () => {
    // el vuelo de 28 muere en la propia 35; 42 queda inalcanzable.
    // 'b' (35) sí captura sobre 42 → captura obligatoria → 28 sin jugadas.
    const board = boardOf([28, 1, true], [35, 1, false, 'b'], [42, 2, false, 'c']);
    expect(legalMovesForPiece(board, 28)).toEqual([]);
    expect(moveKeys(legalMovesForPiece(board, 35))).toEqual(['35>49|42']);
  });

  it('multi-captura de dama con esquinas y bloqueo de capturadas', () => {
    // 42 vuela sobre 35: aterriza en 28 (continúa sobre 37 → 46 o 55), 21, 14 o 7
    const board = boardOf([42, 1, true], [35, 2, false, 'b'], [37, 2, false, 'c']);
    expect(moveKeys(legalMovesForPiece(board, 42))).toEqual([
      '42>14|35',
      '42>21|35',
      '42>28-46|35,37',
      '42>28-55|35,37',
      '42>7|35',
    ]);
  });

  it('la ficha capturada bloquea el vuelo, la viva se captura en la cadena', () => {
    // 42 vuela sobre 35: aterriza en 28 (continúa sobre 46 → 55), 21, 14 o 7.
    // Desde 28 NO puede volar hacia 49/56: la 35 ya capturada sigue en el
    // tablero como bloqueo (sin esa regla habría cadena 28→56 capturando 49).
    const board = boardOf([42, 1, true], [35, 2, false, 'b'], [46, 2, false, 'c'], [49, 2, false, 'd']);
    expect(moveKeys(legalMovesForPiece(board, 42))).toEqual([
      '42>14|35',
      '42>21|35',
      '42>28-55|35,46',
      '42>56|49',
      '42>7|35',
    ]);
  });

  it('no aterriza sobre casillas ocupadas', () => {
    const board = boardOf([42, 1, true], [35, 2, false, 'b'], [28, 2, false, 'c']);
    const dests = destinationSquares(board, 42);
    expect(dests.has(28)).toBe(false);
  });
});

describe('rules: legalMoves y fin de juego (L4)', () => {
  it('legalMoves agrega los movimientos de todas las fichas del bando', () => {
    const board = boardOf([42, 1], [44, 1, false, 'b'], [35, 2, false, 'a'], [24, 2, false, 'b']);
    const moves = legalMoves(board, 1);
    // captura obligatoria: solo 42→28 y 44→26
    expect(moveKeys(moves)).toEqual(['42>28|35', '44>26|35']);
  });

  it('pierde quien se queda sin fichas', () => {
    const board = boardOf([42, 1]);
    expect(gameOutcome(board, 2)).toEqual({ over: true, winner: 1 });
    expect(gameOutcome(board, 1)).toEqual({ over: false, winner: null });
  });

  it('pierde quien queda sin movimientos (rodeado)', () => {
    // peón 2 en 12: adelante 19/21 ocupadas por rivales; las aterrizajes de
    // captura (26/30) también ocupadas; hacia atrás 3/5 no tiene aterrizaje.
    const board = boardOf(
      [12, 2],
      [3, 1, false, 'b'],
      [5, 1, false, 'c'],
      [19, 1, false, 'd'],
      [21, 1, false, 'e'],
      [26, 1, false, 'f'],
      [30, 1, false, 'g'],
    );
    expect(gameOutcome(board, 2)).toEqual({ over: true, winner: 1 });
  });

  it('partida en curso: ambos bandos con jugadas', () => {
    const board = initialBoard();
    expect(gameOutcome(board, 1)).toEqual({ over: false, winner: null });
    expect(hasAnyMove(board, 1)).toBe(true);
    expect(hasAnyMove(board, 2)).toBe(true);
  });
});

describe('rules: tableros sentinelas E2E', () => {
  it('test-capture: captura obligatoria determinista para el jugador 1', () => {
    const board = initialBoard(TEST_CAPTURE_SEED);
    expect(moveKeys(legalMovesForPiece(board, 42))).toEqual(['42>28|35']);
    expect(moveKeys(legalMovesForPiece(board, 44))).toEqual(['44>26|35']);
    // jugador 2 debe capturar a su turno (sobre 42 → 49)
    expect(moveKeys(legalMoves(board, 2))).toEqual(['35>49|42', '35>53|44']);
  });

  it('test-win: la captura de 42 deja al jugador 2 sin fichas', () => {
    const board = initialBoard(TEST_WIN_SEED);
    const next = applyMove(board, { from: 42, path: [28], captured: [35] });
    expect(gameOutcome(next, 2)).toEqual({ over: true, winner: 1 });
  });
});

describe('rules: moveKey', () => {
  it('clave canónica por from/path/captured', () => {
    expect(moveKey({ from: 1, path: [2, 3], captured: [4] })).toBe('1>2-3|4');
    expect(moveKey({ from: 1, path: [2, 3], captured: [] })).toBe('1>2-3|');
    expect(moveKey({ from: 1, path: [2, 3], captured: [4] })).toBe(moveKey({ from: 1, path: [2, 3], captured: [4] }));
    expect(moveKey({ from: 1, path: [2, 3], captured: [4] })).not.toBe(moveKey({ from: 1, path: [3, 2], captured: [4] }));
  });
});
