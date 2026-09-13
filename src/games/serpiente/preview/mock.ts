/**
 * Estado falso compartido por las 3 versiones del preview (PLAN-SERPIENTE
 * §8). Sin engine aún: partida media verosímil para comparar temas, HUD y
 * feel estático. Grid 20×20 (D5), especial con caducidad (D7).
 */

export const GRID = 20;

export const toPreviewIndex = (row: number, col: number): number => row * GRID + col;

export const colOfPreview = (index: number): number => index % GRID;

export const rowOfPreview = (index: number): number => Math.floor(index / GRID);

/** Serpiente de 8 celdas, cabeza al frente, avanzando a la derecha (fila 10). */
export const MOCK_SNAKE: number[] = [12, 11, 10, 9, 8, 7, 6, 5].map((col) =>
  toPreviewIndex(10, col),
);

/** Comida dorada adelante de la cabeza. */
export const MOCK_FOOD = toPreviewIndex(10, 15);

/** Especial violeta con cuenta regresiva visible. */
export const MOCK_SPECIAL = toPreviewIndex(4, 4);
export const MOCK_SPECIAL_SECS = 7;

export const MOCK_SCORE = 120;
export const MOCK_EATEN = 12;

/** Popup de score flotando sobre el tablero (feel estático). */
export const MOCK_POPUP = { cell: toPreviewIndex(9, 13), text: '+10' };
