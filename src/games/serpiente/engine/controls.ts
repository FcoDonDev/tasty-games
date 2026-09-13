/**
 * Input por plataforma (D9): teclado flechas+WASD en PC web, swipe + control
 * flotante re-centrado en táctil (la pantalla traduce el gesto a dx/dy).
 * Funciones puras: de evento bruto a `Direction`.
 */

import type { Direction } from './grid';

const KEY_DIRS: Record<string, Direction> = {
  arrowup: 'up',
  w: 'up',
  arrowdown: 'down',
  s: 'down',
  arrowleft: 'left',
  a: 'left',
  arrowright: 'right',
  d: 'right',
};

/** `KeyboardEvent.key` → dirección, o `undefined` si no es tecla de juego. */
export function keyToDirection(key: string): Direction | undefined {
  return KEY_DIRS[key.toLowerCase()];
}

/** Distancia mínima (px) para que un swipe cuente como giro. */
export const SWIPE_MIN_DISTANCE = 24;

/** Desplazamiento (dx, dy) en px → dirección dominante, o `undefined`. */
export function swipeToDirection(dx: number, dy: number, minDistance = SWIPE_MIN_DISTANCE): Direction | undefined {
  if (Math.hypot(dx, dy) < minDistance) return undefined;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}
