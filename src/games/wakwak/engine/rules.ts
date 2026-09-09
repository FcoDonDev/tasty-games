/**
 * Reglas de Wak Wak: simulación por ticks fijos, 100% pura y determinista.
 * El render consume posiciones interpoladas (`floatPos`); la UI de React solo
 * se entera de eventos discretos (`GameEvent`). El loop en sí vive en el
 * adaptador de render (ADR 0010) y llama a `advance(state, dtMs)`.
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
import { levelConfig, MAX_LEVEL, type LevelConfig } from './levels';

// --- Constantes de juego -------------------------------------------------

export const TICK_MS = 1000 / 60;

/** Velocidades del MVP (nivel 3); los niveles derivan las suyas (levels.ts). */
export const SCORE_BATTERY = 10;
export const SCORE_SUPER = 50;
export const SCORE_DRONE = 200;
export const SCORE_BONUS = 100;
export const SCORE_LIFE_BONUS = 100;
/** Techo de puntos por drone dentro de un combo (CE DX+). */
export const SCORE_DRONE_MAX = 3200;

export const RESPAWN_MS = 6000;
export const BONUS_WINDOW_MS = 10000;
export const BONUS_TRIGGER = 0.5; // fracción de comestibles que activa el chip

/** Celda del chip dorado: camino SIN batería (el pickup corre cada tick mientras
 * el robot está en la celda; si tuviera batería se la comería antes que el chip). */
export const BONUS_CELL = toIndex(11, 9);

/**
 * Puntos por el drone N comido dentro del MISMO modo power (D3, CE DX+):
 * 200 · 2^(chain−1) con cap en 3200. Función pura testeable.
 */
export function droneChainPoints(chain: number): number {
  const links = Math.max(1, Math.floor(chain));
  return Math.min(SCORE_DRONE_MAX, SCORE_DRONE * 2 ** (links - 1));
}

// --- Tipos ---------------------------------------------------------------

export interface Robot {
  cell: number;
  dir: Direction | null;
  /** 0..1 hacia la celda vecina en `dir` */
  progress: number;
  /**
   * Buffer de hasta 2 direcciones deseadas; la MÁS RECIENTE al final
   * (PLAN-WAK-POLISH F2, Pac-Man Dossier: el último input es el que cuenta —
   * el viejo queda como fallback si el nuevo no es viable en la intersección).
   */
  queued: Direction[];
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
  /** nivel actual de la run (1-based) */
  level: number;
  /** knobs de dificultad del nivel (levels.ts) */
  cfg: LevelConfig;
  /** comestibles consumidos (baterías + súper; el chip no cuenta) */
  eaten: number;
  totalEdibles: number;
  /** reloj de juego acumulado en ms */
  elapsedMs: number;
  /** ms de juego en que termina el modo power; null si inactivo */
  powerUntil: number | null;
  /** drones comidos dentro del power actual (cadena del combo; 0 = sin combo) */
  chain: number;
  /** mejor cadena de la partida (stats del overlay final) */
  bestChain: number;
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
  | { type: 'battery' }
  | { type: 'super' }
  | { type: 'droneEaten'; id: number; chain: number; points: number }
  | { type: 'caught'; x: number; y: number }
  | { type: 'bonusSpawn' }
  | { type: 'bonusTaken' }
  | { type: 'bonusExpired' }
  | { type: 'won' }
  | { type: 'lost' };

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

function droneSpeed(drone: Drone, cfg: LevelConfig, powerMode: boolean, elroy: boolean): number {
  if (drone.mode === 'waiting' || drone.mode === 'eaten') return 0;
  if (drone.mode === 'exiting' || isCorralCell(drone.cell)) return cfg.speeds.droneCorral;
  const chase = cfg.speeds.droneChase * (elroy ? cfg.elroyBoost : 1);
  return powerMode ? cfg.speeds.droneFrightened : chase;
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

/** Distancia con wrap horizontal (para colisiones y slow-mo en el túnel). */
export function wrappedDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
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
  /** fracción restante del modo power (0 = inactivo; <~0.33 = parpadeo próximo a expirar) */
  powerFraction: number;
} {
  const powered = state.powerUntil !== null;
  const powerFraction = powered
    ? Math.max(0, Math.min(1, (state.powerUntil! - state.elapsedMs) / state.cfg.powerMs))
    : 0;
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
    powerFraction,
  };
}

// --- creación de partida -------------------------------------------------

const PERSONALITIES: readonly Personality[] = [0, 1, 2, 3];

export function createGameState(config: SeedConfig): GameState {
  const cfg = levelConfig(config.level ?? 1);
  const releaseBase = config.releaseBase ?? cfg.releaseBase;
  const releaseStagger = config.releaseStagger ?? cfg.releaseStagger;
  const drones = MAZE.droneSpawns.map((cell, i) => ({
    id: i,
    personality: PERSONALITIES[i],
    cell,
    dir: null,
    progress: 0,
    mode: 'waiting' as DroneMode,
    releaseAt: releaseBase + i * releaseStagger,
    respawnAt: null,
  }));
  for (const override of config.droneStart ?? []) {
    const drone = drones[override.id];
    if (drone) {
      drone.cell = override.cell;
      drone.mode = override.mode;
    }
  }
  return {
    robot: { cell: MAZE.robotSpawn, dir: null, progress: 0, queued: [] },
    drones,
    batteries: [...config.batteryCells].sort((a, b) => a - b),
    supers: [...config.superCells].sort((a, b) => a - b),
    score: 0,
    lives: 3,
    level: cfg.level,
    cfg,
    eaten: 0,
    totalEdibles: config.batteryCells.length + config.superCells.length,
    elapsedMs: 0,
    powerUntil: null,
    chain: 0,
    bestChain: 0,
    phase: config.startPhase ?? 'scatter',
    phaseUntil: config.startPhase === 'chase' ? cfg.chaseMs : cfg.scatterMs,
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
    // reversa inmediata: el último input prevalece (descarta lo encolado viejo)
    const reversed = { ...robot };
    reverseEntity(reversed, false);
    return { ...state, robot: { ...reversed, queued: [] } };
  }
  // buffer de 2 con prioridad al nuevo: el más reciente queda al final
  const queued = [...robot.queued, dir].slice(-2);
  if (!robot.dir) {
    // robot detenido: aplica el primer viable desde el MÁS NUEVO
    for (let i = queued.length - 1; i >= 0; i--) {
      if (neighbor(robot.cell, queued[i], false) >= 0) {
        return { ...state, robot: { ...robot, dir: queued[i], progress: 0, queued: [] } };
      }
    }
    return { ...state, robot: { ...robot, queued } };
  }
  return { ...state, robot: { ...robot, queued } };
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
  const cfg = state.cfg;
  let phase = state.phase;
  let phaseUntil = state.phaseUntil;
  let drones = state.drones;
  if (state.powerUntil === null && elapsed >= phaseUntil) {
    phase = phase === 'scatter' ? 'chase' : 'scatter';
    phaseUntil = elapsed + (phase === 'scatter' ? cfg.scatterMs : cfg.chaseMs);
    drones = drones.map((d) => {
      if (d.mode !== 'roaming') return d;
      const moved = { ...d };
      reverseEntity(moved, false);
      return moved;
    });
  }

  // --- fin del modo power (y reinicio de la cadena del combo)
  let powerUntil = state.powerUntil;
  let chain = state.chain;
  if (powerUntil !== null && elapsed >= powerUntil) {
    powerUntil = null;
    chain = 0;
  }

  // --- robot
  const robot: Robot = { ...state.robot };
  if (!robot.dir && robot.queued.length > 0) {
    // detenido tras muro: primer viable desde el MÁS NUEVO (prioridad al nuevo)
    for (let i = robot.queued.length - 1; i >= 0; i--) {
      if (neighbor(robot.cell, robot.queued[i], false) >= 0) {
        robot.dir = robot.queued[i];
        robot.queued = [];
        robot.progress = 0;
        break;
      }
    }
  }
  const robotArrive = (cell: number): Direction | null => {
    const queue = robot.queued;
    // en la intersección: el input más nuevo tiene prioridad; si se aplica
    // CUALQUIERA, el buffer se limpia (la última instrucción prevalece)
    for (let i = queue.length - 1; i >= 0; i--) {
      if (neighbor(cell, queue[i], false) >= 0) {
        robot.queued = [];
        return queue[i];
      }
    }
    if (robot.dir && neighbor(cell, robot.dir, false) >= 0) return robot.dir;
    return null;
  };
  moveEntity(robot, dtSec, cfg.speeds.robot, robotArrive, () => false);

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
      events.push({ type: 'battery' });
    } else if (supers.includes(cell)) {
      supers = supers.filter((c) => c !== cell);
      score += SCORE_SUPER;
      eaten += 1;
      powerUntil = elapsed + cfg.powerMs;
      events.push({ type: 'super' });
    } else if (bonus && cell === BONUS_CELL) {
      bonus = null;
      bonusTaken = true;
      score += SCORE_BONUS;
      events.push({ type: 'bonusTaken' });
    }
  };
  pickup(robot.cell);

  // --- chip dorado
  if (!bonus && !bonusTaken && eaten >= Math.floor(state.totalEdibles * BONUS_TRIGGER)) {
    bonus = { expiresAt: elapsed + BONUS_WINDOW_MS };
    events.push({ type: 'bonusSpawn' });
  }
  if (bonus && elapsed >= bonus.expiresAt) {
    bonus = null;
    bonusTaken = true;
    events.push({ type: 'bonusExpired' });
  }

  // --- drones
  const powerMode = powerUntil !== null;
  const scatter = phase === 'scatter' && !powerMode;
  // "Cruise Elroy" (D2.1): el Cazador acelera al final del nivel, solo chase
  const remainingFrac = state.totalEdibles > 0 ? 1 - eaten / state.totalEdibles : 0;
  const elroy =
    !powerMode &&
    cfg.elroyThreshold !== null &&
    remainingFrac < cfg.elroyThreshold;
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
    const elroyDrone = elroy && moved.mode === 'roaming' && moved.personality === 0;
    const speed = droneSpeed(moved, cfg, powerMode, elroyDrone);
    moveEntity(moved, dtSec, speed, decision, () => moved.mode === 'exiting');
    return moved;
  });

  // --- colisiones (varios drones pueden caer el mismo tick; UN evento por drone)
  let lives = state.lives;
  let caught = false;
  const caughtAt = { x: 0, y: 0 }; // sitio de la colisión (el close-up encuadra acá)
  let bestChain = state.bestChain;
  const robotPosNow = floatPos(robot, false);
  const finalDrones = newDrones.map((drone) => {
    if (caught) return drone;
    if (drone.mode !== 'roaming' && drone.mode !== 'exiting') return drone;
    const robotPos = robotPosNow;
    const dronePos = floatPos(drone, drone.mode === 'exiting');
    if (wrappedDistance(robotPos, dronePos) > 0.7) return drone;
    if (powerMode) {
      chain += 1;
      const points = droneChainPoints(chain);
      bestChain = Math.max(bestChain, chain);
      score += points;
      events.push({ type: 'droneEaten', id: drone.id, chain, points });
      return {
        ...drone,
        mode: 'eaten' as DroneMode,
        dir: null,
        progress: 0,
        respawnAt: elapsed + RESPAWN_MS,
      };
    }
    caught = true;
    caughtAt.x = robotPos.x;
    caughtAt.y = robotPos.y;
    return drone;
  });
  if (caught) {
    // posición de colisión en el evento: el engine resetea posiciones al
    // regresar, el present del close-up necesita el PUNTO exacto (hallazgo 1)
    events.push({ type: 'caught', x: caughtAt.x, y: caughtAt.y });
    lives -= 1;
    chain = 0; // el combo muere con la vida (D3)
  }

  let status = state.status;
  let finishedAt: number | null = null;
  const resetPositions = caught && lives > 0;
  if (lives <= 0) {
    status = 'lost';
    finishedAt = elapsed;
    events.push({ type: 'lost' });
  }

  // --- victoria de nivel (el fin de RUN lo decide la pantalla según level)
  if (status === 'playing' && eaten >= state.totalEdibles) {
    status = 'won';
    // bonus por vidas solo al cerrar la RUN (último nivel; D1)
    if (state.level >= MAX_LEVEL) score += lives * SCORE_LIFE_BONUS;
    finishedAt = elapsed;
    events.push({ type: 'won' });
  }

  const next: GameState = {
    ...state,
    robot: resetPositions ? { cell: MAZE.robotSpawn, dir: null, progress: 0, queued: [] } : robot,
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
    chain,
    bestChain,
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
