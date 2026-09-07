/**
 * Breakpoints de columnas del grid del Home — SOLO NATIVO (probados con el
 * ancho REAL del área de lista). En web el Home usa siempre 1 columna con
 * ancho tope y centrado (app/index.tsx), mismo comportamiento que móvil.
 */
export type ColumnCount = 1 | 2 | 3;

/** 1 columna en teléfono (<480), 2 en tablet/media (<1024), 3 en ancho completo. */
export function columnsForWidth(width: number): ColumnCount {
  if (width >= 1024) return 3;
  if (width >= 480) return 2;
  return 1;
}
