export type Suit = 'S' | 'H' | 'D' | 'C';

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'] as const;

export const SUIT_SYMBOLS: Record<Suit, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

export function isRedSuit(suit: Suit): boolean {
  return suit === 'H' || suit === 'D';
}

export interface Card {
  /** Estable y único: `<suit>-<rank>` (ej: `S-13` = K♠) */
  id: string;
  suit: Suit;
  /** 1 = As ... 13 = K */
  rank: number;
  faceUp: boolean;
}

export function rankLabel(rank: number): string {
  switch (rank) {
    case 1:
      return 'A';
    case 11:
      return 'J';
    case 12:
      return 'Q';
    case 13:
      return 'K';
    default:
      return String(rank);
  }
}

export function cardLabel(card: Card): string {
  return `${rankLabel(card.rank)}${SUIT_SYMBOLS[card.suit]}`;
}

/** Sentinel para el estado artesanal "a un movimiento de ganar" (tests/E2E). */
export const TEST_WIN_SEED = '__test_win__';

/** Sentinel para el reparto determinista de los tests E2E de drag. */
export const TEST_MOVE_SEED = '__test_move__';

export type DealSeed = number | typeof TEST_WIN_SEED | typeof TEST_MOVE_SEED;

/** Mapea el `initialSeed` que llega por query param (solo builds E2E) a sentinel. */
export function parseSeed(initialSeed?: string): DealSeed | undefined {
  if (initialSeed === 'test-win') return TEST_WIN_SEED;
  if (initialSeed === 'test-move') return TEST_MOVE_SEED;
  return undefined;
}

/** PRNG determinista (mulberry32). Solo para tests/seeds; sin seed usa Math.random. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t ^ (t >>> 14)) >>> 0;
    return t / 4294967296;
  };
}

/** Fisher-Yates. Devuelve un nuevo array, no muta el original. */
export function shuffle<T>(items: readonly T[], seed?: number): T[] {
  const random = seed === undefined ? Math.random : mulberry32(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export interface Deal {
  /** 7 columnas; el top de cada una = último elemento */
  tableau: Card[][];
  /** boca abajo; el top = último elemento */
  stock: Card[];
  /** boca arriba; el top = último elemento */
  waste: Card[];
  /** 4 pilas indexadas por palo: foundations[i] recibe SUITS[i] */
  foundations: Card[][];
}

export function buildDeck(): Card[] {
  return SUITS.flatMap((suit) =>
    Array.from({ length: 13 }, (_, i) => ({
      id: `${suit}-${i + 1}`,
      suit,
      rank: i + 1,
      faceUp: false,
    })),
  );
}

/** Reparto Klondike: col i recibe i+1 cartas (top faceUp), resto al stock. */
export function deal(seed?: DealSeed): Deal {
  if (seed === TEST_WIN_SEED) return testWinDeal();
  if (seed === TEST_MOVE_SEED) return testMoveDeal();

  const deck = shuffle(buildDeck(), seed);
  const tableau: Card[][] = [];
  let cursor = 0;
  for (let col = 0; col < 7; col++) {
    const count = col + 1;
    tableau.push(
      deck.slice(cursor, cursor + count).map((card, i) => ({
        ...card,
        faceUp: i === count - 1,
      })),
    );
    cursor += count;
  }
  return {
    tableau,
    stock: deck.slice(cursor),
    waste: [],
    foundations: SUITS.map(() => []),
  };
}

/** 3 foundations completas + ♣ sin el K, que está en el top del tableau 0. Un drag = victoria. */
function testWinDeal(): Deal {
  const card = (suit: Suit, rank: number): Card => ({
    id: `${suit}-${rank}`,
    suit,
    rank,
    faceUp: true,
  });
  const foundations: Card[][] = SUITS.map((suit, i) =>
    i < 3
      ? Array.from({ length: 13 }, (_, j) => card(suit, j + 1)) // A..K
      : Array.from({ length: 12 }, (_, j) => card(suit, j + 1)), // ♣: A..Q
  );
  const tableau: Card[][] = [[card('C', 13)]];
  for (let col = 1; col < 7; col++) tableau.push([]);
  return { tableau, stock: [], waste: [], foundations };
}

/** A♠ al top del stock y K♠ faceUp en col 0: flujo determinista de draw + drag legal/ilegal. */
function testMoveDeal(): Deal {
  const card = (suit: Suit, rank: number, faceUp: boolean): Card => ({
    id: `${suit}-${rank}`,
    suit,
    rank,
    faceUp,
  });
  const tableau: Card[][] = [[card('S', 13, true)]];
  for (let col = 1; col < 7; col++) tableau.push([]);
  return {
    tableau,
    stock: [card('H', 7, false), card('S', 1, false)], // top = A♠
    waste: [],
    foundations: SUITS.map(() => []),
  };
}
