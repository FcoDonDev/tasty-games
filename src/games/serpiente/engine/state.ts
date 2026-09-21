/**
 * Store zustand de Serpiente (PLAN-SERPIENTE T2, espejo de
 * `wakwak/engine/state.ts`). El engine (`rules.ts`) es puro; el store lo
 * invoca y publica. Regla §9.1: `set()` solo si el estado cambió.
 */

import { create } from 'zustand';
import type { Direction } from './grid';
import {
  advance,
  createGameState,
  setDirection as setDirectionRule,
  stepMs,
  type Difficulty,
  type GameState,
  type SerpienteEvent,
} from './rules';
import { parseSerpienteSeed, seedConfig } from './seed';

export interface SerpienteStore {
  game: GameState;
  paused: boolean;
  /** Setting D1 (la pantalla lo persiste en `preferencesRepository`, T3). */
  wrap: boolean;
  /** Setting de dificultad (la pantalla lo persiste, T2). Default: medio. */
  difficulty: Difficulty;
  /** Seed de la run activa (sentinela E2E): `setDifficulty` lo conserva. */
  runSeed?: string;
  /**
   * Inicia una run; `seed` solo llega en builds E2E (D12). Prioridad de
   * dificultad: parámetro de URL (E2E) > config del sentinela > setting del
   * usuario.
   */
  startRun: (seed?: string, difficultyParam?: Difficulty) => void;
  reset: (seed?: string, difficultyParam?: Difficulty) => void;
  /** Avanza la simulación; devuelve los eventos discretos (sonido/haptics). */
  tick: (dtMs: number) => SerpienteEvent[];
  setDirection: (dir: Direction) => void;
  togglePause: () => void;
  setWrap: (wrap: boolean) => void;
  /** D5: fija el setting y REINICIA la run si estaba jugando. */
  setDifficulty: (difficulty: Difficulty) => void;
}

/**
 * Estadística de publicación del tick (D-WW0, §9.3): contadores planos y
 * buffer acotado de duraciones de `advance`, SIN imports de perf en el
 * engine — la pantalla los vuelca a la sesión con `drainTickStats`.
 * Apagado por defecto (cero overhead).
 */
const MAX_TICK_SAMPLES = 512;
let tickStatsEnabled = false;
let tickCalls = 0;
let tickPublished = 0;
let advanceSamples: number[] = [];

/** La pantalla lo enciende con `isPerfEnabled()` al montar. */
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

/**
 * Acumulador de fracciones de ms entre frames (D8/D21): `advance` consume
 * `dtMs` en pasos y devuelve el sobrante (`leftoverMs`) — el store es la
 * ÚNICA fuente de verdad del tiempo fraccionario (D21). Sin esto, frames de
 * 16 ms contra pasos de 140 ms jamás avanzarían. Se publica (`set()`) solo
 * cuando el juego cambia: cero re-renders por frames sin paso. Se descarta
 * al pausar/terminar (sin tormenta al reanudar) y al iniciar una run
 * (aislamiento entre tests). D20 lo expone vía `getStepProgress()`.
 */
let tickAccumMs = 0;

/**
 * D20: progreso del paso EN CURSO (0..1) para la interpolación del renderer.
 * Es `tickAccumMs / stepMs(eaten)` — la misma alcancía del store, única
 * fuente de verdad (D21). 0 si está pausado/terminado.
 */
export function getStepProgress(): number {
  const { game, paused } = useSerpienteStore.getState();
  if (paused || game.status !== 'playing') return 0;
  return Math.min(1, Math.max(0, tickAccumMs) / stepMs(game.eaten, game.difficulty));
}

export const useSerpienteStore = create<SerpienteStore>()((set, get) => ({
  game: createGameState(seedConfig(undefined)),
  paused: false,
  wrap: true,
  difficulty: 'medio',

  startRun: (seed, difficultyParam) => {
    const config = seedConfig(parseSerpienteSeed(seed));
    tickAccumMs = 0;
    set(() => ({
      runSeed: seed,
      // El sentinela manda en `wrap` si lo fija (test-lose); si no, se
      // conserva el setting del usuario. La dificultad respeta la prioridad
      // URL > config del sentinela > setting del usuario.
      game: createGameState({
        ...config,
        wrap: config.wrap ?? get().wrap,
        difficulty: difficultyParam ?? config.difficulty ?? get().difficulty,
      }),
      paused: false,
    }));
  },

  reset: (seed, difficultyParam) => get().startRun(seed, difficultyParam),

  tick: (dtMs) => {
    const { game, paused } = get();
    if (paused || game.status !== 'playing') {
      tickAccumMs = 0;
      return [];
    }
    tickAccumMs += Math.max(0, dtMs);
    const collect = tickStatsEnabled;
    if (collect) tickCalls += 1;
    const t0 = collect ? performance.now() : 0;
    const result = advance(game, tickAccumMs);
    if (collect) {
      if (advanceSamples.length >= MAX_TICK_SAMPLES) advanceSamples.shift();
      advanceSamples.push(performance.now() - t0);
    }
    // D21: el sobrante es SIEMPRE del resultado (publicado o no); así el
    // acumulador no se cuenta doble contra un campo del estado.
    tickAccumMs = result.leftoverMs;
    if (result.state !== game) {
      if (collect) tickPublished += 1;
      set(() => ({ game: result.state }));
    }
    return result.events;
  },

  setDirection: (dir) => {
    const { game, paused } = get();
    if (paused || game.status !== 'playing') return;
    const next = setDirectionRule(game, dir);
    if (next !== game) set(() => ({ game: next }));
  },

  togglePause: () => set(() => ({ paused: !get().paused })),

  setWrap: (wrap) => {
    // Aplicación inmediata: el setting rige también la run en curso.
    const { game } = get();
    set(() => ({ wrap, game: game.status === 'playing' ? { ...game, wrap } : game }));
  },

  setDifficulty: (difficulty) => {
    // D5: no se muta el timing de la run en caliente. Cambiar la dificultad a
    // mitad de partida reinicia la partida con la nueva tabla (conservando el
    // sentinela E2E si la run lo tenía); fuera de una run activa solo queda
    // fijado para la próxima.
    const { game, runSeed } = get();
    set(() => ({ difficulty }));
    if (game.status === 'playing') {
      get().startRun(runSeed, difficulty);
    }
  },
}));
