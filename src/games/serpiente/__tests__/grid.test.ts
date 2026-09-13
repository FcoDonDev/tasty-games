import {
  CELL_COUNT,
  colOf,
  GRID_COLS,
  GRID_ROWS,
  manhattan,
  opposite,
  rowOf,
  stepIndex,
  toIndex,
  type Direction,
} from '../engine/grid';

describe('grid serpiente 20×20', () => {
  test('índices row-major con roundtrip', () => {
    expect(GRID_COLS).toBe(20);
    expect(GRID_ROWS).toBe(20);
    expect(CELL_COUNT).toBe(400);
    for (const index of [0, 1, 19, 20, 199, 399]) {
      expect(toIndex(rowOf(index), colOf(index))).toBe(index);
    }
  });

  test('opposite cubre las 4 direcciones', () => {
    const cases: Array<[Direction, Direction]> = [
      ['up', 'down'],
      ['down', 'up'],
      ['left', 'right'],
      ['right', 'left'],
    ];
    for (const [dir, expected] of cases) expect(opposite(dir)).toBe(expected);
  });

  test('stepIndex con wrap atraviesa el borde', () => {
    expect(stepIndex(toIndex(0, 5), 'up', true)).toBe(toIndex(19, 5));
    expect(stepIndex(toIndex(10, 0), 'left', true)).toBe(toIndex(10, 19));
    expect(stepIndex(toIndex(19, 19), 'down', true)).toBe(toIndex(0, 19));
    expect(stepIndex(toIndex(10, 10), 'right', true)).toBe(toIndex(10, 11));
  });

  test('stepIndex sin wrap devuelve -1 fuera del tablero', () => {
    expect(stepIndex(toIndex(0, 5), 'up', false)).toBe(-1);
    expect(stepIndex(toIndex(10, 0), 'left', false)).toBe(-1);
    expect(stepIndex(toIndex(10, 10), 'right', false)).toBe(toIndex(10, 11));
  });

  test('manhattan', () => {
    expect(manhattan(toIndex(0, 0), toIndex(3, 4))).toBe(7);
    expect(manhattan(toIndex(5, 5), toIndex(5, 5))).toBe(0);
  });
});
