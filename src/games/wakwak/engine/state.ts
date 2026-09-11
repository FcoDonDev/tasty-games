import { create } from 'zustand';
import {
  advance,
  createGameState,
  queueDirection,
  type GameEvent,
  type GameState,
} from './rules';
import { MAX_LEVEL } from './levels';
import type { Direction } from './maze';
import { parseGameSeed, seedConfig, levelRngSeed, RUN_BASE_SEED, type SeedSentinel } from './seed';

export interface WakWakStore {
  game: GameState;
  paused: boolean;
  /** nivel actual de la run (1-based); espejo de `game.level` */
  runLevel: number;
  /** seed base de la run: cada nivel deriva su RNG con `levelRngSeed` */
  runBaseSeed: number;
  /**
   * Inicia una run en `level` (1-based, clampeado). Con `seed` (sentinela E2E)
   * el nivel viene fijado por la config del sentinela. Sin seed: partida
   * normal con knobs del nivel.
   */
  startRun: (level: number, seed?: string) => void;
  /** Compat con el flujo previo: reinicia la run en el nivel 1. */
  reset: (seed?: string) => void;
  /**
   * Avanza a la siguiente nivel de la run tras ganar: conserva score, suma
   * una vida (cap 5) y reinicia el laberinto/power/cadena.
   */
  advanceLevel: () => void;
  /** Avanza la simulación; devuelve los eventos discretos del frame (sonido/haptics). */
  tick: (dtMs: number) => GameEvent[];
  setDirection: (dir: Direction) => void;
  togglePause: () => void;
}

export const START_LIVES = 3;
/** Bonus de vida por nivel superado (cap: D1). */
export const LIFE_PER_LEVEL = 1;
export const MAX_LIVES = 5;

/**
 * Estadística de publicación del tick (D-WW0, PLAN-PERFORMANCE §11):
 * contadores planos y buffer acotado de duraciones de `advance`, SIN imports
 * (el store/engine no depende de performance — la pantalla los vuelca a la
 * sesión perf al desmontar con `drainTickStats`). Apagado por defecto
 * (cero overhead: solo lecturas de boolean cuando está off).
 */
const MAX_TICK_SAMPLES = 512;
let tickStatsEnabled = false;
let tickCalls = 0;
let tickPublished = 0;
let advanceSamples: number[] = [];

/** La pantalla lo enciende con `isPerfEnabled()` al montar (D-WW0). */
export function setTickStatsEnabled(value: boolean): void {
  tickStatsEnabled = value;
}

/** Vuelca y limpia los buffers (la pantalla lo llama antes de `endPerfSession`). */
export function drainTickStats(): {
  advanceSamples: number[];
  tickCalls: number;
  tickPublished: number;
} {
  const drained = { advanceSamples, tickCalls, tickPublished };
  advanceSamples = [];
  tickCalls = 0;
  tickPublished = 0;
  return drained;
}

export const useWakWakStore = create<WakWakStore>()((set, get) => ({
  game: createGameState(seedConfig()),
  paused: false,
  runLevel: 1,
  runBaseSeed: RUN_BASE_SEED,

  startRun: (level, seed) => {
    const sentinel: SeedSentinel | undefined = parseGameSeed(seed);
    const nextLevel = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
    const config = seedConfig(sentinel, nextLevel);
    set(() => ({
      game: createGameState(config),
      runLevel: config.level ?? nextLevel,
      runBaseSeed: sentinel ? config.rngSeed : RUN_BASE_SEED,
      paused: false,
    }));
  },

  reset: (seed) => {
    get().startRun(1, seed);
  },

  advanceLevel: () => {
    const { game, runLevel, runBaseSeed } = get();
    if (game.status !== 'won' || runLevel >= MAX_LEVEL) return;
    const nextLevel = runLevel + 1;
    const config = {
      ...seedConfig(undefined, nextLevel),
      rngSeed: levelRngSeed(runBaseSeed, nextLevel),
      label: game.seedLabel,
    };
    set(() => ({
      game: {
        ...createGameState(config),
        score: game.score,
        lives: Math.min(MAX_LIVES, game.lives + LIFE_PER_LEVEL),
      },
      runLevel: nextLevel,
      paused: false,
    }));
  },

  tick: (dtMs) => {
    const { game, paused } = get();
    if (paused || game.status !== 'playing') return [];
    const collect = tickStatsEnabled;
    if (collect) tickCalls += 1;
    const t0 = collect ? performance.now() : 0;
    const result = advance(game, dtMs);
    if (collect) {
      if (advanceSamples.length >= MAX_TICK_SAMPLES) advanceSamples.shift();
      advanceSamples.push(performance.now() - t0);
    }
    if (result.state !== game) {
      if (collect) tickPublished += 1;
      set(() => ({ game: result.state }));
    }
    return result.events;
  },

  setDirection: (dir) => {
    const { game, paused } = get();
    if (paused || game.status !== 'playing') return;
    set(() => ({ game: queueDirection(game, dir) }));
  },

  togglePause: () => set(() => ({ paused: !get().paused })),
}));
