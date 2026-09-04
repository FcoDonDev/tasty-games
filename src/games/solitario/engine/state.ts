import { create } from 'zustand';
import { deal, type Card, type Deal, type DealSeed } from './deck';
import { canDropOnFoundation, canDropOnTableau, canPickUp, foundationIndexFor, hasAnyMove, isWon, type PileRef, type TargetRef } from './rules';

export type DrawMode = 1 | 3;

export interface SolitarioSettings {
  seed?: DealSeed;
  drawMode?: DrawMode;
  undoEnabled?: boolean;
}

/** Pila inmutable para undo (solo pilas; moves/undos se acumulan). */
interface Snapshot {
  tableau: Card[][];
  foundations: Card[][];
  stock: Card[];
  waste: Card[];
}

interface SolitarioState extends Deal {
  drawMode: DrawMode;
  undoEnabled: boolean;
  moves: number;
  undos: number;
  /** epoch ms del primer movimiento; null hasta empezar */
  startedAt: number | null;
  /** epoch ms al completar las 4 foundations; null mientras se juega */
  finishedAt: number | null;
  /** true cuando no quedan jugadas (stock y waste vacíos) */
  stuck: boolean;
  history: Snapshot[];
  reset: (settings?: SolitarioSettings) => void;
  setDrawMode: (mode: DrawMode) => void;
  setUndoEnabled: (enabled: boolean) => void;
  /** Roba del stock (drawMode cartas); recicla waste→stock si está vacío */
  drawStock: () => void;
  /** Valida y ejecuta el movimiento; devuelve false si es ilegal */
  moveCards: (from: PileRef, to: TargetRef) => boolean;
  undo: () => void;
}

const clonePiles = (s: Deal): Snapshot => ({
  tableau: s.tableau.map((col) => [...col]),
  foundations: s.foundations.map((pile) => [...pile]),
  stock: [...s.stock],
  waste: [...s.waste],
});

/** Recalcula los flags de fin a partir de las pilas. */
function endFlags(piles: Deal): { finishedAt: number | null; stuck: boolean } {
  if (isWon(piles)) return { finishedAt: Date.now(), stuck: false };
  if (!hasAnyMove(piles)) return { finishedAt: null, stuck: true };
  return { finishedAt: null, stuck: false };
}

export const useSolitarioStore = create<SolitarioState>()((set, get) => ({
  tableau: [],
  stock: [],
  waste: [],
  foundations: [],
  drawMode: 1,
  undoEnabled: false,
  moves: 0,
  undos: 0,
  startedAt: null,
  finishedAt: null,
  stuck: false,
  history: [],

  reset: (settings) =>
    set(() => ({
      ...deal(settings?.seed),
      drawMode: settings?.drawMode ?? 1,
      undoEnabled: settings?.undoEnabled ?? false,
      moves: 0,
      undos: 0,
      startedAt: null,
      finishedAt: null,
      stuck: false,
      history: [],
    })),

  setDrawMode: (mode) => set({ drawMode: mode }),
  setUndoEnabled: (enabled) => set({ undoEnabled: enabled, history: enabled ? get().history : [] }),

  drawStock: () => {
    const s = get();
    if (s.finishedAt !== null || s.stuck) return;

    const history = s.undoEnabled ? [...s.history, clonePiles(s)] : s.history;
    let stock: Card[];
    let waste: Card[];

    if (s.stock.length === 0) {
      if (s.waste.length === 0) return;
      // reciclaje: voltear la waste forma el nuevo stock (el último robo vuelve a quedar al fondo)
      stock = s.waste
        .slice()
        .reverse()
        .map((card) => ({ ...card, faceUp: false }));
      waste = [];
    } else {
      const n = Math.min(s.drawMode, s.stock.length);
      stock = s.stock.slice(0, s.stock.length - n);
      waste = [...s.waste, ...s.stock.slice(s.stock.length - n).map((card) => ({ ...card, faceUp: true }))];
    }

    set({ stock, waste, history, moves: s.moves + 1, startedAt: s.startedAt ?? Date.now() });
  },

  moveCards: (from, to) => {
    const s = get();
    if (s.finishedAt !== null || s.stuck) return false;

    const moving = canPickUp(s, from);
    if (!moving) return false;

    if (to.kind === 'foundation') {
      if (moving.length !== 1 || !canDropOnFoundation(moving[0], s.foundations[to.index])) return false;
    } else {
      if (from.kind === 'tableau' && from.index === to.index) return false;
      if (!canDropOnTableau(moving, s.tableau[to.index])) return false;
    }

    const history = s.undoEnabled ? [...s.history, clonePiles(s)] : s.history;
    const tableau = s.tableau.map((col) => [...col]);
    const foundations = s.foundations.map((pile) => [...pile]);
    const waste = [...s.waste];

    if (from.kind === 'waste') {
      waste.pop();
    } else if (from.kind === 'foundation') {
      foundations[from.index].pop();
    } else {
      const col = tableau[from.index];
      col.splice(from.cardIndex);
      if (col.length > 0 && !col[col.length - 1].faceUp) {
        col[col.length - 1] = { ...col[col.length - 1], faceUp: true };
      }
    }

    if (to.kind === 'foundation') {
      foundations[to.index] = [...foundations[to.index], ...moving];
    } else {
      tableau[to.index] = [...tableau[to.index], ...moving];
    }

    const next: Deal = { tableau, foundations, stock: s.stock, waste };
    const { finishedAt, stuck } = endFlags(next);

    set({
      tableau,
      foundations,
      waste,
      history,
      moves: s.moves + 1,
      startedAt: s.startedAt ?? Date.now(),
      finishedAt,
      stuck,
    });
    return true;
  },

  undo: () => {
    const s = get();
    if (!s.undoEnabled || s.history.length === 0 || s.finishedAt !== null) return;
    const previous = s.history[s.history.length - 1];
    const { stuck } = endFlags(previous);
    set({ ...previous, undos: s.undos + 1, stuck, history: s.history.slice(0, -1) });
  },
}));
