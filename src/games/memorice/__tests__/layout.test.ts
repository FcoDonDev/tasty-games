import { columnsForWidth, computeCardSize, GRID_COLUMNS_WIDE } from '../engine/layout';

describe('memorice: layout responsive', () => {
  it('columnsForWidth estandarizado: 4 columnas SIEMPRE (4×4 / 4×5 / 4×6)', () => {
    expect(columnsForWidth(360, 16)).toBe(GRID_COLUMNS_WIDE);
    expect(columnsForWidth(360, 20)).toBe(GRID_COLUMNS_WIDE);
    expect(columnsForWidth(360, 24)).toBe(GRID_COLUMNS_WIDE);
    expect(columnsForWidth(360)).toBe(GRID_COLUMNS_WIDE);
    expect(columnsForWidth(1280, 16)).toBe(GRID_COLUMNS_WIDE);
  });

  it('360×640: facil (16 cartas, grilla 4×4) llena el alto sin scroll', () => {
    const columns = columnsForWidth(360);
    const { cardHeight } = computeCardSize(360, 640, columns, 16);
    const rows = Math.ceil(16 / columns);
    const gridHeight = rows * cardHeight + (rows - 1) * 8;
    expect(gridHeight).toBeLessThanOrEqual(640);
    expect(gridHeight).toBeGreaterThanOrEqual(400); // cartas más grandes que con 3 col
  });

  it('360×640: medio (20 cartas, grilla 4×5) llena el alto sin scroll', () => {
    const columns = columnsForWidth(360, 20);
    const { cardHeight } = computeCardSize(360, 640, columns, 20);
    const rows = Math.ceil(20 / columns);
    const gridHeight = rows * cardHeight + (rows - 1) * 8;
    expect(gridHeight).toBeLessThanOrEqual(640);
    expect(gridHeight).toBeGreaterThanOrEqual(500); // aprovecha el alto
  });

  it('360×640: dificil (24 cartas, grilla 4×6) llena el alto sin scroll', () => {
    const columns = columnsForWidth(360, 24);
    const { cardHeight } = computeCardSize(360, 640, columns, 24);
    const rows = Math.ceil(24 / columns);
    const gridHeight = rows * cardHeight + (rows - 1) * 8;
    expect(gridHeight).toBeLessThanOrEqual(640);
    expect(gridHeight).toBeGreaterThanOrEqual(500); // aprovecha el alto
  });

  it('área medida angosta (360×490): el grid cabe exacto', () => {
    const columns = columnsForWidth(360);
    const { cardHeight } = computeCardSize(360, 490, columns, 16);
    const rows = Math.ceil(16 / columns);
    const gridHeight = rows * cardHeight + (rows - 1) * 8;
    expect(gridHeight).toBeLessThanOrEqual(490);
  });

  it('1280×900: las cartas crecen para aprovechar la altura', () => {
    const desktop = computeCardSize(1280, 900, GRID_COLUMNS_WIDE, 16);
    const mobile = computeCardSize(360, 640, GRID_COLUMNS_WIDE, 16);
    expect(desktop.cardHeight).toBeGreaterThan(mobile.cardHeight);
    // Desktop llena más de la mitad del alto disponible
    const rows = 4;
    expect(rows * desktop.cardHeight + (rows - 1) * 8).toBeGreaterThan(400);
  });

  it('alturas extremas quedan con un mínimo sane', () => {
    const tiny = computeCardSize(360, 300, GRID_COLUMNS_WIDE, 16);
    expect(tiny.cardHeight).toBeGreaterThanOrEqual(48);
    expect(tiny.cardWidth).toBeGreaterThan(0);
  });

  it('proporción de carta 3:4', () => {
    const { cardWidth, cardHeight } = computeCardSize(1280, 900, GRID_COLUMNS_WIDE, 16);
    expect(cardHeight).toBeGreaterThanOrEqual(cardWidth);
    expect(Math.round((cardWidth * 4) / 3)).toBeLessThanOrEqual(cardHeight + 2);
  });
});
