/**
 * Store zustand de Doodle Jump (PLAN-DOODLE-JUMP T4, D8/D9/D10).
 *
 * Divergencia con serpiente/wakwak (D8): la física es CONTINUA — el estado
 * cambia cada frame — así que el `GameState` vive como snapshot mutable
 * interno y NO se publica por frame. `zustand` publica solo:
 *   (a) eventos discretos que afectan UI (die → status),
 *   (b) score/altura con throttle ≤ 5 Hz (display del header),
 *   (c) start/reset/pausa.
 * El render corre en shared values de Reanimated leyendo `getGame()` cada
 * frame (cero re-renders React por frame; habilidad expo-animation).
 */

import { create } from 'zustand';
import {
  advance,
  applyDragX,
  createGameState,
  setMoveDir,
  shoot,
  type DoodleJumpEvent,
  type GameState,
  type GameStatus,
} from './rules';
import { parseDoodleJumpSeed, seedConfig } from './seed';

/** Throttle de publicación de score/status (D8): ≤ 5 Hz. */
const UI_PUBLISH_MS = 200;

export interface DoodleJumpStore {
  /** Espejos discretos para la UI (se publican throttled/inmediato). */
  paused: boolean;
  status: GameStatus;
  score: number;
  /** Inicia una run; `seed` solo llega en builds E2E (§3.5). */
  startRun: (seed?: string) => void;
  reset: (seed?: string) => void;
  /** Avanza la simulación; devuelve los eventos discretos (sonido/haptics). */
  tick: (dtMs: number) => DoodleJumpEvent[];
  applyDrag: (deltaUnits: number) => void;
  /** Teclado web (D7): -1 izq, 0 suelto, 1 der. */
  setMoveDir: (dir: -1 | 0 | 1) => void;
  /** Disparo entre frames; `aim` opcional en unidades del mundo (toque). */
  shootNow: (aim?: { dx: number; dy: number }) => DoodleJumpEvent[];
  togglePause: () => void;
}

/** Snapshot mutable interno (única fuente de verdad de la simulación). */
let game: GameState = createGameState(seedConfig(undefined));

/** Lectura sincrónica para el render (shared values, sin suscripción). */
export function getGame(): GameState {
  return game;
}

/**
 * Estadística de publicación del tick (ADR 0011): contadores planos y
 * buffer acotado de duraciones de `advance`, SIN imports de perf — la
 * pantalla los vuelca a la sesión con `drainTickStats`. Off por defecto.
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

/** Acumulador de fracciones de ms (D9/D21): el store es la ÚNICA fuente. */
let tickAccumMs = 0;
let sincePublishMs = 0;

function publish(
  set: (partial: Partial<Pick<DoodleJumpStore, 'status' | 'score'>>) => void,
): void {
  sincePublishMs = 0;
  tickPublished += 1;
  set({ status: game.status, score: game.score });
}

export const useDoodleJumpStore = create<DoodleJumpStore>()((set, get) => ({
  paused: false,
  status: game.status,
  score: game.score,

  startRun: (seed) => {
    const config = seedConfig(parseDoodleJumpSeed(seed));
    game = createGameState(config);
    tickAccumMs = 0;
    sincePublishMs = UI_PUBLISH_MS; // publica inmediato al iniciar
    publish(set);
    set({ paused: false });
  },

  reset: (seed) => get().startRun(seed),

  tick: (dtMs) => {
    if (get().paused || game.status !== 'playing') {
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
    game = result.state;
    tickAccumMs = result.leftoverMs;
    sincePublishMs += Math.max(0, dtMs);

    const died = game.status !== get().status;
    if (died) {
      publish(set); // muerte: publicación inmediata (overlay de fin)
    } else if (sincePublishMs >= UI_PUBLISH_MS) {
      publish(set); // score/altura: throttle ≤ 5 Hz (D8)
    }
    return result.events;
  },

  applyDrag: (deltaUnits) => {
    if (get().paused || game.status !== 'playing') return;
    game = applyDragX(game, deltaUnits);
  },

  setMoveDir: (dir) => {
    if (get().paused || game.status !== 'playing') return;
    game = setMoveDir(game, dir);
  },

  shootNow: (aim) => {
    if (get().paused || game.status !== 'playing') return [];
    const result = shoot(game, aim);
    game = result.state;
    return result.events;
  },

  togglePause: () => set(() => ({ paused: !get().paused })),
}));
