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
  type GameState,
  type SerpienteEvent,
} from './rules';
import { parseSerpienteSeed, seedConfig } from './seed';

export interface SerpienteStore {
  game: GameState;
  paused: boolean;
  /** Setting D1 (la pantalla lo persiste en `preferencesRepository`, T3). */
  wrap: boolean;
  /** Inicia una run; `seed` solo llega en builds E2E (D12). */
  startRun: (seed?: string) => void;
  reset: (seed?: string) => void;
  /** Avanza la simulación; devuelve los eventos discretos (sonido/haptics). */
  tick: (dtMs: number) => SerpienteEvent[];
  setDirection: (dir: Direction) => void;
  togglePause: () => void;
  setWrap: (wrap: boolean) => void;
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
  return Math.min(1, Math.max(0, tickAccumMs) / stepMs(game.eaten));
}

export const useSerpienteStore = create<SerpienteStore>()((set, get) => ({
  game: createGameState(seedConfig(undefined)),
  paused: false,
  wrap: true,

  startRun: (seed) => {
    const config = seedConfig(parseSerpienteSeed(seed));
    tickAccumMs = 0;
    set(() => ({
      // El sentinela manda en `wrap` si lo fija (test-lose); si no, se
      // conserva el setting del usuario.
      game: createGameState({ ...config, wrap: config.wrap ?? get().wrap }),
      paused: false,
    }));
  },

  reset: (seed) => get().startRun(seed),

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
}));
