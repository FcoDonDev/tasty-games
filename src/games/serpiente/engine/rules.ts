/**
 * Reglas puras de Serpiente (PLAN-SERPIENTE T1, D2/D5–D9/D11, §9.3).
 * Sin UI, sin imports de otros juegos ni de core: funciones puras sobre
 * `GameState`. El store (`state.ts`, T2) las invoca y publica el resultado.
 *
 * Rendimiento por diseño: `advance` es O(1) amortizado por tick (colisión
 * por `Set`, spawn por muestreo acotado con fallback) y el `set()` del store
 * solo debe ocurrir si el estado cambió (esta función devuelve la misma
 * referencia cuando nada se mueve).
 */

import { CELL_COUNT, manhattan, opposite, stepIndex, toIndex, type Direction } from './grid';

export const START_LENGTH = 4;
export const SCORE_FOOD = 10;
export const SCORE_SPECIAL = 50;
/** Cada N comidas aparece el especial (D7). */
export const SPECIAL_EVERY = 5;
/** Caducidad del especial en ms (D7: 8 s). */
export const SPECIAL_TTL_MS = 8000;
/** Buffer de input: máx 2, último-gana (D9). */
export const MAX_QUEUE = 2;
/** Tope de pasos por frame: anti-espiral de la muerte (§9.3). */
export const MAX_STEPS_PER_FRAME = 8;
/** Muestras acotadas antes del fallback (§9.3). */
const SPAWN_SAMPLES = 60;

export type GameStatus = 'playing' | 'won' | 'lost';
export type SerpienteEvent = 'eat' | 'special' | 'die' | 'win';

export interface Special {
  cell: number;
  ttlMs: number;
}

export interface GameState {
  /** Cabeza al frente (índice 0). */
  snake: number[];
  dir: Direction;
  queued: Direction[];
  food: number;
  special: Special | null;
  eaten: number;
  score: number;
  elapsedMs: number;
  remainderMs: number;
  wrap: boolean;
  status: GameStatus;
  /** Estado serializable del PRNG (sin closures). */
  rngSeed: number;
}

export interface SerpienteConfig {
  rngSeed?: number;
  wrap?: boolean;
  snake?: number[];
  dir?: Direction;
  food?: number;
  special?: Special | null;
  eaten?: number;
  score?: number;
}

/** Velocidad progresiva D2: `max(70, 140 - eaten*4)` (~7 → 14 celdas/s). */
export function stepMs(eaten: number): number {
  return Math.max(70, 140 - eaten * 4);
}

/**
 * mulberry32 como transición de estado (duplicado propio por la regla de
 * aislamiento entre juegos, D8). Determinista: mismo seed → misma secuencia.
 */
export function randomNext(seed: number): { value: number; seed: number } {
  const a = (seed + 0x6d2b79f5) | 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, seed: a };
}

function defaultSnake(): number[] {
  const row = 10;
  const headCol = 10;
  return Array.from({ length: START_LENGTH }, (_, i) => toIndex(row, headCol - i));
}

function sampleFreeCell(occupied: Set<number>, seed: number): { cell: number; seed: number } {
  let s = seed;
  for (let i = 0; i < SPAWN_SAMPLES; i++) {
    const r = randomNext(s);
    s = r.seed;
    const cell = Math.floor(r.value * CELL_COUNT);
    if (!occupied.has(cell)) return { cell, seed: s };
  }
  // Fallback determinista con tablero casi lleno: primer libre en orden.
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (!occupied.has(cell)) return { cell, seed: s };
  }
  return { cell: -1, seed: s };
}

/** Especial en celda libre alejada de la cabeza (D7). */
function spawnSpecialFar(
  occupied: Set<number>,
  head: number,
  seed: number,
): { cell: number; seed: number } {
  let s = seed;
  let best = -1;
  let bestDist = -1;
  const consider = (cell: number): void => {
    if (occupied.has(cell)) return;
    const dist = manhattan(cell, head);
    if (dist > bestDist) {
      bestDist = dist;
      best = cell;
    }
  };
  for (let i = 0; i < SPAWN_SAMPLES; i++) {
    const r = randomNext(s);
    s = r.seed;
    consider(Math.floor(r.value * CELL_COUNT));
  }
  if (best >= 0) return { cell: best, seed: s };
  for (let cell = 0; cell < CELL_COUNT; cell++) consider(cell);
  return { cell: best, seed: s };
}

export function createGameState(config: SerpienteConfig = {}): GameState {
  const snake = [...(config.snake ?? defaultSnake())];
  let rngSeed = config.rngSeed ?? (Date.now() % 2147483647);
  let food = config.food;
  if (food === undefined) {
    const occupied = new Set(snake);
    if (config.special) occupied.add(config.special.cell);
    const spawned = sampleFreeCell(occupied, rngSeed);
    food = spawned.cell;
    rngSeed = spawned.seed;
  }
  return {
    snake,
    dir: config.dir ?? 'right',
    queued: [],
    food,
    special: config.special ? { ...config.special } : null,
    eaten: config.eaten ?? 0,
    score: config.score ?? 0,
    elapsedMs: 0,
    remainderMs: 0,
    wrap: config.wrap ?? true,
    status: 'playing',
    rngSeed,
  };
}

/**
 * Buffer máx 2, último-gana (D9). Descarta opuestos (reversa 180° prohibida,
 * difiere de WakWak) y duplicados contra la dirección efectiva. Devuelve la
 * MISMA referencia si rechaza (el store no publica).
 */
export function setDirection(state: GameState, dir: Direction): GameState {
  if (state.status !== 'playing') return state;
  const effective = state.queued.length > 0 ? state.queued[state.queued.length - 1] : state.dir;
  if (dir === effective || dir === opposite(effective)) return state;
  return { ...state, queued: [...state.queued, dir].slice(-MAX_QUEUE) };
}

/** Cierre de partida (D6/D11): bonus de supervivencia `+1/s` al cerrar. */
function endRun(state: GameState, status: 'won' | 'lost'): GameState {
  return { ...state, status, score: state.score + Math.floor(state.elapsedMs / 1000) };
}

function stepOnce(state: GameState): { state: GameState; events: SerpienteEvent[] } {
  const events: SerpienteEvent[] = [];
  const cost = stepMs(state.eaten);
  const dir = state.queued.length > 0 ? state.queued[0] : state.dir;
  const queued = state.queued.slice(1);
  const next = stepIndex(state.snake[0], dir, state.wrap);
  const ticked: GameState = {
    ...state,
    dir,
    queued,
    elapsedMs: state.elapsedMs + cost,
    special:
      state.special && state.special.ttlMs - cost > 0
        ? { cell: state.special.cell, ttlMs: state.special.ttlMs - cost }
        : null,
  };
  // -1 = muro con wrap=false (D1).
  if (next < 0) return { state: endRun(ticked, 'lost'), events: ['die'] };
  const eatFood = next === state.food;
  const eatSpecial = ticked.special !== null && next === ticked.special.cell;
  const growing = eatFood || eatSpecial;
  // La cola se libera salvo que crezca: el cuerpo a chequear la excluye.
  const body = new Set(state.snake);
  if (!growing) body.delete(state.snake[state.snake.length - 1]);
  if (body.has(next)) return { state: endRun(ticked, 'lost'), events: ['die'] };
  const snake = growing ? [next, ...state.snake] : [next, ...state.snake.slice(0, -1)];
  let { eaten, score, food, special, rngSeed } = ticked;
  if (eatFood) {
    eaten += 1;
    score += SCORE_FOOD;
    events.push('eat');
    // Tablero lleno = victoria (D11): no hay dónde spawnear.
    if (snake.length >= CELL_COUNT) {
      return { state: endRun({ ...ticked, snake, eaten, score }, 'won'), events: [...events, 'win'] };
    }
    const occupied = new Set<number>(snake);
    if (special) occupied.add(special.cell);
    const spawned = sampleFreeCell(occupied, rngSeed);
    food = spawned.cell;
    rngSeed = spawned.seed;
    if (eaten % SPECIAL_EVERY === 0 && !special) {
      const far = spawnSpecialFar(new Set<number>([...snake, food]), next, rngSeed);
      rngSeed = far.seed;
      if (far.cell >= 0) special = { cell: far.cell, ttlMs: SPECIAL_TTL_MS };
    }
  } else if (eatSpecial) {
    score += SCORE_SPECIAL;
    special = null;
    events.push('special');
  }
  return { state: { ...ticked, snake, eaten, score, food, special, rngSeed }, events };
}

/**
 * Núcleo puro con ticks fijos (D8): acumula `dtMs` en `remainderMs` y avanza
 * de a `stepMs(eaten)` con tope `MAX_STEPS_PER_FRAME` por llamada. Sin pasos
 * pendientes devuelve la MISMA referencia (el store no publica).
 */
export function advance(state: GameState, dtMs: number): { state: GameState; events: SerpienteEvent[] } {
  if (state.status !== 'playing') return { state, events: [] };
  const events: SerpienteEvent[] = [];
  let current = state;
  let remainder = current.remainderMs + Math.max(0, dtMs);
  let guard = 0;
  while (current.status === 'playing' && remainder >= stepMs(current.eaten) && guard < MAX_STEPS_PER_FRAME) {
    remainder -= stepMs(current.eaten);
    const result = stepOnce(current);
    events.push(...result.events);
    current = result.state;
    guard += 1;
  }
  if (current === state) return { state, events };
  return { state: { ...current, remainderMs: remainder }, events };
}
