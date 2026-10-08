export const PADDING = 12;
export const GAP = 8;
export const GRID_COLUMNS_WIDE = 4;
/** Total de cartas del nivel default: 8 pares (PAIR_COUNT * 2, fácil). */
export const TOTAL_CARDS = 16;

/**
 * Columnas del grid, ESTANDARIZADAS en 4 para los tres niveles: fácil 4×4,
 * medio 4×5 y difícil 4×6 (feedback de playtest: misma forma mental de
 * escanear el tablero en cualquier nivel, targets más grandes en angosto —
 * antes 16 cartas usaban 3 columnas con cartas ~63×84px).
 * Los params quedan por compatibilidad con tests/callers.
 */
export function columnsForWidth(_containerWidth?: number, _totalCards?: number): number {
  return GRID_COLUMNS_WIDE;
}

export interface CardSize {
  cardWidth: number;
  cardHeight: number;
}

/**
 * Tamaño de carta que llena el contenedor en AMBAS dimensiones (sin scroll):
 * deriva de `min(ancho, alto disponible)` — patrón damas/solitario.
 * `containerWidth/Height` son el tamaño REAL del área de juego medida con
 * onLayout (ver useContainerSize), no el de la ventana.
 */
export function computeCardSize(
  containerWidth: number,
  containerHeight: number,
  columns: number,
  totalCards: number = TOTAL_CARDS,
): CardSize {
  const rows = Math.ceil(totalCards / columns);
  const availableWidth = containerWidth - PADDING * 2;
  const availableHeight = Math.max(containerHeight, 300);

  const cardWidthByWidth = Math.floor((availableWidth - GAP * (columns - 1)) / columns);
  const cardHeightByWidth = Math.round((cardWidthByWidth * 4) / 3);
  const cardHeightByHeight = Math.floor((availableHeight - GAP * (rows - 1)) / rows);

  const cardHeight = Math.min(cardHeightByWidth, Math.max(cardHeightByHeight, 48));
  const cardWidth = Math.round((cardHeight * 3) / 4);
  return { cardWidth, cardHeight };
}
