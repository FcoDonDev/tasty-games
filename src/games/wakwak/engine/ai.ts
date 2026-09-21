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
  MAZE,
  cellDistance,
  colOf,
  neighbor,
  oppositeDirection,
  rowOf,
  toIndex,
  type MazeData,
  type Direction,
} from './maze';

export type Personality = 0 | 1 | 2 | 3;

/**
 * Esquinas scatter del modo: función del maze (T4a) — en el layout fácil las
 * constantes de módulo (fila 19, col 17) quedan FUERA de grilla.
 */
export function homeCorners(maze: MazeData): readonly number[] {
  return [
    toIndex(1, 1, maze.cols), // Cazador → arriba-izquierda
    toIndex(1, maze.cols - 2, maze.cols), // Emboscador → arriba-derecha
    toIndex(maze.rows - 2, 1, maze.cols), // Caprichoso → abajo-izquierda
    toIndex(maze.rows - 2, maze.cols - 2, maze.cols), // Tímido → abajo-derecha
  ];
}

/** Esquinas del modo normal (back-compat: tests y previews las consumen). */
export const HOME_CORNERS: readonly number[] = homeCorners(MAZE);

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
  /** laberinto del modo activo: targets y vecinos salen de acá (T4a) */
  maze: MazeData;
}

/** Clampa un punto ahead dentro de la grilla (el target no necesita ser camino). */
function aheadCell(robotCell: number, robotDir: Direction | null, maze: MazeData): number {
  if (!robotDir) return robotCell;
  const steps = { up: { dr: -1, dc: 0 }, down: { dr: 1, dc: 0 }, left: { dr: 0, dc: -1 }, right: { dr: 0, dc: 1 } }[robotDir];
  const row = Math.min(maze.rows - 2, Math.max(0, rowOf(robotCell, maze.cols) + steps.dr * AMBUSH_AHEAD));
  const col = Math.min(maze.cols - 1, Math.max(0, colOf(robotCell, maze.cols) + steps.dc * AMBUSH_AHEAD));
  return toIndex(row, col, maze.cols);
}

/** Celda objetivo de la personalidad (solo chase). */
export function chaseTarget(decision: DroneDecision): number {
  switch (decision.personality) {
    case 1:
      return aheadCell(decision.robotCell, decision.robotDir, decision.maze);
    case 3:
      return cellDistance(decision.cell, decision.robotCell, decision.maze.cols) > SHY_DISTANCE
        ? decision.robotCell
        : homeCorners(decision.maze)[3];
    default:
      return decision.robotCell;
  }
}

/** Elige la dirección del drone al llegar a un centro de celda. */
export function chooseDroneDirection(decision: DroneDecision): Direction | null {
  const maze = decision.maze;
  const candidates = DIRECTIONS.filter((dir) => neighbor(decision.cell, dir, false, maze) >= 0);
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
      const next = neighbor(decision.cell, dir, false, maze)!;
      const score = cellDistance(next, decision.robotCell, maze.cols) + decision.rng() * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = dir;
      }
    }
    return best;
  }

  if (decision.scatter) {
    return closestDirection(decision.cell, options, homeCorners(maze)[decision.personality], maze);
  }

  if (decision.personality === 2 && decision.rng() < WHIMSICAL_WANDER) {
    return options[Math.floor(decision.rng() * options.length)];
  }

  const target = decision.personality === 2 ? decision.robotCell : chaseTarget(decision);
  return closestDirection(decision.cell, options, target, maze);
}

/** Dirección cuyo vecino minimiza la distancia euclidiana al target. */
function closestDirection(
  cell: number,
  options: readonly Direction[],
  target: number,
  maze: MazeData,
): Direction {
  let best = options[0];
  let bestScore = Infinity;
  for (const dir of options) {
    const next = neighbor(cell, dir, false, maze)!;
    const score = cellDistance(next, target, maze.cols);
    if (score < bestScore) {
      bestScore = score;
      best = dir;
    }
  }
  return best;
}
