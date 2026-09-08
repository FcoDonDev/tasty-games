/**
 * "Game feel" de Wak Wak (PLAN-WAK-WAK-V2 §D4/D5): funciones puras que
 * parametrizan el hit-stop del combo y el slow-mo near-death. El engine NO
 * las consume (el determinismo de la simulación no depende del feel); las
 * aplica el loop de presentación (WakWakScreen) sobre el dt que entrega al
 * motor. Testeadas con Jest.
 */

import { floatPos, wrappedDistance } from './rules';

// --- Hit-stop (celebración del combo) -------------------------------------

export const HITSTOP_BASE_MS = 60;
export const HITSTOP_STEP_MS = 25;
export const HITSTOP_MAX_MS = 150;

/**
 * Duración del hit-stop según la cadena del combo (D4): 60ms + 25ms por
 * eslabón, capada en 150ms — paramétrico porque el hit-stop constante no
 * distingue cadena 1 de cadena 5 (lección de Smash, PLAN §6.N2).
 */
export function hitStopMs(chain: number): number {
  const links = Math.max(1, Math.floor(chain));
  return Math.min(HITSTOP_MAX_MS, HITSTOP_BASE_MS + HITSTOP_STEP_MS * (links - 1));
}

// --- Slow-mo near-death ----------------------------------------------------

/** Radio (en celdas) al que un drone activo dispara el slow-mo (D5). */
export const SLOWMO_RADIUS = 1.2;
/** Escala de tiempo bajo amenaza (mitad de velocidad con rampa en el loop). */
export const SLOWMO_SCALE = 0.5;
/** Rampa de transición del factor de tiempo en el loop (ms de juego real). */
export const SLOWMO_RAMP_MS = 200;

export interface Threat {
  /** distancia euclidiana con wrap horizontal (misma métrica de colisión) */
  distance: number;
  /** ¿el drone se acerca? (su velocidad reduce la distancia) */
  closing: boolean;
}

/**
 * Escala objetivo de dt bajo la amenaza más cercana: 0.5 si hay un drone
 * activo dentro del radio, acercándose y fuera de modo power; 1 en otro caso.
 * El loop suaviza hacia este objetivo con la rampa (lerp temporal).
 */
export function slowMoScale(threats: readonly Threat[], powered: boolean): number {
  if (powered) return 1;
  for (const threat of threats) {
    if (threat.distance <= SLOWMO_RADIUS && threat.closing) return SLOWMO_SCALE;
  }
  return 1;
}

// --- Amenazas (entrada de slowMoScale) -------------------------------------

const DIR_VECTORS: Record<string, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/**
 * Amenazas activas para el slow-mo: drones en roaming/exiting con dirección,
 * su distancia (con wrap, la misma métrica de colisión) y si se acercan
 * (proyección de su velocidad reduce la distancia).
 */
export function threatsOf(state: import('./rules').GameState): Threat[] {
  const robotPos = floatPos(state.robot, false);
  const threats: Threat[] = [];
  for (const drone of state.drones) {
    if (drone.mode !== 'roaming' && drone.mode !== 'exiting') continue;
    if (!drone.dir) continue;
    const dronePos = floatPos(drone, drone.mode === 'exiting');
    const distance = wrappedDistance(robotPos, dronePos);
    const vec = DIR_VECTORS[drone.dir];
    const closing =
      wrappedDistance(
        { x: dronePos.x + vec.dx * 0.1, y: dronePos.y + vec.dy * 0.1 },
        robotPos,
      ) < distance;
    threats.push({ distance, closing });
  }
  return threats;
}
