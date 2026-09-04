/** Reserva vertical para chromeBar del contenedor + header + scoreboard. */
export const CHROME_HEIGHT = 190;
export const PADDING = 12;
export const GAP = 8;
export const NARROW_BREAKPOINT = 420;
export const GRID_COLUMNS_WIDE = 4;
export const GRID_COLUMNS_NARROW = 3;
/** Total de cartas: 8 pares (PAIR_COUNT * 2). */
export const TOTAL_CARDS = 16;

/** Columnas del grid según el ancho (mobile-first). */
export function columnsForWidth(containerWidth: number): number {
  return containerWidth < NARROW_BREAKPOINT ? GRID_COLUMNS_NARROW : GRID_COLUMNS_WIDE;
}

export interface CardSize {
  cardWidth: number;
  cardHeight: number;
}

/**
 * Tamaño de carta que llena el contenedor en AMBAS dimensiones (sin scroll):
 * deriva de `min(ancho, alto disponible)` — patrón damas/solitario.
 */
export function computeCardSize(
  containerWidth: number,
  containerHeight: number,
  columns: number,
  totalCards: number = TOTAL_CARDS,
): CardSize {
  const rows = Math.ceil(totalCards / columns);
  const availableWidth = containerWidth - PADDING * 2;
  const availableHeight = Math.max(containerHeight - CHROME_HEIGHT, 300);

  const cardWidthByWidth = Math.floor((availableWidth - GAP * (columns - 1)) / columns);
  const cardHeightByWidth = Math.round((cardWidthByWidth * 4) / 3);
  const cardHeightByHeight = Math.floor((availableHeight - GAP * (rows - 1)) / rows);

  const cardHeight = Math.min(cardHeightByWidth, Math.max(cardHeightByHeight, 48));
  const cardWidth = Math.round((cardHeight * 3) / 4);
  return { cardWidth, cardHeight };
}
