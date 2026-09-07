import { deal, type Card } from '../engine/deck';
import { parseSolitarioState, serializeSolitarioState } from '../engine/persistence';
import { useSolitarioStore } from '../engine/state';

function act() {
  return useSolitarioStore.getState();
}

function fresh(seed = 42, settings?: { drawMode?: 1 | 3; undoEnabled?: boolean }) {
  act().reset({ seed, ...settings });
}

function card(id: string, faceUp: boolean): Card {
  const suit = id.slice(0, 1) as 'S' | 'H' | 'D' | 'C';
  return { id, suit, rank: Number(id.slice(2)), faceUp };
}

describe('solitario persistence — serialize/parse', () => {
  it('round-trip: pilas, contadores y settings sobreviven intactos', () => {
    fresh(42, { drawMode: 3, undoEnabled: true });
    act().drawStock();
    act().drawStock();
    const s = act();
    const raw = serializeSolitarioState(s);
    const saved = parseSolitarioState(raw);

    expect(saved).not.toBeNull();
    expect(saved?.drawMode).toBe(3);
    expect(saved?.undoEnabled).toBe(true);
    expect(saved?.moves).toBe(2);
    expect(saved?.startedAt).toBe(s.startedAt);
    expect(saved?.tableau).toEqual(s.tableau);
    expect(saved?.foundations).toEqual(s.foundations);
    expect(saved?.stock).toEqual(s.stock);
    expect(saved?.waste).toEqual(s.waste);
    // El historial de undo nunca entra al blob
    expect(raw).not.toContain('"history"');
  });

  it('JSON corrupto o con forma inválida degrada a null', () => {
    expect(parseSolitarioState('no es json')).toBeNull();
    expect(parseSolitarioState('42')).toBeNull();
    expect(parseSolitarioState('{}')).toBeNull();
    // versión de formato desconocida
    fresh(42);
    const raw = serializeSolitarioState(act()).replace('"version":1', '"version":99');
    expect(parseSolitarioState(raw)).toBeNull();
  });

  it('rechaza pilas con cartas duplicadas o campos inválidos', () => {
    const base = {
      drawMode: 1,
      undoEnabled: false,
      moves: 0,
      undos: 0,
      startedAt: null,
      tableau: [[], [], [], [], [], [], []],
      foundations: [[], [], [], []],
      stock: [],
      waste: [],
    };
    const wrap = (over: object) =>
      parseSolitarioState(JSON.stringify({ version: 1, ...base, ...over }));

    // carta duplicada entre pilas
    expect(wrap({ waste: [card('H-5', true)], stock: [card('H-5', true)] })).toBeNull();
    // palo inválido
    expect(wrap({ waste: [{ id: 'X-5', suit: 'X', rank: 5, faceUp: true }] })).toBeNull();
    // rank fuera de rango
    expect(wrap({ waste: [{ id: 'H-14', suit: 'H', rank: 14, faceUp: true }] })).toBeNull();
    // drawMode inválido
    expect(wrap({ drawMode: 2 })).toBeNull();
    // tableau con cantidad incorrecta de columnas
    expect(wrap({ tableau: [[], [], [], [], [], []] })).toBeNull();
    // foundations con cantidad incorrecta
    expect(wrap({ foundations: [[], [], []] })).toBeNull();
    // startedAt inválido
    expect(wrap({ startedAt: 'ayer' })).toBeNull();
  });

  it('acepta el blob completo de un reparto real (52 cartas, sin duplicados)', () => {
    fresh(7);
    const saved = parseSolitarioState(serializeSolitarioState(act()));
    expect(saved).not.toBeNull();
    const total =
      (saved?.tableau.flat().length ?? 0) +
      (saved?.stock.length ?? 0) +
      (saved?.waste.length ?? 0) +
      (saved?.foundations.flat().length ?? 0);
    expect(total).toBe(52);
  });
});

describe('solitario persistence — store.restore', () => {
  it('restaura pilas y contadores, y deja el historial vacío', () => {
    fresh(42, { drawMode: 3, undoEnabled: true });
    act().drawStock();
    const original = act();
    const saved = parseSolitarioState(serializeSolitarioState(original));
    expect(saved).not.toBeNull();

    // estado intermedio distinto antes de restaurar
    fresh(99);
    act().restore(saved!);

    const s = act();
    expect(s.tableau).toEqual(original.tableau);
    expect(s.stock).toEqual(original.stock);
    expect(s.waste).toEqual(original.waste);
    expect(s.drawMode).toBe(3);
    expect(s.undoEnabled).toBe(true);
    expect(s.moves).toBe(1);
    expect(s.startedAt).toBe(original.startedAt);
    expect(s.history).toEqual([]);
  });

  it('recalcula stuck al restaurar un estado sin jugadas', () => {
    // Todas las columnas con top rojo no-as, foundations vacías y sin stock:
    // ningún movimiento posible (rojo sobre rojo no vale, as está tapado)
    const tops = ['H-2', 'D-2', 'H-3', 'D-3', 'H-4', 'D-4', 'H-5'];
    const rest: Card[] = [];
    for (const suit of ['S', 'H', 'D', 'C'] as const) {
      for (let rank = 1; rank <= 13; rank++) {
        const id = `${suit}-${rank}`;
        if (!tops.includes(id)) rest.push(card(id, false));
      }
    }
    const faceDown = rest.map((c) => ({ ...c, faceUp: false }));
    const tableau = tops.map((top, i) => {
      const col = faceDown.filter((_, j) => j % 7 === i);
      return [...col, card(top, true)];
    });
    const savedState = {
      drawMode: 1 as const,
      undoEnabled: false,
      moves: 3,
      undos: 0,
      startedAt: 1_700_000_000_000,
      tableau,
      foundations: [[], [], [], []],
      stock: [],
      waste: [],
    };
    const saved = parseSolitarioState(serializeSolitarioState(savedState));
    expect(saved).not.toBeNull();

    act().restore(saved!);

    expect(act().stuck).toBe(true);
    expect(act().finishedAt).toBeNull();
    expect(act().moves).toBe(3);
  });
});
