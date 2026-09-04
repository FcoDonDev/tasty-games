export interface CardModel {
  id: string;
  pairId: number;
  symbol: string;
}

export const MEMORICE_SYMBOLS = [
  '🍒',
  '🍋',
  '🍇',
  '🍉',
  '🥝',
  '🍍',
  '🥑',
  '🍓',
  '🍑',
  '🥥',
  '🌶️',
  '🥕',
] as const;

/** PRNG determinista (mulberry32). Solo para tests/seeds; sin seed usa Math.random. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
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

/** Mazo de `pairCount` pares (2 cartas por par), barajado. */
export function buildDeck(pairCount: number, seed?: number): CardModel[] {
  if (!Number.isInteger(pairCount) || pairCount < 1 || pairCount > MEMORICE_SYMBOLS.length) {
    throw new Error(`pairCount debe estar entre 1 y ${MEMORICE_SYMBOLS.length}`);
  }
  const pairs = MEMORICE_SYMBOLS.slice(0, pairCount).flatMap((symbol, pairId) => [
    { pairId, symbol },
    { pairId, symbol },
  ]);
  return shuffle(pairs, seed).map((pair, index) => ({
    id: `card-${index}`,
    pairId: pair.pairId,
    symbol: pair.symbol,
  }));
}
