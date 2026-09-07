import { SUITS, type Card, type Suit } from './deck';

/** Versión del formato del blob guardado (para evolucionar el schema con gracia). */
export const GAME_STATE_VERSION = 1;

interface SavedCard {
  id: string;
  suit: Suit;
  rank: number;
  faceUp: boolean;
}

/** Estado persistible: pilas + contadores. Sin history (undo no sobrevive el
 * restore), sin finishedAt/stuck (se recalculan con endFlags al restaurar). */
export interface SolitarioSavedState {
  drawMode: 1 | 3;
  undoEnabled: boolean;
  moves: number;
  undos: number;
  startedAt: number | null;
  tableau: SavedCard[][];
  foundations: SavedCard[][];
  stock: SavedCard[];
  waste: SavedCard[];
}

/** Fuente de serialización: subconjunto del estado del store (structural typing). */
export interface SolitarioSnapshotSource {
  drawMode: number;
  undoEnabled: boolean;
  moves: number;
  undos: number;
  startedAt: number | null;
  tableau: Card[][];
  foundations: Card[][];
  stock: Card[];
  waste: Card[];
}

export function serializeSolitarioState(source: SolitarioSnapshotSource): string {
  return JSON.stringify({
    version: GAME_STATE_VERSION,
    drawMode: source.drawMode,
    undoEnabled: source.undoEnabled,
    moves: source.moves,
    undos: source.undos,
    startedAt: source.startedAt,
    tableau: source.tableau,
    foundations: source.foundations,
    stock: source.stock,
    waste: source.waste,
  });
}

/** Parseo defensivo: cualquier desvío del formato degrada a `null` (la
 * pantalla reparte una partida nueva en lugar de crashear). */
export function parseSolitarioState(raw: string): SolitarioSavedState | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;

  if (d.version !== GAME_STATE_VERSION) return null;
  if (d.drawMode !== 1 && d.drawMode !== 3) return null;
  if (typeof d.undoEnabled !== 'boolean') return null;
  if (!isCount(d.moves) || !isCount(d.undos)) return null;
  if (d.startedAt !== null && !isCount(d.startedAt)) return null;

  const tableau = readPiles(d.tableau, 7);
  const foundations = readPiles(d.foundations, 4);
  if (!tableau || !foundations) return null;
  const stock = readCards(d.stock);
  const waste = readCards(d.waste);
  if (!stock || !waste) return null;

  // Integridad: ninguna carta puede aparecer dos veces
  const ids = new Set<string>();
  for (const card of [...tableau.flat(), ...foundations.flat(), ...stock, ...waste]) {
    if (ids.has(card.id)) return null;
    ids.add(card.id);
  }

  return {
    drawMode: d.drawMode,
    undoEnabled: d.undoEnabled,
    moves: d.moves,
    undos: d.undos,
    startedAt: d.startedAt,
    tableau,
    foundations,
    stock,
    waste,
  };
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function readCards(value: unknown): SavedCard[] | null {
  if (!Array.isArray(value)) return null;
  const cards: SavedCard[] = [];
  for (const item of value) {
    const card = readCard(item);
    if (!card) return null;
    cards.push(card);
  }
  return cards;
}

function readPiles(value: unknown, length: number): SavedCard[][] | null {
  if (!Array.isArray(value) || value.length !== length) return null;
  const piles: SavedCard[][] = [];
  for (const pile of value) {
    const cards = readCards(pile);
    if (!cards) return null;
    piles.push(cards);
  }
  return piles;
}

function readCard(value: unknown): SavedCard | null {
  if (typeof value !== 'object' || value === null) return null;
  const c = value as Record<string, unknown>;
  if (typeof c.id !== 'string' || c.id.length === 0) return null;
  if (!SUITS.includes(c.suit as Suit)) return null;
  if (typeof c.rank !== 'number' || !Number.isInteger(c.rank) || c.rank < 1 || c.rank > 13) return null;
  if (typeof c.faceUp !== 'boolean') return null;
  return { id: c.id, suit: c.suit as Suit, rank: c.rank, faceUp: c.faceUp };
}
