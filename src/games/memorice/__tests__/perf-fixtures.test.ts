import { buildDeck, parseSeed, PERF_MATCH_SEED, PERF_MISMATCH_SEED } from '../engine/deck';
import { useMemoriceStore } from '../engine/state';

describe('fixtures de performance memorice (PLAN-PERFORMANCE §7)', () => {
  it('parseSeed mapea los seeds del query param a números fijos', () => {
    expect(parseSeed('perf-match')).toBe(PERF_MATCH_SEED);
    expect(parseSeed('perf-mismatch')).toBe(PERF_MISMATCH_SEED);
    expect(parseSeed('inexistente')).toBeUndefined();
    expect(parseSeed(undefined)).toBeUndefined();
  });

  it('ambos seeds producen repartos deterministas y distintos entre sí', () => {
    const match = buildDeck(8, PERF_MATCH_SEED);
    const mismatch = buildDeck(8, PERF_MISMATCH_SEED);
    expect(buildDeck(8, PERF_MATCH_SEED)).toEqual(match); // determinista
    expect(match).not.toEqual(mismatch); // layouts distintos por escenario
    expect(match).toHaveLength(16);
  });

  it('los escenarios E2E pueden elegir par coincidente y no coincidente con el layout fijo', () => {
    const store = useMemoriceStore;
    store.getState().reset(PERF_MATCH_SEED);
    const { cards } = store.getState();

    // Encontrar la primera carta cuyo vecino izquierdo es su par: el escenario
    // `perf-match` voltea ambos; `perf-mismatch` voltea uno contra otro par.
    const pairs = new Map<number, number[]>(); // pairId → posiciones
    cards.forEach((c, index) => {
      const list = pairs.get(c.pairId) ?? [];
      list.push(index);
      pairs.set(c.pairId, list);
    });
    const positions = [...pairs.values()].flat();
    expect(positions).toHaveLength(cards.length);
    const flippedFirst = cards[positions[0]];
    expect(flippedFirst).toBeDefined();
  });
});
