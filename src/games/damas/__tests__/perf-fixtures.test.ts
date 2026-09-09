import {
  initialBoard,
  parseSetupSeed,
  PERF_BRANCHING_SEED,
  PERF_KINGS_SEED,
  boardFromSquares,
  piece,
} from '../engine/board';
import { gameOutcome, hasCapture, legalMoves, legalMovesForPiece, movablePieceIds } from '../engine/rules';

describe('fixture perf-kings (PLAN-PERFORMANCE §7)', () => {
  const board = initialBoard(PERF_KINGS_SEED);

  it('parseSetupSeed mapea el seed del query param al sentinel', () => {
    expect(parseSetupSeed('perf-kings')).toBe(PERF_KINGS_SEED);
    expect(parseSetupSeed('perf-branching')).toBe(PERF_BRANCHING_SEED);
    expect(parseSetupSeed('test-win')).toBe('__test_win__');
    expect(parseSetupSeed('inexistente')).toBeUndefined();
  });

  it('6 damas del jugador 1 contra 8 peones del jugador 2, sin capturas', () => {
    const own = board.filter((p) => p?.player === 1);
    const rival = board.filter((p) => p?.player === 2);
    expect(own).toHaveLength(6);
    expect(rival).toHaveLength(8);
    expect(own.every((p) => p?.king)).toBe(true);
    expect(rival.every((p) => !p?.king)).toBe(true);
    // Sin capturas: el hot path ejecuta hasCapture global por ficha
    expect(hasCapture(board, 1)).toBe(false);
    expect(hasCapture(board, 2)).toBe(false);
  });

  it('cada dama tiene movimientos legales, p2 tiene avance y la partida está en curso', () => {
    expect(movablePieceIds(board, 1).size).toBe(6);
    expect(legalMoves(board, 1).length).toBeGreaterThan(0);
    // p2 no quedó atrapado: los peones de la fila 6 avanzan a la fila 7
    expect(movablePieceIds(board, 2).size).toBe(4);
    expect(legalMoves(board, 2).length).toBeGreaterThan(0);
    expect(gameOutcome(board, 1)).toEqual({ over: false, winner: null });
    expect(gameOutcome(board, 2)).toEqual({ over: false, winner: null });
  });
});

describe('fixture perf-branching (PLAN-PERFORMANCE §7)', () => {
  const board = initialBoard(PERF_BRANCHING_SEED);

  it('dama rodeada de 5 enemigas con captura obligatoria y cadenas ramificadas', () => {
    expect(board.filter((p) => p?.player === 1)).toHaveLength(1);
    expect(board.filter((p) => p?.player === 2)).toHaveLength(5);
    // Captura obligatoria: todos los movimientos legales de la dama son
    // cadenas de captura (el quiet path no se ejecuta en este fixture).
    expect(hasCapture(board, 1)).toBe(true);
    const moves = legalMoves(board, 1);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.captured.length > 0)).toBe(true);
    // La cadena más larga captura 2 piezas (44 → 26 → 40 es inválida; 26 → 32)
    const maxCaptures = Math.max(...moves.map((m) => m.captured.length));
    expect(maxCaptures).toBe(2);
    expect(gameOutcome(board, 1)).toEqual({ over: false, winner: null });
  });

  it('el aterrizaje 26 abre la continuación hacia 33 (rama de 2 saltos)', () => {
    const multi = legalMoves(board, 1).find((m) => m.captured.length === 2);
    expect(multi).toMatchObject({ from: 44 });
    expect(multi?.path[0]).toBe(26);
    expect(multi?.captured[0]).toBe(35);
    expect(multi?.captured[1]).toBe(33);
  });
});
