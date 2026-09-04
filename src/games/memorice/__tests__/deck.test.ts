import { buildDeck, MEMORICE_SYMBOLS, mulberry32, shuffle } from '../engine/deck';

describe('deck', () => {
  it('buildDeck crea el doble de cartas que de pares', () => {
    expect(buildDeck(8)).toHaveLength(16);
    expect(buildDeck(1)).toHaveLength(2);
    expect(buildDeck(MEMORICE_SYMBOLS.length)).toHaveLength(MEMORICE_SYMBOLS.length * 2);
  });

  it('buildDeck genera ids únicos y cada par aparece exactamente 2 veces', () => {
    const deck = buildDeck(8, 42);
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(16);

    for (let pairId = 0; pairId < 8; pairId++) {
      const count = deck.filter((c) => c.pairId === pairId).length;
      expect(count).toBe(2);
      const symbols = deck.filter((c) => c.pairId === pairId).map((c) => c.symbol);
      expect(new Set(symbols).size).toBe(1);
    }
  });

  it('buildDeck rechaza pairCount inválido', () => {
    expect(() => buildDeck(0)).toThrow();
    expect(() => buildDeck(-1)).toThrow();
    expect(() => buildDeck(1.5)).toThrow();
    expect(() => buildDeck(MEMORICE_SYMBOLS.length + 1)).toThrow();
  });

  it('shuffle con seed es determinista', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffle(items, 123)).toEqual(shuffle(items, 123));
  });

  it('shuffle conserva los elementos (multiset) y no muta el original', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = [...items];
    const shuffled = shuffle(items, 7);
    expect([...shuffled].sort((a, b) => a - b)).toEqual([...items].sort((a, b) => a - b));
    expect(items).toEqual(copy);
  });

  it('mulberry32 produce valores en [0,1) y es determinista', () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const va = a();
      expect(va).toBe(b());
      expect(va).toBeGreaterThanOrEqual(0);
      expect(va).toBeLessThan(1);
    }
  });
});
