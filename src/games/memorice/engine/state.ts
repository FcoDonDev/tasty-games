import { create } from 'zustand';
import { buildDeck, type CardModel } from './deck';

export const PAIR_COUNT = 8;
/** Tiempo que la UI espera antes de voltear un par fallado (ms). Consumido por la pantalla, no por el store. */
export const MISMATCH_CLEAR_MS = 700;

/**
 * Convención de score: más es mejor.
 * 8 pares perfectos = 8 movimientos = 92 pts.
 */
export function scoreFor(moves: number): number {
  return Math.max(0, 100 - moves);
}

interface MemoriceState {
  cards: CardModel[];
  /** ids de cartas boca arriba esperando resolución (0, 1 o 2) */
  flipped: string[];
  /** ids ya emparejados (quedan boca arriba) */
  matched: string[];
  moves: number;
  /** epoch ms del primer flip; null hasta empezar */
  startedAt: number | null;
  /** epoch ms al completar todos los pares; null mientras se juega */
  finishedAt: number | null;
  flipCard: (id: string) => void;
  /** La UI lo llama tras MISMATCH_CLEAR_MS para voltear el par fallado */
  resolveMismatch: () => void;
  reset: (seed?: number) => void;
}

export const useMemoriceStore = create<MemoriceState>()((set, get) => ({
  cards: [],
  flipped: [],
  matched: [],
  moves: 0,
  startedAt: null,
  finishedAt: null,

  reset: (seed?: number) =>
    set({
      cards: buildDeck(PAIR_COUNT, seed),
      flipped: [],
      matched: [],
      moves: 0,
      startedAt: null,
      finishedAt: null,
    }),

  flipCard: (id) => {
    const { cards, flipped, matched, moves, startedAt, finishedAt } = get();

    if (finishedAt !== null) return;
    if (flipped.length >= 2) return;
    if (flipped.includes(id) || matched.includes(id)) return;
    const card = cards.find((c) => c.id === id);
    if (!card) return;

    if (flipped.length === 0) {
      set({ flipped: [id], startedAt: startedAt ?? Date.now() });
      return;
    }

    const first = cards.find((c) => c.id === flipped[0]);
    if (!first) return;
    const nextMoves = moves + 1;

    if (first.pairId === card.pairId) {
      const nextMatched = [...matched, first.id, id];
      const won = nextMatched.length === cards.length;
      set({
        flipped: [],
        matched: nextMatched,
        moves: nextMoves,
        finishedAt: won ? Date.now() : null,
      });
    } else {
      set({ flipped: [first.id, id], moves: nextMoves });
    }
  },

  resolveMismatch: () => {
    const { flipped, finishedAt } = get();
    if (finishedAt !== null) return;
    if (flipped.length === 2) {
      set({ flipped: [] });
    }
  },
}));
