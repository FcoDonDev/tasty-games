/** Breakpoints de columnas del grid del Home (probados con el ancho REAL del área de lista). */
export type ColumnCount = 1 | 2 | 3;

/** 1 columna en teléfono (<480), 2 en tablet/media (<1024), 3 en ancho completo. */
export function columnsForWidth(width: number): ColumnCount {
  if (width >= 1024) return 3;
  if (width >= 480) return 2;
  return 1;
}
