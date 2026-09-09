import { deal, parseSeed, PERF_STOCK_EMPTY_SEED, buildDeck } from '../engine/deck';
import { hasAnyMove, isWon } from '../engine/rules';
import { useSolitarioStore } from '../engine/state';

describe('fixture perf-stock-empty (PLAN-PERFORMANCE §7)', () => {
  it('parseSeed mapea el seed del query param al sentinel', () => {
    expect(parseSeed('perf-stock-empty')).toBe(PERF_STOCK_EMPTY_SEED);
    expect(parseSeed('test-move')).toBe('__test_move__');
    expect(parseSeed('inexistente')).toBeUndefined();
  });

  it('el reparto es determinista y tiene stock/waste con la forma esperada', () => {
    const a = deal(PERF_STOCK_EMPTY_SEED);
    const b = deal(PERF_STOCK_EMPTY_SEED);
    expect(a).toEqual(b);

    // 28 cartas en tableau (7×4 boca arriba) + 24 en waste; stock vacío
    expect(a.stock).toHaveLength(0);
    expect(a.waste).toHaveLength(24);
    expect(a.waste.every((c) => c.faceUp)).toBe(true);
    expect(a.tableau).toHaveLength(7);
    expect(a.tableau.every((col) => col.length === 4 && col.every((c) => c.faceUp))).toBe(true);
    // 52 cartas únicas: nada del mazo se perdió ni duplicó
    const all = [...a.tableau.flat(), ...a.stock, ...a.waste, ...a.foundations.flat()];
    expect(all).toHaveLength(buildDeck().length);
    expect(new Set(all.map((c) => c.id)).size).toBe(52);
  });

  it('el top de la col 6 es A♥: garantiza un movimiento legal (no stuck, no won)', () => {
    const piles = deal(PERF_STOCK_EMPTY_SEED);
    expect(piles.tableau[6][3]).toMatchObject({ suit: 'H', rank: 1 });

    // El estado derivado no es stuck ni ganado: hasAnyMove es ejercitado de
    // verdad por endFlags (coste real del hot path con stock/waste vacíos).
    expect(isWon(piles)).toBe(false);
    expect(hasAnyMove(piles)).toBe(true);
  });

  it('el store arranca el escenario sin stuck y permite mover el A♥ a su fundación', () => {
    const store = useSolitarioStore;
    store.getState().reset({ seed: PERF_STOCK_EMPTY_SEED });
    expect(store.getState().stuck).toBe(false);
    expect(store.getState().finishedAt).toBeNull();

    const moved = store.getState().autoMoveToFoundation({
      kind: 'tableau',
      index: 6,
      cardIndex: 3,
    });
    expect(moved).toBe(true);
    expect(store.getState().moves).toBe(1);
    // El as quedó en la fundación de ♥ (index 1 = SUITS[1])
    expect(store.getState().foundations[1].at(-1)?.id).toBe('H-1');
    // endFlags recorrió el estado completo y siguió sin stuck
    expect(store.getState().stuck).toBe(false);
  });
});
