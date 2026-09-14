import {
  beginFloatingDrag,
  FLOAT_THRESHOLD,
  keyToDirection,
  SWIPE_MIN_DISTANCE,
  swipeToDirection,
  updateFloatingDrag,
} from '../engine/controls';

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
    // Diagonal perfecta: empate → vertical (homologado con WakWak).
    expect(swipeToDirection(50, 50)).toBe('down');
  });

  test('gesto flotante: emite al cruzar el umbral y re-centra', () => {
    let drag = beginFloatingDrag(100, 100);
    expect(drag.dir).toBeNull();
    // Bajo el umbral: mismo objeto, sin dirección.
    expect(updateFloatingDrag(drag, 100 + FLOAT_THRESHOLD - 1, 100)).toBe(drag);
    drag = updateFloatingDrag(drag, 100 + FLOAT_THRESHOLD, 100);
    expect(drag.dir).toBe('right');
    // Re-centrado: el próximo tramo se mide desde el commit.
    expect(drag.ox).toBe(100 + FLOAT_THRESHOLD);
    // Perpendicular inmediata con un mini-swipe (histéresis fresca).
    drag = updateFloatingDrag(drag, drag.ox, drag.oy + FLOAT_THRESHOLD);
    expect(drag.dir).toBe('down');
    // Diagonal: eje dominante (empate → vertical, homologado con WakWak).
    drag = beginFloatingDrag(0, 0);
    drag = updateFloatingDrag(drag, 50, 50);
    expect(drag.dir).toBe('down');
  });
});
