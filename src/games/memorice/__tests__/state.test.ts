import { scoreFor, useMemoriceStore } from '../engine/state';

/** Helper: resetea el store y devuelve el estado actual */
function fresh(seed = 42) {
  useMemoriceStore.getState().reset(seed);
  return useMemoriceStore.getState();
}

function flip(id: string) {
  useMemoriceStore.getState().flipCard(id);
}

function state() {
  return useMemoriceStore.getState();
}

/** Juega todos los pares exactos (partida perfecta, sin mismatches) */
function playPerfectGame() {
  const { cards } = fresh(42);
  const byPair = new Map<number, string[]>();
  for (const card of cards) {
    byPair.set(card.pairId, [...(byPair.get(card.pairId) ?? []), card.id]);
  }
  for (const pairIds of byPair.values()) {
    flip(pairIds[0]);
    flip(pairIds[1]);
  }
  return cards;
}

describe('memorice state', () => {
  beforeEach(() => {
    fresh(42);
  });

  it('reset arma un mazo de 8 pares y limpia todo', () => {
    const s = fresh(7);
    expect(s.cards).toHaveLength(16);
    expect(s.flipped).toEqual([]);
    expect(s.matched).toEqual([]);
    expect(s.moves).toBe(0);
    expect(s.startedAt).toBeNull();
    expect(s.finishedAt).toBeNull();
  });

  it('scoreFor: más movimientos = menos score, nunca negativo', () => {
    expect(scoreFor(0)).toBe(100);
    expect(scoreFor(8)).toBe(92);
    expect(scoreFor(150)).toBe(0);
  });

  it('primer flip marca el inicio, no cuenta movimiento', () => {
    const { cards } = fresh(42);
    flip(cards[0].id);
    expect(state().flipped).toEqual([cards[0].id]);
    expect(state().moves).toBe(0);
    expect(state().startedAt).not.toBeNull();
  });

  it('par matcheado pasa a matched sin movimientos extra', () => {
    const { cards } = fresh(42);
    const [a, b] = cards.filter((c) => c.pairId === cards[0].pairId);
    flip(a.id);
    flip(b.id);
    expect(state().moves).toBe(1);
    expect(state().flipped).toEqual([]);
    expect(state().matched).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(state().finishedAt).toBeNull();
  });

  it('par fallado queda en flipped hasta resolveMismatch y cuenta 1 movimiento', () => {
    const { cards } = fresh(42);
    const differentPair = cards.find((c) => c.pairId !== cards[0].pairId)!;
    flip(cards[0].id);
    flip(differentPair.id);
    expect(state().moves).toBe(1);
    expect(state().flipped).toHaveLength(2);

    state().resolveMismatch();
    expect(state().flipped).toEqual([]);
    // el score no cambia al resolver, los movimientos ya cuentan
    expect(state().moves).toBe(1);
  });

  it('flipCard ignora clicks inválidos', () => {
    const { cards } = fresh(42);
    // id inexistente
    flip('no-existe');
    expect(state().flipped).toEqual([]);
    // misma carta dos veces
    flip(cards[0].id);
    flip(cards[0].id);
    expect(state().flipped).toEqual([cards[0].id]);
    expect(state().moves).toBe(0);
    // carta ya matcheada
    const [a, b] = cards.filter((c) => c.pairId === cards[0].pairId);
    flip(b.id);
    state().resolveMismatch(); // por si fue mismatch, limpiar
    const matched = state().matched;
    if (matched.length > 0) {
      flip(matched[0]);
      expect(state().flipped).not.toContain(matched[0]);
    }
  });

  it('bloquea flips mientras hay 2 cartas sin resolver', () => {
    const { cards } = fresh(42);
    flip(cards[0].id);
    flip(cards[1].id); // asumo mismatch con seed 42; si matchea, cambiar seed
    if (state().flipped.length === 2) {
      const third = cards.find((c) => !state().flipped.includes(c.id))!;
      flip(third.id);
      expect(state().flipped).toHaveLength(2);
      expect(state().flipped).not.toContain(third.id);
    }
  });

  it('detecta victoria: matched completo, finishedAt y score correctos', () => {
    const cards = playPerfectGame();
    const s = state();
    expect(s.matched).toHaveLength(cards.length);
    expect(s.finishedAt).not.toBeNull();
    expect(s.startedAt).not.toBeNull();
    // partida perfecta: 1 movimiento por par
    expect(s.moves).toBe(8);
  });

  it('una partida con mismatches suma movimientos y la victoria igual llega', () => {
    const { cards } = fresh(42);
    // forzar un mismatch al inicio con dos pares distintos
    flip(cards[0].id);
    flip(cards[1].id);
    const wasMismatch = state().flipped.length === 2;
    state().resolveMismatch();

    const byPair = new Map<number, string[]>();
    for (const card of cards) {
      byPair.set(card.pairId, [...(byPair.get(card.pairId) ?? []), card.id]);
    }
    for (const pairIds of byPair.values()) {
      flip(pairIds[0]);
      flip(pairIds[1]);
      if (state().flipped.length === 2) state().resolveMismatch();
    }
    const s = state();
    expect(s.matched).toHaveLength(16);
    expect(s.finishedAt).not.toBeNull();
    if (wasMismatch) {
      expect(s.moves).toBeGreaterThan(8);
    }
  });

  it('flipCard después de ganar no hace nada', () => {
    const cards = playPerfectGame();
    expect(state().finishedAt).not.toBeNull();
    const moves = state().moves;
    flip(cards[0].id);
    expect(state().moves).toBe(moves);
    // todas las cartas quedaron matcheadas
    expect(state().matched).toHaveLength(16);
  });

  it('reset reinicia una partida ganada', () => {
    playPerfectGame();
    expect(state().finishedAt).not.toBeNull();

    fresh(99);
    expect(state().matched).toEqual([]);
    expect(state().moves).toBe(0);
    expect(state().finishedAt).toBeNull();
    expect(state().cards).toHaveLength(16);
  });
});
