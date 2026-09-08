import type { Direction } from './maze';

/**
 * Control de direcciones (PURO): mapeo de gestos → Direction, sin RN.
 * WakWakScreen lo consume desde los handlers del gesto Pan; el engine solo
 * recibe `setDirection` (buffer) y no sabe de dónde vino el input.
 */

/** Umbral (px de desplazamiento) para emitir una dirección. */
export const SWIPE_THRESHOLD = 24;

/** Eje dominante del delta: horizontal si `|dx| > |dy|` (empate → vertical). */
function dominantDirection(dx: number, dy: number): Direction {
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}

/**
 * Swipe "clásico" (una dirección por gesto): dirección dominante del delta
 * total respecto del punto de inicio, o null si no cruza el umbral.
 */
export function directionFromSwipe(dx: number, dy: number, threshold: number = SWIPE_THRESHOLD): Direction | null {
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return null;
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
 */
export function beginFloatingDrag(x: number, y: number): FloatingDrag {
  return { ox: x, oy: y, dir: null };
}

/**
 * Avanza el gesto flotante con el punto actual del dedo.
 *
 * Re-centrado en cada commit (histéresis implícita): al emitir una dirección
 * el origen salta al punto actual, de modo que el próximo cambio exige un
 * desplazamiento fresco de `threshold` px. Girar a la perpendicular cuesta un
 * mini-swipe; invertir la dirección cuesta volver a cruzar el origen (ida y
 * vuelta ≥ 2×threshold) — sin jitter en diagonales ni direcciones falsas.
 */
export function updateFloatingDrag(
  drag: FloatingDrag,
  x: number,
  y: number,
  threshold: number = SWIPE_THRESHOLD,
): FloatingDrag {
  const dx = x - drag.ox;
  const dy = y - drag.oy;
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return drag;
  return { ox: x, oy: y, dir: dominantDirection(dx, dy) };
}
