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

/** Umbral del gesto flotante (re-centrado por commit). */
export const FLOAT_THRESHOLD = 24;

/** Eje dominante del delta (empate → vertical). */
function dominantDirection(dx: number, dy: number): Direction {
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}

/** Desplazamiento (dx, dy) en px → dirección dominante, o `undefined`. */
export function swipeToDirection(dx: number, dy: number, minDistance = SWIPE_MIN_DISTANCE): Direction | undefined {
  if (Math.hypot(dx, dy) < minDistance) return undefined;
  return dominantDirection(dx, dy);
}

/** Estado del gesto flotante: origen vigente (re-centrado) y dirección emitida. */
export interface FloatingDrag {
  /** Punto desde el que se mide el próximo tramo. */
  ox: number;
  oy: number;
  /** Dirección emitida en el tramo vigente (null = esperando el primer tramo). */
  dir: Direction | null;
}

/**
 * Inicia el gesto flotante en el punto de contacto (control invisible: el
 * "pad" nace donde apoya el dedo, en cualquier parte de la pantalla).
 * Duplicado propio por la regla de aislamiento (ver wakwak `controls.ts`).
 */
export function beginFloatingDrag(x: number, y: number): FloatingDrag {
  return { ox: x, oy: y, dir: null };
}

/**
 * Avanza el gesto flotante con el punto actual del dedo. Re-centrado en cada
 * commit (histéresis implícita): el próximo cambio exige un desplazamiento
 * fresco de `threshold` px — sin jitter en diagonales ni direcciones falsas.
 */
export function updateFloatingDrag(
  drag: FloatingDrag,
  x: number,
  y: number,
  threshold: number = FLOAT_THRESHOLD,
): FloatingDrag {
  const dx = x - drag.ox;
  const dy = y - drag.oy;
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return drag;
  return { ox: x, oy: y, dir: dominantDirection(dx, dy) };
}
