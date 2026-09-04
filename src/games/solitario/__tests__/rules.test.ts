import { SUITS, TEST_MOVE_SEED, TEST_WIN_SEED, buildDeck, deal, isRedSuit, parseSeed, type Card, type Deal, type Suit } from '../engine/deck';
import {
  SCORE_BASE,
  canDropOnFoundation,
  canDropOnTableau,
  canPickUp,
  foundationIndexFor,
  hasAnyMove,
  isWon,
  isValidSequence,
  scoreFor,
  type PileRef,
} from '../engine/rules';

const card = (suit: Suit, rank: number, faceUp = true): Card => ({
  id: `${suit}-${rank}`,
  suit,
  rank,
  faceUp,
});

const emptyDeal = (): Deal => ({
  tableau: [[], [], [], [], [], [], []],
  stock: [],
  waste: [],
  foundations: SUITS.map(() => []),
});

describe('deck', () => {
  it('buildDeck arma 52 cartas únicas, 13 por palo, todas boca abajo', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
    for (const suit of SUITS) {
      const ofSuit = deck.filter((c) => c.suit === suit);
      expect(ofSuit).toHaveLength(13);
      expect(ofSuit.map((c) => c.rank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    }
    expect(deck.every((c) => !c.faceUp)).toBe(true);
  });

  it('deal reparte 7 columnas (col i = i+1 cartas), stock de 24 y foundations vacías', () => {
    const d = deal(42);
    d.tableau.forEach((col, i) => {
      expect(col).toHaveLength(i + 1);
      expect(col[col.length - 1].faceUp).toBe(true);
      expect(col.slice(0, -1).every((c) => !c.faceUp)).toBe(true);
    });
    expect(d.stock).toHaveLength(24);
    expect(d.stock.every((c) => !c.faceUp)).toBe(true);
    expect(d.waste).toHaveLength(0);
    expect(d.foundations).toHaveLength(4);
    expect(d.foundations.every((p) => p.length === 0)).toBe(true);
  });

  it('deal con seed es determinista y sin seed reparte 52 cartas en total', () => {
    const a = deal(7);
    const b = deal(7);
    expect(a.tableau.flat().map((c) => c.id)).toEqual(b.tableau.flat().map((c) => c.id));
    expect(deal().tableau.flat().length + deal().stock.length).toBe(52);
  });

  it('TEST_WIN_SEED produce estado a un movimiento de ganar', () => {
    const d = deal(TEST_WIN_SEED);
    expect(isWon(d)).toBe(false);
    expect(d.stock).toHaveLength(0);
    expect(d.waste).toHaveLength(0);
    // K♣ en el top del tableau 0, foundation de ♣ tiene A..Q
    const king = d.tableau[0][0];
    expect(king.suit).toBe('C');
    expect(king.rank).toBe(13);
    const clubFoundation = d.foundations[foundationIndexFor(king)];
    expect(clubFoundation).toHaveLength(12);
    expect(canDropOnFoundation(king, clubFoundation)).toBe(true);
  });

  it('TEST_MOVE_SEED: A♠ al top del stock y K♠ faceUp en col 0', () => {
    const d = deal(TEST_MOVE_SEED);
    expect(d.stock[d.stock.length - 1]).toMatchObject({ suit: 'S', rank: 1, faceUp: false });
    expect(d.tableau[0][0]).toMatchObject({ suit: 'S', rank: 13, faceUp: true });
    expect(d.foundations.every((p) => p.length === 0)).toBe(true);
  });

  it('parseSeed mapea los seeds de test y descarta el resto', () => {
    expect(parseSeed('test-win')).toBe(TEST_WIN_SEED);
    expect(parseSeed('test-move')).toBe(TEST_MOVE_SEED);
    expect(parseSeed('cualquier-cosa')).toBeUndefined();
    expect(parseSeed(undefined)).toBeUndefined();
  });
});

describe('isValidSequence', () => {
  it('acepta descenso con alternancia de color', () => {
    expect(isValidSequence([card('S', 5), card('H', 4), card('C', 3)])).toBe(true);
    expect(isValidSequence([card('H', 5), card('S', 4)])).toBe(true);
  });

  it('rechaza mismo color, mismo palo contiguo y saltos de rango', () => {
    expect(isValidSequence([card('S', 5), card('C', 4)])).toBe(false); // ambos negros
    expect(isValidSequence([card('H', 5), card('D', 4)])).toBe(false); // ambos rojos
    expect(isValidSequence([card('S', 5), card('S', 4)])).toBe(false);
    expect(isValidSequence([card('S', 5), card('H', 3)])).toBe(false);
    expect(isValidSequence([card('S', 5), card('H', 5)])).toBe(false);
  });

  it('rechaza subsecuencia vacía y cartas boca abajo', () => {
    expect(isValidSequence([])).toBe(false);
    expect(isValidSequence([card('S', 5), card('H', 4, false)])).toBe(false);
  });
});

describe('canDropOnTableau', () => {
  it('columna vacía acepta solo K', () => {
    expect(canDropOnTableau([card('S', 13)], [])).toBe(true);
    expect(canDropOnTableau([card('H', 13)], [])).toBe(true);
    expect(canDropOnTableau([card('S', 12)], [])).toBe(false);
  });

  it('acepta rango inmediatamente inferior con color alternado', () => {
    expect(canDropOnTableau([card('H', 4)], [card('S', 5)])).toBe(true);
    expect(canDropOnTableau([card('S', 4)], [card('H', 5)])).toBe(true);
    expect(canDropOnTableau([card('C', 4)], [card('S', 5)])).toBe(false);
    expect(canDropOnTableau([card('D', 4)], [card('H', 5)])).toBe(false);
    expect(canDropOnTableau([card('S', 3)], [card('S', 5)])).toBe(false);
  });

  it('rechaza sobre carta boca abajo', () => {
    expect(canDropOnTableau([card('H', 4)], [card('S', 5, false)])).toBe(false);
  });

  it('valida la subsecuencia completa, no solo la primera carta', () => {
    expect(canDropOnTableau([card('H', 4), card('S', 3)], [card('S', 5)])).toBe(true);
    expect(canDropOnTableau([card('H', 4), card('D', 3)], [card('S', 5)])).toBe(false);
    expect(canDropOnTableau([card('H', 4), card('S', 2)], [card('S', 5)])).toBe(false);
  });
});

describe('canDropOnFoundation', () => {
  it('pila vacía acepta solo As', () => {
    expect(canDropOnFoundation(card('S', 1), [])).toBe(true);
    expect(canDropOnFoundation(card('S', 2), [])).toBe(false);
  });

  it('acepta solo mismo palo y rango ascendente', () => {
    const pile = [card('S', 1), card('S', 2)];
    expect(canDropOnFoundation(card('S', 3), pile)).toBe(true);
    expect(canDropOnFoundation(card('H', 3), pile)).toBe(false);
    expect(canDropOnFoundation(card('S', 4), pile)).toBe(false);
    expect(canDropOnFoundation(card('S', 1), pile)).toBe(false);
  });
});

describe('canPickUp', () => {
  it('waste: solo el top', () => {
    const d = emptyDeal();
    d.waste = [card('S', 5), card('H', 3)];
    expect(canPickUp(d, { kind: 'waste' })).toEqual([card('H', 3)]);
    d.waste = [];
    expect(canPickUp(d, { kind: 'waste' })).toBeNull();
  });

  it('foundation: solo el top', () => {
    const d = emptyDeal();
    d.foundations[0] = [card('S', 1), card('S', 2)];
    expect(canPickUp(d, { kind: 'foundation', index: 0 })).toEqual([card('S', 2)]);
  });

  it('tableau: subsecuencia válida desde cardIndex', () => {
    const d = emptyDeal();
    d.tableau[0] = [card('S', 9, false), card('H', 8), card('C', 7), card('H', 6)];
    expect(canPickUp(d, { kind: 'tableau', index: 0, cardIndex: 2 })).toEqual([card('C', 7), card('H', 6)]);
    expect(canPickUp(d, { kind: 'tableau', index: 0, cardIndex: 1 })).toEqual([
      card('H', 8),
      card('C', 7),
      card('H', 6),
    ]);
    // secuencia inválida (mismo color)
    d.tableau[1] = [card('S', 9), card('C', 8)];
    expect(canPickUp(d, { kind: 'tableau', index: 1, cardIndex: 0 })).toBeNull();
    // cardIndex fuera de rango
    expect(canPickUp(d, { kind: 'tableau', index: 0, cardIndex: 9 })).toBeNull();
    // arrancar desde una carta boca abajo
    d.tableau[2] = [card('S', 9, false), card('H', 8)];
    expect(canPickUp(d, { kind: 'tableau', index: 2, cardIndex: 0 })).toBeNull();
  });
});

describe('isWon y foundationIndexFor', () => {
  it('isWon: false con 51 cartas, true con las 52 en foundations', () => {
    const d = emptyDeal();
    expect(isWon(d)).toBe(false);
    d.foundations = SUITS.map((suit) => Array.from({ length: 13 }, (_, j) => card(suit, j + 1)));
    expect(isWon(d)).toBe(true);
    d.foundations[0] = d.foundations[0].slice(1);
    expect(isWon(d)).toBe(false);
  });

  it('foundationIndexFor mapea cada palo a su pila', () => {
    SUITS.forEach((suit, i) => expect(foundationIndexFor(card(suit, 1))).toBe(i));
  });
});

describe('hasAnyMove', () => {
  it('stock con cartas → siempre hay movimiento', () => {
    const d = emptyDeal();
    d.stock = [card('S', 5, false)];
    expect(hasAnyMove(d)).toBe(true);
  });

  it('waste con cartas (stock vacío) → reciclaje disponible', () => {
    const d = emptyDeal();
    d.waste = [card('S', 5)];
    expect(hasAnyMove(d)).toBe(true);
  });

  it('sin stock/waste: top de tableau a foundation cuenta', () => {
    const d = emptyDeal();
    d.tableau[0] = [card('H', 1)];
    expect(hasAnyMove(d)).toBe(true);
  });

  it('sin stock/waste: subsecuencia entre columnas cuenta', () => {
    const d = emptyDeal();
    d.tableau[0] = [card('S', 5)];
    d.tableau[1] = [card('H', 4)];
    expect(hasAnyMove(d)).toBe(true);
  });

  it('sin stock/waste: K a columna vacía cuenta', () => {
    const d = emptyDeal();
    d.tableau[0] = [card('S', 13), card('H', 12)];
    expect(hasAnyMove(d)).toBe(true);
  });

  it('sin stock/waste: foundation top a tableau cuenta', () => {
    const d = emptyDeal();
    d.foundations[0] = [card('S', 5)];
    d.tableau[0] = [card('H', 6)];
    expect(hasAnyMove(d)).toBe(true);
  });

  it('partida verdaderamente trabada → false', () => {
    const d = emptyDeal();
    // todos los tops son 9: ninguno cae sobre otro (necesitaría un 10 de
    // color opuesto), no hay As, no hay columnas vacías
    d.tableau[0] = [card('S', 9)];
    d.tableau[1] = [card('C', 9)];
    d.tableau[2] = [card('H', 9)];
    d.tableau[3] = [card('D', 9)];
    d.tableau[4] = [card('S', 9)];
    d.tableau[5] = [card('C', 9)];
    d.tableau[6] = [card('H', 9)];
    expect(hasAnyMove(d)).toBe(false);
  });
});

describe('scoreFor', () => {
  it('más movimientos/tiempo/undos = menos score, nunca negativo', () => {
    expect(scoreFor(0, 0, 0)).toBe(SCORE_BASE);
    expect(scoreFor(120, 0, 0)).toBeLessThan(scoreFor(100, 0, 0));
    expect(scoreFor(100, 60_000, 0)).toBeLessThan(scoreFor(100, 30_000, 0));
    expect(scoreFor(100, 0, 2)).toBe(scoreFor(100, 0, 0) - 50);
    expect(scoreFor(999, 60 * 60_000, 99)).toBe(0);
  });

  it('caso concreto: 120 moves, 5 min, 0 undos = 1000 - 600 - 150 = 250', () => {
    expect(scoreFor(120, 5 * 60_000, 0)).toBe(250);
  });
});

describe('convención de colores', () => {
  it('isRedSuit solo para ♥ y ♦', () => {
    expect(isRedSuit('H')).toBe(true);
    expect(isRedSuit('D')).toBe(true);
    expect(isRedSuit('S')).toBe(false);
    expect(isRedSuit('C')).toBe(false);
  });
});

describe('origen de tipo PileRef', () => {
  it('canPickUp respeta la forma de cada origen', () => {
    const d = emptyDeal();
    d.tableau[0] = [card('S', 5)];
    const ref: PileRef = { kind: 'tableau', index: 0, cardIndex: 0 };
    expect(canPickUp(d, ref)).toEqual([card('S', 5)]);
  });
});
