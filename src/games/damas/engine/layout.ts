import { COLUMNS, colOf, rowOf, toIndex } from './board';

export interface DamasLayout {
  /** lado de cada casilla (tablero cuadrado) */
  square: number;
  /** lado total del tablero = square * 8 */
  boardSize: number;
  /** offsets del tablero dentro del contenedor (centrado horizontal) */
  originX: number;
  originY: number;
}

/** Reserva lateral. */
const PADDING = 12;
/** Reserva vertical para chromeBar del contenedor + header. */
const CHROME_HEIGHT = 200;

/**
 * Geometría del tablero: fuente única para render e hit-testing.
 * Derivada del tamaño del contenedor (onLayout), sin measure() async.
 */
export function computeLayout(containerWidth: number, containerHeight: number): DamasLayout {
  const availableWidth = containerWidth - PADDING * 2;
  const availableHeight = Math.max(containerHeight - CHROME_HEIGHT, 300);
  const square = Math.floor(Math.min(availableWidth, availableHeight) / COLUMNS);
  const boardSize = square * COLUMNS;
  return {
    square,
    boardSize,
    originX: Math.floor(Math.max(0, (containerWidth - boardSize) / 2)),
    originY: 0,
  };
}

/** Esquina superior izquierda de la casilla `index` (coords del contenedor). */
export function squarePosition(layout: DamasLayout, index: number): { x: number; y: number } {
  return {
    x: layout.originX + colOf(index) * layout.square,
    y: layout.originY + rowOf(index) * layout.square,
  };
}

/** Centro de la casilla `index` (coords del contenedor). */
export function squareCenter(layout: DamasLayout, index: number): { x: number; y: number } {
  const pos = squarePosition(layout, index);
  return { x: pos.x + layout.square / 2, y: pos.y + layout.square / 2 };
}

/** Casilla para un punto en coords del contenedor; null si está fuera. */
export function hitTestSquare(layout: DamasLayout, x: number, y: number): number | null {
  const col = Math.floor((x - layout.originX) / layout.square);
  const row = Math.floor((y - layout.originY) / layout.square);
  if (col < 0 || col >= COLUMNS || row < 0 || row >= COLUMNS) return null;
  return toIndex(row, col);
}
