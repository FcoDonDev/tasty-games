import { keyToDirection, SWIPE_MIN_DISTANCE, swipeToDirection } from '../engine/controls';

describe('controls serpiente', () => {
  test('flechas + WASD (mayúsculas y minúsculas)', () => {
    expect(keyToDirection('ArrowUp')).toBe('up');
    expect(keyToDirection('w')).toBe('up');
    expect(keyToDirection('W')).toBe('up');
    expect(keyToDirection('ArrowDown')).toBe('down');
    expect(keyToDirection('s')).toBe('down');
    expect(keyToDirection('ArrowLeft')).toBe('left');
    expect(keyToDirection('a')).toBe('left');
    expect(keyToDirection('ArrowRight')).toBe('right');
    expect(keyToDirection('d')).toBe('right');
  });

  test('teclas ajenas no mapean', () => {
    expect(keyToDirection(' ')).toBeUndefined();
    expect(keyToDirection('Enter')).toBeUndefined();
    expect(keyToDirection('q')).toBeUndefined();
  });

  test('swipe usa el eje dominante con umbral', () => {
    expect(swipeToDirection(100, 10)).toBe('right');
    expect(swipeToDirection(-100, 10)).toBe('left');
    expect(swipeToDirection(10, 100)).toBe('down');
    expect(swipeToDirection(10, -100)).toBe('up');
    expect(swipeToDirection(5, 5)).toBeUndefined();
    expect(swipeToDirection(SWIPE_MIN_DISTANCE, 0)).toBe('right');
    expect(swipeToDirection(SWIPE_MIN_DISTANCE - 1, 0)).toBeUndefined();
  });
});
