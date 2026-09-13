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

/**
 * Sentinel para el escenario de fin de partida con stock y waste VACÍOS
 * (tests/E2E de performance, PLAN-PERFORMANCE §7): fuerza el coste de
 * `hasAnyMove`/`endFlags` con stock/waste vacíos — el peor caso del hot path.
 */
export const PERF_STOCK_EMPTY_SEED = '__perf_stock_empty__';

export type DealSeed = number | typeof TEST_WIN_SEED | typeof TEST_MOVE_SEED | typeof PERF_STOCK_EMPTY_SEED;

/** Mapea el `initialSeed` que llega por query param (solo builds E2E) a sentinel. */
export function parseSeed(initialSeed?: string): DealSeed | undefined {
  if (initialSeed === 'test-win') return TEST_WIN_SEED;
  if (initialSeed === 'test-move') return TEST_MOVE_SEED;
  if (initialSeed === 'perf-stock-empty') return PERF_STOCK_EMPTY_SEED;
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
  if (seed === PERF_STOCK_EMPTY_SEED) return perfStockEmptyDeal();

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

/**
 * E2E `perf-stock-empty`: fin de partida con stock y waste VACÍOS (el peor
 * caso de `endFlags`/`hasAnyMove`: debe recorrer tableau y waste completos
 * sin poder reciclar el stock). Fixtures (PLAN-PERFORMANCE §7):
 *  - tableau: 7 columnas × 4 cartas boca arriba, secuencia descendente
 *    alternando color (runs válidas para drag entre columnas).
 *  - waste: las 24 cartas restantes boca arriba (top = última); stock: vacío.
 *  - NOT stuck: el top de la col 6 es A♥ (fundación disponible) y tras
 *    moverlo queda S9 (fundación ♠ tras vaciar ♥... no: S9 va al tableau);
 *    en todo caso hay drags legales tableau↔tableau disponibles.
 *  - NOT won: foundations vacías.
 */
function perfStockEmptyDeal(): Deal {
  const card = (suit: Suit, rank: number, faceUp: boolean): Card => ({
    id: `${suit}-${rank}`,
    suit,
    rank,
    faceUp,
  });
  // 7 columnas × 4 cartas boca arriba, cada una descendente alternando color.
  // Col 6 termina en A♥: garantiza un movimiento legal (fundación) y que el
  // escenario NO quede stuck ni ganado.
  const cols: ReadonlyArray<ReadonlyArray<readonly [Suit, number]>> = [
    [['S', 13], ['H', 12], ['S', 11], ['H', 10]],
    [['C', 13], ['D', 12], ['C', 11], ['D', 10]],
    [['H', 9], ['S', 8], ['D', 7], ['C', 6]],
    [['C', 9], ['D', 8], ['S', 7], ['H', 6]],
    [['S', 5], ['H', 4], ['D', 3], ['C', 2]],
    [['D', 5], ['C', 4], ['H', 3], ['S', 2]],
    [['C', 12], ['D', 11], ['S', 9], ['H', 1]],
  ];
  const tableau = cols.map((col) => col.map(([suit, rank]) => card(suit, rank, true)));
  const used = new Set(tableau.flat().map((c) => c.id));
  const wasteCards = buildDeck().filter((c) => !used.has(c.id));
  return {
    tableau,
    stock: [],
    waste: wasteCards.map((c) => ({ ...c, faceUp: true })),
    foundations: SUITS.map(() => []),
  };
}
