/**
 * Reglas de Wak Wak: simulación por ticks fijos, 100% pura y determinista.
 * El render consume posiciones interpoladas (`floatPos`); la UI de React solo
 * se entera de eventos discretos (`GameEvent`). El loop en sí vive en el
 * adaptador de render (ADR 0009) y llama a `advance(state, dtMs)`.
 *
 * Modelo de movimiento en grilla: cada entidad está EN una celda y AVANZA hacia
 * la vecina (`dir`) con progreso 0..1. Las decisiones (giro del robot, IA del
 * drone) ocurren al llegar al centro de la celda. El túnel hace wrap.
 */

import {
  MAZE,
  MAZE_COLS,
  colOf,
  isCorralCell,
  neighbor,
  oppositeDirection,
  toIndex,
  type Direction,
} from './maze';
import { chooseDroneDirection, type Personality } from './ai';
import type { SeedConfig } from './seed';
import { mulberry32 } from './seed';

// --- Constantes de juego -------------------------------------------------

export const TICK_MS = 1000 / 60;

/** Velocidades en celdas/segundo. */
export const SPEEDS = {
  robot: 5.5,
  droneChase: 4.6,
  droneFrightened: 3.2,
  droneCorral: 3,
} as const;

export const SCORE_BATTERY = 10;
export const SCORE_SUPER = 50;
export const SCORE_DRONE = 200;
export const SCORE_BONUS = 100;
export const SCORE_LIFE_BONUS = 100;

export const POWER_MS = 6000;
export const SCATTER_MS = 5000;
export const CHASE_MS = 15000;
export const RESPAWN_MS = 6000;
export const BONUS_WINDOW_MS = 10000;
export const BONUS_TRIGGER = 0.5; // fracción de comestibles que activa el chip

/** Celda del chip dorado: camino SIN batería (el pickup corre cada tick mientras
 * el robot está en la celda; si tuviera batería se la comería antes que el chip). */
export const BONUS_CELL = toIndex(11, 9);

// --- Tipos ---------------------------------------------------------------

export interface Robot {
  cell: number;
  dir: Direction | null;
  /** 0..1 hacia la celda vecina en `dir` */
  progress: number;
  /** dirección deseada; se aplica al llegar al centro de la celda */
  queued: Direction | null;
}

export type DroneMode = 'waiting' | 'exiting' | 'roaming' | 'eaten';

export interface Drone {
  id: number;
  personality: Personality;
  cell: number;
  dir: Direction | null;
  progress: number;
  mode: DroneMode;
  /** ms de juego en que sale del corral (waiting → exiting) */
  releaseAt: number;
  /** ms de juego en que reaparece (mode eaten); null si activo */
  respawnAt: number | null;
}

export type GameStatus = 'playing' | 'won' | 'lost';

export interface GameState {
  robot: Robot;
  drones: Drone[];
  /** celdas con batería restante (ordenadas) */
  batteries: number[];
  /** celdas con súper batería restante */
  supers: number[];
  score: number;
  lives: number;
  /** comestibles consumidos (baterías + súper; el chip no cuenta) */
  eaten: number;
  totalEdibles: number;
  /** reloj de juego acumulado en ms */
  elapsedMs: number;
  /** ms de juego en que termina el modo power; null si inactivo */
  powerUntil: number | null;
  phase: 'scatter' | 'chase';
  phaseUntil: number;
  /** chip dorado: activo con vencimiento; null = inactivo */
  bonus: { expiresAt: number } | null;
  /** el chip ya se usó o expiró en esta partida */
  bonusTaken: boolean;
  status: GameStatus;
  /** ms de juego al terminar; null mientras se juega */
  finishedAt: number | null;
  /** residuo de dt para mantener el paso fijo */
  remainderMs: number;
  /** RNG de la partida (determinista dado el seed) */
  rng: () => number;
  seedLabel: string;
}

export type GameEvent =
  | 'battery'
  | 'super'
  | 'droneEaten'
  | 'caught'
  | 'bonusSpawn'
  | 'bonusTaken'
  | 'bonusExpired'
  | 'won'
  | 'lost';

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}

// --- helpers de movimiento ----------------------------------------------

interface Mover {
  cell: number;
  dir: Direction | null;
  progress: number;
}

function droneSpeed(drone: Drone, powerMode: boolean): number {
  if (drone.mode === 'waiting' || drone.mode === 'eaten') return 0;
  if (drone.mode === 'exiting' || isCorralCell(drone.cell)) return SPEEDS.droneCorral;
  return powerMode ? SPEEDS.droneFrightened : SPEEDS.droneChase;
}

/**
 * Avanza una entidad durante dtSec. Al llegar al centro de una celda consulta
 * `nextDir(cell)` por la dirección a seguir; null = se detiene.
 */
function moveEntity(
  entity: Mover,
  dtSec: number,
  speed: number,
  nextDir: (cell: number) => Direction | null,
  canUseDoor: () => boolean,
): void {
  if (!entity.dir || speed <= 0) return;
  let progress = entity.progress + speed * dtSec;
  while (progress >= 1) {
    const target = neighbor(entity.cell, entity.dir, canUseDoor());
    if (target < 0) {
      progress = 0;
      break;
    }
    progress -= 1;
    entity.cell = target;
    const dir = nextDir(target);
    if (!dir || neighbor(target, dir, canUseDoor()) < 0) {
      entity.dir = null;
      entity.progress = 0;
      return;
    }
    entity.dir = dir;
  }
  entity.progress = progress;
}

/** Invierte la marcha (reversa del swipe, cambio de fase o activación de power). */
function reverseEntity(entity: Mover, canUseDoor: boolean): void {
  if (!entity.dir) return;
  if (entity.progress <= 0) {
    const back = oppositeDirection(entity.dir);
    if (neighbor(entity.cell, back, canUseDoor) >= 0) entity.dir = back;
    return;
  }
  const target = neighbor(entity.cell, entity.dir, canUseDoor);
  if (target < 0) {
    entity.dir = null;
    entity.progress = 0;
    return;
  }
  entity.cell = target;
  entity.dir = oppositeDirection(entity.dir);
  entity.progress = 1 - entity.progress;
}

/** Posición interpolada en unidades de celda (para render y colisiones). */
export function floatPos(entity: Mover, canUseDoor: boolean): { x: number; y: number } {
  const baseX = colOf(entity.cell) + 0.5;
  const baseY = Math.floor(entity.cell / MAZE_COLS) + 0.5;
  if (!entity.dir || entity.progress <= 0) return { x: baseX, y: baseY };
  const target = neighbor(entity.cell, entity.dir, canUseDoor);
  if (target < 0) return { x: baseX, y: baseY };
  const tx = colOf(target) + 0.5;
  const ty = Math.floor(target / MAZE_COLS) + 0.5;
  // wrap de túnel: interpolar hacia fuera del borde, no cruzar todo el mapa
  const wrapped = Math.abs(tx - baseX) > 1;
  const dx = wrapped ? (colOf(entity.cell) === 0 ? -1 : 1) : tx - baseX;
  return { x: baseX + dx * entity.progress, y: baseY + (ty - baseY) * entity.progress };
}

/** Distancia con wrap horizontal (para colisiones en el túnel). */
function wrappedDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  let dx = Math.abs(a.x - b.x);
  if (dx > MAZE_COLS / 2) dx = MAZE_COLS - dx;
  return Math.hypot(dx, a.y - b.y);
}

// --- snapshot para el puerto de render (renderer/types.ts) ---------------

export interface PoseData {
  x: number;
  y: number;
  dir: Direction | null;
}

/** Poses interpoladas del frame; consumido por el adaptador de render. */
export function worldSnapshot(state: GameState): {
  robot: PoseData & { powered: boolean };
  drones: Array<PoseData & { id: number; mode: DroneMode; powered: boolean }>;
  remaining: number;
} {
  const powered = state.powerUntil !== null;
  return {
    robot: { ...floatPos(state.robot, false), dir: state.robot.dir, powered },
    drones: state.drones.map((d) => ({
      id: d.id,
      ...floatPos(d, d.mode === 'exiting'),
      dir: d.dir,
      mode: d.mode,
      powered,
    })),
    remaining: state.totalEdibles > 0 ? 1 - state.eaten / state.totalEdibles : 0,
  };
}

// --- creación de partida -------------------------------------------------

const PERSONALITIES: readonly Personality[] = [0, 1, 2, 3];

export function createGameState(config: SeedConfig): GameState {
  return {
    robot: { cell: MAZE.robotSpawn, dir: null, progress: 0, queued: null },
    drones: MAZE.droneSpawns.map((cell, i) => ({
      id: i,
      personality: PERSONALITIES[i],
      cell,
      dir: null,
      progress: 0,
      mode: 'waiting' as DroneMode,
      releaseAt: config.releaseBase + i * config.releaseStagger,
      respawnAt: null,
    })),
    batteries: [...config.batteryCells].sort((a, b) => a - b),
    supers: [...config.superCells].sort((a, b) => a - b),
    score: 0,
    lives: 3,
    eaten: 0,
    totalEdibles: config.batteryCells.length + config.superCells.length,
    elapsedMs: 0,
    powerUntil: null,
    phase: 'scatter',
    phaseUntil: SCATTER_MS,
    bonus: null,
    bonusTaken: false,
    status: 'playing',
    finishedAt: null,
    remainderMs: 0,
    rng: mulberry32(config.rngSeed),
    seedLabel: config.label,
  };
}

// --- input del robot -----------------------------------------------------

/** Registra una dirección deseada (swipe/teclado). Reversa inmediata si aplica. */
export function queueDirection(state: GameState, dir: Direction): GameState {
  const robot = state.robot;
  if (robot.dir && dir === oppositeDirection(robot.dir)) {
    const reversed = { ...robot };
    reverseEntity(reversed, false);
    return { ...state, robot: reversed };
  }
  if (!robot.dir) {
    if (neighbor(robot.cell, dir, false) >= 0) {
      return { ...state, robot: { ...robot, dir, progress: 0, queued: null } };
    }
    return { ...state, robot: { ...robot, queued: dir } };
  }
  return { ...state, robot: { ...robot, queued: dir } };
}

// --- tick ----------------------------------------------------------------

export function advance(state: GameState, dtMs: number): StepResult {
  if (state.status !== 'playing') return { state, events: [] };
  const events: GameEvent[] = [];
  let current = state;
  let remainder = current.remainderMs + dtMs;
  let guard = 0;
  while (remainder >= TICK_MS && guard < 8) {
    const result = step(current, TICK_MS);
    events.push(...result.events);
    current = result.state;
    remainder -= TICK_MS;
    guard++;
  }
  return { state: { ...current, remainderMs: remainder }, events };
}

function step(state: GameState, dtMs: number): StepResult {
  const events: GameEvent[] = [];
  const elapsed = state.elapsedMs + dtMs;
  const dtSec = dtMs / 1000;

  // --- fases scatter/chase (solo alternan fuera del modo power)
  let phase = state.phase;
  let phaseUntil = state.phaseUntil;
  let drones = state.drones;
  if (state.powerUntil === null && elapsed >= phaseUntil) {
    phase = phase === 'scatter' ? 'chase' : 'scatter';
    phaseUntil = elapsed + (phase === 'scatter' ? SCATTER_MS : CHASE_MS);
    drones = drones.map((d) => {
      if (d.mode !== 'roaming') return d;
      const moved = { ...d };
      reverseEntity(moved, false);
      return moved;
    });
  }

  // --- fin del modo power
  let powerUntil = state.powerUntil;
  if (powerUntil !== null && elapsed >= powerUntil) powerUntil = null;

  // --- robot
  const robot: Robot = { ...state.robot };
  if (!robot.dir && robot.queued && neighbor(robot.cell, robot.queued, false) >= 0) {
    robot.dir = robot.queued;
    robot.queued = null;
    robot.progress = 0;
  }
  const robotArrive = (cell: number): Direction | null => {
    const queued = robot.queued;
    if (queued && neighbor(cell, queued, false) >= 0) {
      robot.queued = null;
      return queued;
    }
    if (robot.dir && neighbor(cell, robot.dir, false) >= 0) return robot.dir;
    return null;
  };
  moveEntity(robot, dtSec, SPEEDS.robot, robotArrive, () => false);

  // --- recolección al llegar a una celda
  let batteries = state.batteries;
  let supers = state.supers;
  let score = state.score;
  let eaten = state.eaten;
  let bonus = state.bonus;
  let bonusTaken = state.bonusTaken;

  const pickup = (cell: number): void => {
    if (batteries.includes(cell)) {
      batteries = batteries.filter((c) => c !== cell);
      score += SCORE_BATTERY;
      eaten += 1;
      events.push('battery');
    } else if (supers.includes(cell)) {
      supers = supers.filter((c) => c !== cell);
      score += SCORE_SUPER;
      eaten += 1;
      powerUntil = elapsed + POWER_MS;
      events.push('super');
    } else if (bonus && cell === BONUS_CELL) {
      bonus = null;
      bonusTaken = true;
      score += SCORE_BONUS;
      events.push('bonusTaken');
    }
  };
  pickup(robot.cell);

  // --- chip dorado
  if (!bonus && !bonusTaken && eaten >= Math.floor(state.totalEdibles * BONUS_TRIGGER)) {
    bonus = { expiresAt: elapsed + BONUS_WINDOW_MS };
    events.push('bonusSpawn');
  }
  if (bonus && elapsed >= bonus.expiresAt) {
    bonus = null;
    bonusTaken = true;
    events.push('bonusExpired');
  }

  // --- drones
  const powerMode = powerUntil !== null;
  const scatter = phase === 'scatter' && !powerMode;
  const newDrones = drones.map((drone) => {
    if (drone.mode === 'eaten') {
      if (drone.respawnAt !== null && elapsed >= drone.respawnAt) {
        return {
          ...drone,
          cell: MAZE.droneSpawns[drone.id],
          dir: null,
          progress: 0,
          mode: 'waiting' as DroneMode,
          releaseAt: elapsed + 1000,
          respawnAt: null,
        };
      }
      return drone;
    }
    if (drone.mode === 'waiting') {
      return elapsed < drone.releaseAt ? drone : { ...drone, mode: 'exiting' as DroneMode };
    }

    const moved: Drone = { ...drone };
    const decision = (cell: number): Direction | null => {
      if (moved.mode === 'exiting') {
        if (cell === MAZE.doorIndex) return 'up';
        if (isCorralCell(cell)) {
          // dentro del corral: hacia la columna de la puerta y luego arriba
          if (colOf(cell) < colOf(MAZE.doorIndex)) return 'right';
          if (colOf(cell) > colOf(MAZE.doorIndex)) return 'left';
          return 'up';
        }
        moved.mode = 'roaming';
        return 'up';
      }
      return chooseDroneDirection({
        cell,
        dir: moved.dir,
        robotCell: robot.cell,
        robotDir: robot.dir,
        powerMode,
        scatter,
        personality: moved.personality,
        rng: state.rng,
      });
    };

    if (!moved.dir) {
      const dir = decision(moved.cell);
      if (!dir || neighbor(moved.cell, dir, moved.mode === 'exiting') < 0) return moved;
      moved.dir = dir;
      moved.progress = 0;
    }
    const speed = droneSpeed(moved, powerMode);
    moveEntity(moved, dtSec, speed, decision, () => moved.mode === 'exiting');
    return moved;
  });

  // --- colisiones (una captura por tick como máximo)
  let lives = state.lives;
  let caught = false;
  let eatenThisTick = 0;
  const finalDrones = newDrones.map((drone) => {
    if (caught) return drone;
    if (drone.mode !== 'roaming' && drone.mode !== 'exiting') return drone;
    const robotPos = floatPos(robot, false);
    const dronePos = floatPos(drone, drone.mode === 'exiting');
    if (wrappedDistance(robotPos, dronePos) > 0.7) return drone;
    if (powerMode) {
      eatenThisTick += 1;
      return {
        ...drone,
        mode: 'eaten' as DroneMode,
        dir: null,
        progress: 0,
        respawnAt: elapsed + RESPAWN_MS,
      };
    }
    caught = true;
    return drone;
  });
  if (eatenThisTick > 0) {
    score += SCORE_DRONE * eatenThisTick;
    events.push('droneEaten');
  }
  if (caught) {
    events.push('caught');
    lives -= 1;
  }

  let status = state.status;
  let finishedAt: number | null = null;
  const resetPositions = caught && lives > 0;
  if (lives <= 0) {
    status = 'lost';
    finishedAt = elapsed;
  }

  // --- victoria
  if (status === 'playing' && eaten >= state.totalEdibles) {
    status = 'won';
    score += lives * SCORE_LIFE_BONUS;
    finishedAt = elapsed;
  }

  const next: GameState = {
    ...state,
    robot: resetPositions ? { cell: MAZE.robotSpawn, dir: null, progress: 0, queued: null } : robot,
    drones: resetPositions
      ? finalDrones.map((d, i) => ({
          ...d,
          cell: MAZE.droneSpawns[i],
          dir: null,
          progress: 0,
          mode: 'waiting' as DroneMode,
          releaseAt: elapsed + 800 + i * 1500,
          respawnAt: null,
        }))
      : finalDrones,
    batteries,
    supers,
    score,
    lives,
    eaten,
    elapsedMs: elapsed,
    powerUntil,
    phase,
    phaseUntil,
    bonus,
    bonusTaken,
    status,
    finishedAt,
  };
  return { state: next, events };
}
