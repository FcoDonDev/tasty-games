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

// --- Secuencia de muerte (PLAN-WAK-POLISH F5) ------------------------------

/**
 * Duración del mini-clip de destrucción del robot (visual-only: congela el dt
 * del loop igual que el hit-stop, única instancia). La derrota definitiva usa
 * la versión extendida. Tras el clip, RECOVER_MS anima el zoom de vuelta
 * (present sigue congelado durante el recover para que el respawn no se vea
 * teletransportar a mitad del zoom). Iteración con el usuario: el freeze se
 * extendió (900→1300 / 1100→1500) y el clip arranca con un FRAME DE IMPACTO
 * (dim+zoom solos, ~250ms) antes de la explosión — el "time stop" se sentía
 * tapado por la animación cuando todo arrancaba junto.
 */
export const DEATH_FREEZE_MS = 1300;
export const DEATH_FREEZE_FINAL_MS = 1500;
export const DEATH_RECOVER_MS = 250;

// --- Near-death: slow-mo continuo + zoom progresivo (v3, aprobado) ----------

/**
 * Radio (en celdas) dentro del que un drone activo que se acerca dispara el
 * slow-mo/zoom de muerte inminente (v3: ampliado 1.2 → 2.6 — el usuario quiere
 * SENTIR la desaceleración antes).
 */
export const SLOWMO_RADIUS = 2.6;
/**
 * Distancia (en celdas) a la que el efecto llega a su punto máximo: más cerca
 * de este valor no desacelera más (la colisión es ≤0.7).
 */
export const SLOWMO_PEAK_DISTANCE = 0.7;
/**
 * Escala de dt mínima (muy cerca de morir). Antes era un salto binario a 0.5;
 * ahora la escala es CONTINUA: más cerca = más lento, hasta este mínimo.
 */
export const SLOWMO_MIN_SCALE = 0.35;
/**
 * Zoom máximo de muerte inminente (lineal en el mismo radio, solo render:
 * shared value escrita por frame desde el loop, cero setState).
 */
export const THREAT_MAX_ZOOM = 1.12;
/** Rampa de transición del factor de tiempo en el loop (ms de juego real). */
export const SLOWMO_RAMP_MS = 200;

export interface Threat {
  /** distancia euclidiana con wrap horizontal (misma métrica de colisión) */
  distance: number;
  /** ¿el drone se acerca? (su velocidad reduce la distancia) */
  closing: boolean;
}

/**
 * Escala objetivo de dt bajo la amenaza más cercana (v3, CONTINUA): mientras
 * más cerca esté el drone más cercano que se aproxime, más lento el tiempo —
 * 1.0 en el borde del radio, `SLOWMO_MIN_SCALE` (0.35) a distancia de colisión.
 * El loop suaviza hacia este objetivo con la rampa (lerp temporal).
 */
export function slowMoScale(threats: readonly Threat[], powered: boolean): number {
  if (powered) return 1;
  let scale = 1;
  for (const threat of threats) {
    if (!threat.closing) continue;
    scale = Math.min(scale, scaleForDistance(threat.distance));
  }
  return scale;
}

/** Escala de tiempo para una distancia dada (1 fuera del radio; continua). */
function scaleForDistance(distance: number): number {
  if (distance >= SLOWMO_RADIUS) return 1;
  if (distance <= SLOWMO_PEAK_DISTANCE) return SLOWMO_MIN_SCALE;
  const t = (SLOWMO_RADIUS - distance) / (SLOWMO_RADIUS - SLOWMO_PEAK_DISTANCE);
  return 1 - (1 - SLOWMO_MIN_SCALE) * t;
}

/**
 * Zoom objetivo del tablero por muerte inminente (v3, puro): 1 fuera del
 * radio, hasta THREAT_MAX_ZOOM a distancia de colisión — MISMA curva que el
 * slow-mo (ambos suben juntos). Solo render: el engine no cambia.
 * Handoff al clip de muerte: el clip anima DESDE el valor vigente.
 */
export function threatZoom(threats: readonly Threat[], powered: boolean): number {
  if (powered) return 1;
  let zoom = 1;
  for (const threat of threats) {
    if (!threat.closing || threat.distance >= SLOWMO_RADIUS) continue;
    const proximity =
      threat.distance <= SLOWMO_PEAK_DISTANCE
        ? 1
        : (SLOWMO_RADIUS - threat.distance) / (SLOWMO_RADIUS - SLOWMO_PEAK_DISTANCE);
    zoom = Math.max(zoom, 1 + (THREAT_MAX_ZOOM - 1) * proximity);
  }
  return zoom;
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
