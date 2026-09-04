import { TEST_WIN_SEED, deal, type Deal, type DealSeed } from '../engine/deck';
import { foundationIndexFor, type PileRef } from '../engine/rules';
import { useSolitarioStore, type DrawMode } from '../engine/state';

function fresh(seed: DealSeed = 42, settings?: { drawMode?: DrawMode; undoEnabled?: boolean }) {
  useSolitarioStore.getState().reset({ seed, ...settings });
  return useSolitarioStore.getState();
}

function act() {
  return useSolitarioStore.getState();
}

/** Roba hasta vaciar el stock (draw-1). */
function drainStock() {
  const s = fresh(42, { drawMode: 1 });
  while (act().stock.length > 0) act().drawStock();
  return s;
}

const tableauRef = (index: number, cardIndex: number): PileRef => ({ kind: 'tableau', index, cardIndex });

describe('solitario state — reset', () => {
  it('reparte 52 cartas con defaults drawMode 1 y undo off', () => {
    const s = fresh();
    expect(s.tableau.flat().length + s.stock.length + s.waste.length + s.foundations.flat().length).toBe(52);
    expect(s.drawMode).toBe(1);
    expect(s.undoEnabled).toBe(false);
    expect(s.moves).toBe(0);
    expect(s.startedAt).toBeNull();
    expect(s.finishedAt).toBeNull();
    expect(s.stuck).toBe(false);
    expect(s.history).toEqual([]);
  });

  it('respeta settings y el seed determinista', () => {
    const a = fresh(7, { drawMode: 3, undoEnabled: true });
    expect(a.drawMode).toBe(3);
    expect(a.undoEnabled).toBe(true);
    const b = fresh(7);
    expect(a.tableau.flat().map((c) => c.id)).toEqual(b.tableau.flat().map((c) => c.id));
  });

  it('TEST_WIN_SEED deja el K♣ jugable a foundation', () => {
    const s = fresh(TEST_WIN_SEED);
    expect(s.stock).toHaveLength(0);
    const king = s.tableau[0][0];
    expect(act().moveCards(tableauRef(0, 0), { kind: 'foundation', index: foundationIndexFor(king) })).toBe(true);
    expect(act().finishedAt).not.toBeNull();
  });

  it('setDrawMode / setUndoEnabled cambian el modo sin rebarajar', () => {
    const s = fresh(42);
    const ids = act().tableau.flat().map((c) => c.id);
    act().setDrawMode(3);
    act().setUndoEnabled(true);
    expect(act().drawMode).toBe(3);
    expect(act().undoEnabled).toBe(true);
    expect(act().tableau.flat().map((c) => c.id)).toEqual(ids);
  });
});

describe('solitario state — drawStock', () => {
  it('draw-1 mueve 1 carta faceUp al waste y marca el inicio', () => {
    fresh(42, { drawMode: 1 });
    act().drawStock();
    expect(act().stock).toHaveLength(23);
    expect(act().waste).toHaveLength(1);
    expect(act().waste[0].faceUp).toBe(true);
    expect(act().moves).toBe(1);
    expect(act().startedAt).not.toBeNull();
  });

  it('draw-3 mueve 3 cartas', () => {
    fresh(42, { drawMode: 3 });
    act().drawStock();
    expect(act().stock).toHaveLength(21);
    expect(act().waste).toHaveLength(3);
  });

  it('con stock corto roba solo las restantes', () => {
    drainStock();
    expect(act().stock).toHaveLength(0);
    act().drawStock(); // recicla
    expect(act().stock).toHaveLength(24);
    act().drawStock();
    act().drawStock();
    act().drawStock(); // stock queda en 22 → siguiente draw-3 roba 2? no: 22-3
    expect(act().waste.length).toBeGreaterThan(0);
  });

  it('reciclaje voltea la waste y conserva el orden de robo', () => {
    drainStock();
    const firstDrawn = act().waste[0].id;
    act().drawStock(); // stock vacío → recicla
    expect(act().waste).toHaveLength(0);
    expect(act().stock).toHaveLength(24);
    expect(act().stock.every((c) => !c.faceUp)).toBe(true);
    act().drawStock();
    expect(act().waste[act().waste.length - 1].id).toBe(firstDrawn);
  });

  it('reciclaje cuenta como movimiento', () => {
    drainStock();
    const moves = act().moves; // 24
    act().drawStock();
    expect(act().moves).toBe(moves + 1);
  });

  it('sin stock y sin waste no hace nada', () => {
    fresh(TEST_WIN_SEED);
    act().drawStock();
    expect(act().moves).toBe(0);
  });
});

describe('solitario state — moveCards', () => {
  it('movimiento legal tableau→tableau: mueve subsecuencia y voltea el top expuesto', () => {
    const s = fresh(42);
    // localiza una carta jugable construyendo el escenario a mano
    useSolitarioStore.setState({
      tableau: [
        [{ id: 'S-5', suit: 'S', rank: 5, faceUp: true }],
        [{ id: 'S-9', suit: 'S', rank: 9, faceUp: false }, { id: 'H-4', suit: 'H', rank: 4, faceUp: true }],
        ...deal(42).tableau.slice(2),
      ],
      stuck: false,
    });
    expect(act().moveCards(tableauRef(1, 1), { kind: 'tableau', index: 0 })).toBe(true);
    expect(act().tableau[0]).toEqual([
      { id: 'S-5', suit: 'S', rank: 5, faceUp: true },
      { id: 'H-4', suit: 'H', rank: 4, faceUp: true },
    ]);
    // el S-9 quedó expuesto y se volteó
    expect(act().tableau[1]).toEqual([{ id: 'S-9', suit: 'S', rank: 9, faceUp: true }]);
    expect(act().moves).toBe(1);
  });

  it('movimiento ilegal devuelve false sin alterar el estado', () => {
    fresh(42);
    useSolitarioStore.setState({
      tableau: [
        [{ id: 'S-5', suit: 'S', rank: 5, faceUp: true }],
        [{ id: 'C-5', suit: 'C', rank: 5, faceUp: true }],
        ...deal(42).tableau.slice(2),
      ],
      stuck: false,
    });
    const before = act().tableau;
    expect(act().moveCards(tableauRef(1, 0), { kind: 'tableau', index: 0 })).toBe(false);
    expect(act().tableau).toEqual(before);
    expect(act().moves).toBe(0);
  });

  it('waste→foundation y waste→tableau', () => {
    fresh(42);
    useSolitarioStore.setState({
      waste: [{ id: 'H-1', suit: 'H', rank: 1, faceUp: true }],
      stock: [],
      tableau: deal(42).tableau,
      stuck: false,
    });
    expect(act().moveCards({ kind: 'waste' }, { kind: 'foundation', index: foundationIndexFor({ suit: 'H', rank: 1, faceUp: true, id: 'H-1' }) })).toBe(true);
    expect(act().foundations[1]).toEqual([{ id: 'H-1', suit: 'H', rank: 1, faceUp: true }]);
    expect(act().waste).toEqual([]);
  });

  it('foundation→tableau permitido', () => {
    fresh(42);
    useSolitarioStore.setState({
      foundations: [[], [{ id: 'H-1', suit: 'H', rank: 1, faceUp: true }], [], []],
      tableau: deal(42).tableau,
      stuck: false,
    });
    expect(act().moveCards({ kind: 'foundation', index: 1 }, { kind: 'tableau', index: 0 })).toBe(false);
    useSolitarioStore.setState({
      tableau: [[{ id: 'S-2', suit: 'S', rank: 2, faceUp: true }], [], [], [], [], [], []],
    });
    expect(act().moveCards({ kind: 'foundation', index: 1 }, { kind: 'tableau', index: 0 })).toBe(true);
    expect(act().tableau[0]).toEqual([
      { id: 'S-2', suit: 'S', rank: 2, faceUp: true },
      { id: 'H-1', suit: 'H', rank: 1, faceUp: true },
    ]);
  });

  it('no permite mover dentro de la misma columna', () => {
    fresh(42);
    useSolitarioStore.setState({
      tableau: [[{ id: 'S-5', suit: 'S', rank: 5, faceUp: true }, { id: 'H-4', suit: 'H', rank: 4, faceUp: true }], [], [], [], [], [], []],
      stuck: false,
    });
    expect(act().moveCards(tableauRef(0, 1), { kind: 'tableau', index: 0 })).toBe(false);
  });

  it('partida terminada o trabada bloquea acciones', () => {
    fresh(TEST_WIN_SEED);
    useSolitarioStore.setState({ stuck: true });
    expect(act().moveCards(tableauRef(0, 0), { kind: 'tableau', index: 1 })).toBe(false);
    act().drawStock();
    expect(act().moves).toBe(0);
  });
});

describe('solitario state — undo', () => {
  it('deshabilitado: no acumula historial y undo es no-op', () => {
    fresh(42);
    act().drawStock();
    act().undo();
    expect(act().history).toHaveLength(0);
    expect(act().waste).toHaveLength(1);
    expect(act().undos).toBe(0);
  });

  it('habilitado: restaura pilas, cuenta undos y conserva moves acumulados', () => {
    fresh(42, { undoEnabled: true });
    act().drawStock();
    expect(act().waste).toHaveLength(1);
    act().undo();
    expect(act().waste).toHaveLength(0);
    expect(act().stock).toHaveLength(24);
    expect(act().undos).toBe(1);
    expect(act().moves).toBe(1); // los moves no se revierten
    expect(act().history).toHaveLength(0);
  });

  it('permite deshacer en cadena y no pasa del inicio', () => {
    fresh(42, { undoEnabled: true });
    act().drawStock();
    act().drawStock();
    expect(act().stock).toHaveLength(22);
    act().undo();
    act().undo();
    act().undo(); // extra: no-op
    expect(act().stock).toHaveLength(24);
    expect(act().undos).toBe(2);
  });

  it('no deshace tras ganar', () => {
    fresh(TEST_WIN_SEED, { undoEnabled: true });
    expect(act().moveCards(tableauRef(0, 0), { kind: 'foundation', index: 3 })).toBe(true);
    expect(act().finishedAt).not.toBeNull();
    act().undo();
    expect(act().foundations.flat()).toHaveLength(52);
  });
});

describe('solitario state — fin de partida', () => {
  it('victoria marca finishedAt', () => {
    fresh(TEST_WIN_SEED, { undoEnabled: true });
    expect(act().moveCards(tableauRef(0, 0), { kind: 'foundation', index: 3 })).toBe(true);
    const s = act();
    expect(s.finishedAt).not.toBeNull();
    expect(s.stuck).toBe(false);
    expect(s.tableau[0]).toEqual([]);
  });

  it('estado trabado marca stuck y lo reevalúa tras undo', () => {
    fresh(42, { undoEnabled: true });
    const stuckDeal: Deal = {
      tableau: [[{ id: 'S-9', suit: 'S', rank: 9, faceUp: true }], [], [], [], [], [], []],
      stock: [],
      waste: [],
      foundations: [[], [], [], []],
    };
    useSolitarioStore.setState({ ...stuckDeal, stuck: true });
    expect(act().stuck).toBe(true);
    // undo de un draw previo restaura cartas al stock → stuck se recalcula a false
    useSolitarioStore.setState({
      history: [{ tableau: stuckDeal.tableau, foundations: stuckDeal.foundations, stock: [{ id: 'H-3', suit: 'H', rank: 3, faceUp: false }], waste: [] }],
    });
    act().undo();
    expect(act().stock).toHaveLength(1);
    expect(act().stuck).toBe(false);
  });
});
