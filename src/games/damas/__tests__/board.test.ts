import {
  TEST_CAPTURE_SEED,
  TEST_WIN_SEED,
  boardFromSquares,
  colOf,
  forwardDelta,
  initialBoard,
  isDark,
  parseSetupSeed,
  piece,
  promotionRow,
  rowOf,
  toIndex,
} from '../engine/board';

describe('board: geometría', () => {
  it('rowOf/colOf/toIndex son consistentes', () => {
    for (let index = 0; index < 64; index++) {
      expect(toIndex(rowOf(index), colOf(index))).toBe(index);
    }
  });

  it('isDark: paridad impar de fila+columna', () => {
    expect(isDark(0)).toBe(false); // esquina sup. izquierda es clara
    expect(isDark(1)).toBe(true);
    expect(isDark(63)).toBe(false);
    expect(isDark(62)).toBe(true);
    expect(isDark(28)).toBe(true); // r3,c4
  });

  it('promoción y avance por jugador', () => {
    expect(promotionRow(1)).toBe(0);
    expect(promotionRow(2)).toBe(7);
    expect(forwardDelta(1)).toBe(-1);
    expect(forwardDelta(2)).toBe(1);
  });
});

describe('board: reparto estándar', () => {
  const board = initialBoard();

  it('24 fichas: 12 por bando', () => {
    expect(board.filter(Boolean)).toHaveLength(24);
    expect(board.filter((p) => p?.player === 1)).toHaveLength(12);
    expect(board.filter((p) => p?.player === 2)).toHaveLength(12);
  });

  it('todas las fichas sobre casillas oscuras', () => {
    for (const item of board) {
      if (item) expect(isDark(board.indexOf(item))).toBe(true);
    }
  });

  it('jugador 1 en filas 5–7, jugador 2 en filas 0–2', () => {
    for (const item of board) {
      if (!item) continue;
      const row = rowOf(board.indexOf(item));
      if (item.player === 1) expect(row).toBeGreaterThanOrEqual(5);
      else expect(row).toBeLessThanOrEqual(2);
    }
  });

  it('ids únicos y estables', () => {
    const ids = board.filter(Boolean).map((p) => p!.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('1-1');
    expect(ids).toContain('2-12');
  });
});

describe('board: seeds sentinelas E2E', () => {
  it('parseSetupSeed mapea los valores del query param', () => {
    expect(parseSetupSeed('test-capture')).toBe(TEST_CAPTURE_SEED);
    expect(parseSetupSeed('test-win')).toBe(TEST_WIN_SEED);
    expect(parseSetupSeed(undefined)).toBeUndefined();
    expect(parseSetupSeed('otro')).toBeUndefined();
  });

  it('test-capture: captura obligatoria 42→35→28 con juego que continúa', () => {
    const board = initialBoard(TEST_CAPTURE_SEED);
    expect(board[42]?.id).toBe('1-a');
    expect(board[44]?.id).toBe('1-b');
    expect(board[35]?.id).toBe('2-a');
    expect(board[24]?.id).toBe('2-b');
    expect(board[28]).toBeNull();
  });

  it('test-win: un solo movimiento captura la última ficha del jugador 2', () => {
    const board = initialBoard(TEST_WIN_SEED);
    expect(board[42]?.player).toBe(1);
    expect(board[35]?.player).toBe(2);
    expect(board.filter((p) => p?.player === 2)).toHaveLength(1);
  });
});

describe('board: tableros artesanales', () => {
  it('boardFromSquares rechaza casillas claras y fuera de rango', () => {
    expect(() => boardFromSquares([[0, piece(1, false, 'a')]])).toThrow();
    expect(() => boardFromSquares([[64, piece(1, false, 'a')]])).toThrow();
    expect(() => boardFromSquares([[-1, piece(1, false, 'a')]])).toThrow();
  });

  it('boardFromSquares coloca fichas y deja el resto vacío', () => {
    const board = boardFromSquares([[42, piece(1, true, 'x')]]);
    expect(board.filter(Boolean)).toHaveLength(1);
    expect(board[42]).toEqual({ id: '1-x', player: 1, king: true });
  });
});
