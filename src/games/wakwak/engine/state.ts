import { create } from 'zustand';
import {
  advance,
  createGameState,
  queueDirection,
  type GameEvent,
  type GameState,
} from './rules';
import type { Direction } from './maze';
import { parseGameSeed, seedConfig } from './seed';

export interface WakWakStore {
  game: GameState;
  paused: boolean;
  reset: (seed?: string) => void;
  /** Avanza la simulación; devuelve los eventos discretos del frame (sonido/haptics). */
  tick: (dtMs: number) => GameEvent[];
  setDirection: (dir: Direction) => void;
  togglePause: () => void;
}

export const useWakWakStore = create<WakWakStore>()((set, get) => ({
  game: createGameState(seedConfig()),
  paused: false,

  reset: (seed) => {
    const config = seedConfig(parseGameSeed(seed));
    set(() => ({ game: createGameState(config), paused: false }));
  },

  tick: (dtMs) => {
    const { game, paused } = get();
    if (paused || game.status !== 'playing') return [];
    const result = advance(game, dtMs);
    if (result.state !== game) set(() => ({ game: result.state }));
    return result.events;
  },

  setDirection: (dir) => {
    const { game, paused } = get();
    if (paused || game.status !== 'playing') return;
    set(() => ({ game: queueDirection(game, dir) }));
  },

  togglePause: () => set(() => ({ paused: !get().paused })),
}));
