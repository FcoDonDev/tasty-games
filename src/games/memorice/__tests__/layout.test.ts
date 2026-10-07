import {
  columnsForWidth,
  computeCardSize,
  GRID_COLUMNS_NARROW,
  GRID_COLUMNS_WIDE,
  NARROW_BREAKPOINT,
} from '../engine/layout';

describe('memorice: layout responsive', () => {
  it('columnsForWidth: 3 columnas en pantallas angostas, 4 en el resto', () => {
    expect(columnsForWidth(360)).toBe(GRID_COLUMNS_NARROW);
    expect(columnsForWidth(NARROW_BREAKPOINT)).toBe(GRID_COLUMNS_WIDE);
    expect(columnsForWidth(1280)).toBe(GRID_COLUMNS_WIDE);
  });

  it('columnsForWidth con total de cartas (D7): 20/24 cartas usan 4 columnas en angosto', () => {
    expect(columnsForWidth(360, 16)).toBe(GRID_COLUMNS_NARROW);
    expect(columnsForWidth(360, 20)).toBe(GRID_COLUMNS_WIDE);
    expect(columnsForWidth(360, 24)).toBe(GRID_COLUMNS_WIDE);
    // en ancho, siempre 4
    expect(columnsForWidth(420, 20)).toBe(GRID_COLUMNS_WIDE);
    expect(columnsForWidth(1280, 24)).toBe(GRID_COLUMNS_WIDE);
  });

  it('360×640: medio (20 cartas, 4 col × 5 filas) llena el alto sin scroll', () => {
    const columns = columnsForWidth(360, 20);
    const { cardHeight } = computeCardSize(360, 640, columns, 20);
    const rows = Math.ceil(20 / columns);
    const gridHeight = rows * cardHeight + (rows - 1) * 8;
    expect(gridHeight).toBeLessThanOrEqual(640);
    expect(gridHeight).toBeGreaterThanOrEqual(500); // aprovecha el alto
  });

  it('360×640: dificil (24 cartas, 4 col × 6 filas) llena el alto sin scroll', () => {
    const columns = columnsForWidth(360, 24);
    const { cardHeight } = computeCardSize(360, 640, columns, 24);
    const rows = Math.ceil(24 / columns);
    const gridHeight = rows * cardHeight + (rows - 1) * 8;
    expect(gridHeight).toBeLessThanOrEqual(640);
    expect(gridHeight).toBeGreaterThanOrEqual(500); // aprovecha el alto
  });

  it('D7: con más cartas las cartas NO encogen drásticamente (4 col > 3 col)', () => {
    // 24 cartas: 4 columnas dan cartas más grandes que 3 (evaluación D3 del PLAN)
    const four = computeCardSize(360, 640, 4, 24);
    const three = computeCardSize(360, 640, 3, 24);
    expect(four.cardWidth).toBeGreaterThan(three.cardWidth);
    expect(four.cardHeight).toBeGreaterThan(three.cardHeight);
  });

  it('360×640 (área medida): el grid completo (16 cartas, 3×6) llena el alto sin scroll', () => {
    const columns = columnsForWidth(360);
    const { cardHeight } = computeCardSize(360, 640, columns);
    const rows = Math.ceil(16 / columns);
    const gridHeight = rows * cardHeight + (rows - 1) * 8;
    expect(gridHeight).toBeLessThanOrEqual(640);
    expect(gridHeight).toBeGreaterThanOrEqual(640 - rows); // aprovecha casi todo el alto
  });

  it('área medida angosta (360×490): el grid cabe exacto', () => {
    const columns = columnsForWidth(360);
    const { cardHeight } = computeCardSize(360, 490, columns);
    const rows = Math.ceil(16 / columns);
    const gridHeight = rows * cardHeight + (rows - 1) * 8;
    expect(gridHeight).toBeLessThanOrEqual(490);
  });

  it('1280×900: las cartas crecen para aprovechar la altura', () => {
    const desktop = computeCardSize(1280, 900, GRID_COLUMNS_WIDE);
    const mobile = computeCardSize(360, 640, GRID_COLUMNS_NARROW);
    expect(desktop.cardHeight).toBeGreaterThan(mobile.cardHeight);
    // Desktop llena más de la mitad del alto disponible
    const rows = 4;
    expect(rows * desktop.cardHeight + (rows - 1) * 8).toBeGreaterThan(400);
  });

  it('alturas extremas quedan con un mínimo sane', () => {
    const tiny = computeCardSize(360, 300, GRID_COLUMNS_NARROW);
    expect(tiny.cardHeight).toBeGreaterThanOrEqual(48);
    expect(tiny.cardWidth).toBeGreaterThan(0);
  });

  it('proporción de carta 3:4', () => {
    const { cardWidth, cardHeight } = computeCardSize(1280, 900, GRID_COLUMNS_WIDE);
    expect(cardHeight).toBeGreaterThanOrEqual(cardWidth);
    expect(Math.round((cardWidth * 4) / 3)).toBeLessThanOrEqual(cardHeight + 2);
  });
});
