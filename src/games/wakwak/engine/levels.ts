/**
 * Niveles progresivos de Wak Wak (PLAN-WAK-WAK-V2 §D2). Config de dificultad
 * por nivel: velocidades, duración de power/fases y salida del corral — la
 * dirección de cada knob sigue al Pac-Man Dossier (velocidades de fantasmas
 * suben, frightened se encorta, scatter se acorta) con números propios.
 *
 * Escala: nivel 1 MÁS fácil que el MVP; el nivel 3 reproduce los números del
 * MVP (robot 5.5, drones 4.6, power 6s...); nivel 8 más duro que el MVP. El
 * laberinto es el mismo para todos (candear 8 layouts propios queda fuera).
 *
 * Módulo puro: sin RN, determinista, testeado con Jest.
 */

export interface LevelSpeeds {
  robot: number;
  droneChase: number;
  droneFrightened: number;
  droneCorral: number;
}

export interface LevelConfig {
  /** 1-based */
  level: number;
  /** velocidades en celdas/segundo */
  speeds: LevelSpeeds;
  /** duración del modo power (súper carga) en ms */
  powerMs: number;
  scatterMs: number;
  chaseMs: number;
  /** ms hasta que sale el primer drone del corral; luego +stagger por drone */
  releaseBase: number;
  releaseStagger: number;
  /**
   * "Cruise Elroy": si la fracción de comestibles restantes baja de este
   * umbral, el Cazador (personalidad 0) acelera ×`elroyBoost` (solo chase,
   * fuera de power). null = desactivado.
   */
  elroyThreshold: number | null;
  elroyBoost: number;
}

export const LEVELS: readonly LevelConfig[] = [
  {
    level: 1,
    speeds: { robot: 5.4, droneChase: 4.1, droneFrightened: 3.0, droneCorral: 2.6 },
    powerMs: 8000,
    scatterMs: 7000,
    chaseMs: 15000,
    releaseBase: 2500,
    releaseStagger: 4500,
    elroyThreshold: null,
    elroyBoost: 1,
  },
  {
    level: 2,
    speeds: { robot: 5.45, droneChase: 4.35, droneFrightened: 3.1, droneCorral: 2.7 },
    powerMs: 7500,
    scatterMs: 6500,
    chaseMs: 15000,
    releaseBase: 2000,
    releaseStagger: 4000,
    elroyThreshold: 0.15,
    elroyBoost: 1.05,
  },
  {
    // Nivel 3 = números del MVP (referencia de balance)
    level: 3,
    speeds: { robot: 5.5, droneChase: 4.6, droneFrightened: 3.2, droneCorral: 3 },
    powerMs: 6000,
    scatterMs: 5000,
    chaseMs: 15000,
    releaseBase: 1200,
    releaseStagger: 2500,
    elroyThreshold: 0.12,
    elroyBoost: 1.05,
  },
  {
    level: 4,
    speeds: { robot: 5.55, droneChase: 4.7, droneFrightened: 3.3, droneCorral: 2.8 },
    powerMs: 5500,
    scatterMs: 4500,
    chaseMs: 16000,
    releaseBase: 1000,
    releaseStagger: 2200,
    elroyThreshold: 0.12,
    elroyBoost: 1.05,
  },
  {
    level: 5,
    speeds: { robot: 5.6, droneChase: 4.8, droneFrightened: 3.4, droneCorral: 2.9 },
    powerMs: 5000,
    scatterMs: 4000,
    chaseMs: 17000,
    releaseBase: 800,
    releaseStagger: 2000,
    elroyThreshold: 0.1,
    elroyBoost: 1.05,
  },
  {
    level: 6,
    speeds: { robot: 5.7, droneChase: 4.9, droneFrightened: 3.5, droneCorral: 3 },
    powerMs: 4500,
    scatterMs: 3500,
    chaseMs: 18000,
    releaseBase: 600,
    releaseStagger: 1800,
    elroyThreshold: 0.1,
    elroyBoost: 1.06,
  },
  {
    level: 7,
    speeds: { robot: 5.8, droneChase: 5.0, droneFrightened: 3.6, droneCorral: 3.1 },
    powerMs: 4000,
    scatterMs: 3000,
    chaseMs: 19000,
    releaseBase: 500,
    releaseStagger: 1500,
    elroyThreshold: 0.08,
    elroyBoost: 1.06,
  },
  {
    level: 8,
    speeds: { robot: 5.9, droneChase: 5.15, droneFrightened: 3.8, droneCorral: 3.2 },
    powerMs: 3500,
    scatterMs: 2500,
    chaseMs: 20000,
    releaseBase: 400,
    releaseStagger: 1200,
    elroyThreshold: 0.08,
    elroyBoost: 1.06,
  },
] as const;

export const MAX_LEVEL = LEVELS.length;

/** Config del nivel (1-based), clampeada al rango válido. */
export function levelConfig(level: number): LevelConfig {
  const clamped = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  return LEVELS[clamped - 1];
}
