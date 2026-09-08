/**
 * IA de los drones antivirus. Decisiones puras y deterministas: ocurren solo
 * cuando una entidad llega al centro de una celda, sobre el RNG seedeado de la
 * partida (seed.ts). Nada de RN ni de render acá.
 *
 * Personalidades (target perseguido en modo chase):
 *   0 Cazador    → celda del robot
 *   1 Emboscador → 4 celdas ahead del robot (corta el paso)
 *   2 Caprichoso → celda del robot, pero ~25% de las decisiones deambula
 *   3 Tímido     → persigue de lejos, huye a su esquina si está cerca
 *
 * En fase scatter todos vuelan a su esquina; en modo power (súper carga del
 * robot) huyen maximizando la distancia al robot.
 */

import {
  DIRECTIONS,
  MAZE_COLS,
  cellDistance,
  neighbor,
  oppositeDirection,
  rowOf,
  colOf,
  toIndex,
  type Direction,
} from './maze';

export type Personality = 0 | 1 | 2 | 3;

export const HOME_CORNERS: readonly number[] = [
  toIndex(1, 1), // Cazador → arriba-izquierda
  toIndex(1, MAZE_COLS - 2), // Emboscador → arriba-derecha
  toIndex(19, 1), // Caprichoso → abajo-izquierda
  toIndex(19, MAZE_COLS - 2), // Tímido → abajo-derecha
];

export const AMBUSH_AHEAD = 4;
export const SHY_DISTANCE = 6;
export const WHIMSICAL_WANDER = 0.25;

export interface DroneDecision {
  cell: number;
  /** dirección actual; no se permite revertir salvo que no quede alternativa */
  dir: Direction | null;
  robotCell: number;
  robotDir: Direction | null;
  powerMode: boolean;
  scatter: boolean;
  personality: Personality;
  rng: () => number;
}

/** Clampa un punto ahead dentro de la grilla (el target no necesita ser camino). */
function aheadCell(robotCell: number, robotDir: Direction | null): number {
  if (!robotDir) return robotCell;
  const steps = { up: { dr: -1, dc: 0 }, down: { dr: 1, dc: 0 }, left: { dr: 0, dc: -1 }, right: { dr: 0, dc: 1 } }[robotDir];
  const row = Math.min(19, Math.max(0, rowOf(robotCell) + steps.dr * AMBUSH_AHEAD));
  const col = Math.min(MAZE_COLS - 1, Math.max(0, colOf(robotCell) + steps.dc * AMBUSH_AHEAD));
  return toIndex(row, col);
}

/** Celda objetivo de la personalidad (solo chase). */
export function chaseTarget(decision: DroneDecision): number {
  switch (decision.personality) {
    case 1:
      return aheadCell(decision.robotCell, decision.robotDir);
    case 3:
      return cellDistance(decision.cell, decision.robotCell) > SHY_DISTANCE
        ? decision.robotCell
        : HOME_CORNERS[3];
    default:
      return decision.robotCell;
  }
}

/** Elige la dirección del drone al llegar a un centro de celda. */
export function chooseDroneDirection(decision: DroneDecision): Direction | null {
  const candidates = DIRECTIONS.filter((dir) => neighbor(decision.cell, dir, false) >= 0);
  if (candidates.length === 0) return decision.dir ? oppositeDirection(decision.dir) : null;

  // No revertir salvo que sea la única opción
  const noReverse = decision.dir
    ? candidates.filter((dir) => dir !== oppositeDirection(decision.dir!))
    : candidates;
  const options = noReverse.length > 0 ? noReverse : candidates;

  if (decision.powerMode) {
    // Huir: maximiza la distancia al robot; algo de azar para que no se predecible
    let best = options[0];
    let bestScore = -Infinity;
    for (const dir of options) {
      const next = neighbor(decision.cell, dir, false)!;
      const score = cellDistance(next, decision.robotCell) + decision.rng() * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = dir;
      }
    }
    return best;
  }

  if (decision.scatter) {
    return closestDirection(decision.cell, options, HOME_CORNERS[decision.personality]);
  }

  if (decision.personality === 2 && decision.rng() < WHIMSICAL_WANDER) {
    return options[Math.floor(decision.rng() * options.length)];
  }

  const target = decision.personality === 2 ? decision.robotCell : chaseTarget(decision);
  return closestDirection(decision.cell, options, target);
}

/** Dirección cuyo vecino minimiza la distancia euclidiana al target. */
function closestDirection(cell: number, options: readonly Direction[], target: number): Direction {
  let best = options[0];
  let bestScore = Infinity;
  for (const dir of options) {
    const next = neighbor(cell, dir, false)!;
    const score = cellDistance(next, target);
    if (score < bestScore) {
      bestScore = score;
      best = dir;
    }
  }
  return best;
}
