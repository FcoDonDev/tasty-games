import type { Card } from './deck';
import type { PileRef, TargetRef } from './rules';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SolitaireLayout {
  cardWidth: number;
  cardHeight: number;
  /** separación vertical de cartas boca abajo en tableau */
  faceDownOffset: number;
  /** separación vertical de cartas boca arriba en tableau */
  faceUpOffset: number;
  gap: number;
  stock: Rect;
  waste: Rect;
  /** 4 slots, indexados por palo */
  foundations: Rect[];
  /** slot base (top) de cada una de las 7 columnas */
  tableau: Rect[];
  /** alto total que ocupa el tablero (para dimensionar el contenedor) */
  topRowHeight: number;
}

const PADDING = 8;
const GAP = 4;
const COLUMNS = 7;
/** Mobile-first: en pantallas grandes la carta crece hasta este tope. */
const MAX_CARD_WIDTH = 128;
/** Reserva vertical para chromeBar del contenedor + header + scoreboard. */
const CHROME_HEIGHT = 200;
/** Factor de columna para caber en el alto disponible (carta + fan típico). */
const MAX_COLUMN_FACTOR = 4.6;

/**
 * Geometría del tablero: fuente única para render e hit-testing.
 * Todo se deriva del tamaño del contenedor (onLayout), sin measure() async.
 */
export function computeLayout(containerWidth: number, containerHeight: number): SolitaireLayout {
  const byWidth = (containerWidth - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
  const availableHeight = Math.max(containerHeight - CHROME_HEIGHT, 300);
  const byHeight = availableHeight / MAX_COLUMN_FACTOR;
  const cardWidth = Math.floor(Math.min(byWidth, byHeight, MAX_CARD_WIDTH));
  const cardHeight = Math.round(cardWidth * 1.45);
  const faceDownOffset = Math.round(cardHeight * 0.13);
  const faceUpOffset = Math.round(cardHeight * 0.24);

  const stock: Rect = { x: PADDING, y: 0, width: cardWidth, height: cardHeight };
  const waste: Rect = { x: PADDING + cardWidth + GAP, y: 0, width: cardWidth, height: cardHeight };
  const foundationsStart = PADDING + (cardWidth + GAP) * 3;
  const foundations: Rect[] = Array.from({ length: 4 }, (_, i) => ({
    x: foundationsStart + i * (cardWidth + GAP),
    y: 0,
    width: cardWidth,
    height: cardHeight,
  }));

  const tableauY = cardHeight + GAP + 8;
  const tableau: Rect[] = Array.from({ length: COLUMNS }, (_, i) => ({
    x: PADDING + i * (cardWidth + GAP),
    y: tableauY,
    width: cardWidth,
    height: cardHeight,
  }));

  return {
    cardWidth,
    cardHeight,
    faceDownOffset,
    faceUpOffset,
    gap: GAP,
    stock,
    waste,
    foundations,
    tableau,
    topRowHeight: cardHeight,
  };
}

/** Alto visual de una columna de tableau (carta + solapamientos). */
export function columnExtent(layout: SolitaireLayout, column: Card[]): number {
  const n = column.length;
  if (n === 0) return layout.cardHeight;
  let extent = layout.cardHeight;
  // cada hueco depende de la visibilidad de la carta que queda encima
  for (let i = 0; i < n - 1; i++) {
    extent += column[i].faceUp ? layout.faceUpOffset : layout.faceDownOffset;
  }
  return extent;
}

/** Offset horizontal de la carta `index` en la waste (fan de las últimas 3). */
export function wasteOffsetX(layout: SolitaireLayout, index: number, count: number): number {
  if (count <= 1) return 0;
  const firstVisible = Math.max(0, count - 3);
  return Math.max(0, index - firstVisible) * Math.round(layout.cardWidth * 0.16);
}

/** Posición (coords del tablero) de la carta `index` dentro de su pila. */
export function cardPosition(
  layout: SolitaireLayout,
  pile: PileRef,
  cards: Card[],
  index: number,
): { x: number; y: number } {
  switch (pile.kind) {
    case 'waste': {
      const rect = layout.waste;
      return { x: rect.x + wasteOffsetX(layout, index, cards.length), y: rect.y };
    }
    case 'foundation': {
      const rect = layout.foundations[pile.index];
      return { x: rect.x, y: rect.y };
    }
    case 'tableau': {
      const rect = layout.tableau[pile.index];
      let y = rect.y;
      for (let i = 0; i < index; i++) {
        y += cards[i].faceUp ? layout.faceUpOffset : layout.faceDownOffset;
      }
      return { x: rect.x, y };
    }
  }
}

/**
 * Pila destino para un punto en coords del tablero (centro de la carta
 * arrastrada). Solo devuelve destinos válidos: foundations y columnas.
 */
export function hitTestPile(
  layout: SolitaireLayout,
  x: number,
  y: number,
  tableau: Card[][],
): TargetRef | null {
  const slack = 8;

  for (let i = 0; i < layout.foundations.length; i++) {
    const rect = layout.foundations[i];
    if (
      x >= rect.x - slack &&
      x <= rect.x + rect.width + slack &&
      y >= rect.y - slack &&
      y <= rect.y + rect.height + slack
    ) {
      return { kind: 'foundation', index: i };
    }
  }

  for (let i = 0; i < layout.tableau.length; i++) {
    const rect = layout.tableau[i];
    const extent = columnExtent(layout, tableau[i]);
    if (
      x >= rect.x - slack &&
      x <= rect.x + rect.width + slack &&
      y >= rect.y - slack &&
      y <= rect.y + extent
    ) {
      return { kind: 'tableau', index: i };
    }
  }

  return null;
}
