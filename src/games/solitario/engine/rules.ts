import { SUITS, isRedSuit, type Card, type Deal } from './deck';

/**
 * Origen de un arrastre. `cardIndex` (solo tableau) = posición de la primera
 * carta de la subsecuencia arrastrada.
 */
export type PileRef =
  | { kind: 'waste' }
  | { kind: 'foundation'; index: number }
  | { kind: 'tableau'; index: number; cardIndex: number };

/** Destino de un arrastre (stock y waste nunca reciben cartas). */
export type TargetRef = { kind: 'foundation'; index: number } | { kind: 'tableau'; index: number };

/** Subsecuencia bajable: faceUp, rangos descendentes y colores alternados. */
export function isValidSequence(cards: Card[]): boolean {
  if (cards.length === 0) return false;
  for (let i = 0; i < cards.length; i++) {
    if (!cards[i].faceUp) return false;
    if (i > 0) {
      const prev = cards[i - 1];
      const curr = cards[i];
      if (curr.rank !== prev.rank - 1) return false;
      if (isRedSuit(curr.suit) === isRedSuit(prev.suit)) return false;
    }
  }
  return true;
}

export function canDropOnTableau(moving: Card[], dest: Card[]): boolean {
  if (moving.length === 0 || !isValidSequence(moving)) return false;
  if (dest.length === 0) return moving[0].rank === 13;
  const top = dest[dest.length - 1];
  if (!top.faceUp) return false;
  return top.rank === moving[0].rank + 1 && isRedSuit(top.suit) !== isRedSuit(moving[0].suit);
}

export function canDropOnFoundation(card: Card, foundationPile: Card[]): boolean {
  if (foundationPile.length === 0) return card.rank === 1;
  const top = foundationPile[foundationPile.length - 1];
  return top.suit === card.suit && top.rank === card.rank - 1;
}

/** Índice de foundation que corresponde al palo de la carta. */
export function foundationIndexFor(card: Card): number {
  return SUITS.indexOf(card.suit);
}

/** Cartas que se pueden levantar desde `from` (null si el origen no es válido). */
export function canPickUp(dealState: Deal, from: PileRef): Card[] | null {
  switch (from.kind) {
    case 'waste': {
      const top = dealState.waste[dealState.waste.length - 1];
      return top && top.faceUp ? [top] : null;
    }
    case 'foundation': {
      const pile = dealState.foundations[from.index];
      const top = pile[pile.length - 1];
      return top && top.faceUp ? [top] : null;
    }
    case 'tableau': {
      const col = dealState.tableau[from.index];
      if (from.cardIndex < 0 || from.cardIndex >= col.length) return null;
      const seq = col.slice(from.cardIndex);
      return isValidSequence(seq) ? seq : null;
    }
  }
}

export function isWon(dealState: Deal): boolean {
  return dealState.foundations.reduce((total, pile) => total + pile.length, 0) === 52;
}

/**
 * Quedan jugadas posibles. Definición pragmática: si hay stock o waste, siempre
 * se puede robar/reciclar (reciclaje ilimitado), así que "sin movimientos" solo
 * se declara con stock y waste vacíos y sin jugadas tableau↔foundation.
 */
export function hasAnyMove(dealState: Deal): boolean {
  if (dealState.stock.length > 0 || dealState.waste.length > 0) return true;

  for (let col = 0; col < dealState.tableau.length; col++) {
    const column = dealState.tableau[col];
    if (column.length === 0) continue;

    const top = column[column.length - 1];
    if (canDropOnFoundation(top, dealState.foundations[foundationIndexFor(top)])) return true;

    for (let i = column.length - 1; i >= 0 && column[i].faceUp; i--) {
      const seq = column.slice(i);
      for (let dest = 0; dest < dealState.tableau.length; dest++) {
        if (dest === col) continue;
        if (canDropOnTableau(seq, dealState.tableau[dest])) return true;
      }
    }
  }

  for (const pile of dealState.foundations) {
    const top = pile[pile.length - 1];
    if (!top) continue;
    for (const column of dealState.tableau) {
      if (canDropOnTableau([top], column)) return true;
    }
  }

  return false;
}

export const SCORE_BASE = 1000;
export const SCORE_PER_MOVE = 5;
export const SCORE_PER_UNDO = 25;

/** Convención: más es mejor. `floor(segundos/2)` penaliza el tiempo. */
export function scoreFor(moves: number, durationMs: number, undos: number): number {
  const seconds = Math.floor(durationMs / 1000);
  return Math.max(0, SCORE_BASE - SCORE_PER_MOVE * moves - Math.floor(seconds / 2) - SCORE_PER_UNDO * undos);
}
