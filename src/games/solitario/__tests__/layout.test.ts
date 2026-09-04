import { cardPosition, columnExtent, computeLayout, hitTestPile, wasteOffsetX } from '../engine/layout';

const layout = computeLayout(390, 800); // ancho típico de teléfono

describe('computeLayout', () => {
  it('7 columnas equiespaciadas que caben en el contenedor', () => {
    expect(layout.tableau).toHaveLength(7);
    expect(layout.foundations).toHaveLength(4);
    for (const rect of [...layout.tableau, ...layout.foundations]) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(390);
    }
    // stock, waste y 4 foundations comparten la fila superior
    expect(layout.stock.y).toBe(0);
    expect(layout.waste.y).toBe(0);
    expect(layout.foundations.every((r) => r.y === 0)).toBe(true);
    // el tableau arranca debajo de la fila superior
    expect(layout.tableau[0].y).toBeGreaterThanOrEqual(layout.cardHeight);
  });

  it('limita el tamaño de carta por alto disponible', () => {
    const short = computeLayout(390, 500);
    expect(short.cardWidth).toBeLessThanOrEqual(layout.cardWidth);
    const huge = computeLayout(1400, 1200);
    expect(huge.cardWidth).toBeLessThanOrEqual(92); // cap
  });

  it('el fan de faceUp es mayor que el de faceDown', () => {
    expect(layout.faceUpOffset).toBeGreaterThan(layout.faceDownOffset);
    expect(layout.faceDownOffset).toBeGreaterThan(0);
  });
});

describe('columnExtent', () => {
  const card = (faceUp: boolean) => ({ id: 'x', suit: 'S' as const, rank: 5, faceUp });

  it('columna vacía = alto de una carta', () => {
    expect(columnExtent(layout, [])).toBe(layout.cardHeight);
  });

  it('solo faceUp: (n-1)*faceUpOffset + carta', () => {
    const col = [card(true), card(true), card(true)];
    expect(columnExtent(layout, col)).toBe(2 * layout.faceUpOffset + layout.cardHeight);
  });

  it('mezcla faceDown y faceUp', () => {
    const col = [card(false), card(false), card(true), card(true)];
    expect(columnExtent(layout, col)).toBe(
      2 * layout.faceDownOffset + 1 * layout.faceUpOffset + layout.cardHeight,
    );
  });

  it('columna totalmente boca abajo: todas las cartas cuentan como faceDown', () => {
    const col = [card(false), card(false), card(false)];
    expect(columnExtent(layout, col)).toBe(2 * layout.faceDownOffset + layout.cardHeight);
  });
});

describe('wasteOffsetX', () => {
  it('fan solo entre las últimas 3 cartas', () => {
    const step = Math.round(layout.cardWidth * 0.16);
    expect(wasteOffsetX(layout, 0, 1)).toBe(0);
    expect(wasteOffsetX(layout, 0, 5)).toBe(0);
    expect(wasteOffsetX(layout, 2, 5)).toBe(0);
    expect(wasteOffsetX(layout, 3, 5)).toBe(step);
    expect(wasteOffsetX(layout, 4, 5)).toBe(step * 2);
  });
});

describe('cardPosition', () => {
  const card = (faceUp: boolean) => ({ id: 'x', suit: 'S' as const, rank: 5, faceUp });

  it('tableau acumula offsets según cartas previas', () => {
    const col = [card(false), card(false), card(true)];
    const pos = cardPosition(layout, { kind: 'tableau', index: 2, cardIndex: 0 }, col, 2);
    expect(pos.x).toBe(layout.tableau[2].x);
    expect(pos.y).toBe(layout.tableau[2].y + 2 * layout.faceDownOffset);
  });

  it('waste aplica el fan horizontal', () => {
    const waste = [card(true), card(true), card(true), card(true)];
    const pos = cardPosition(layout, { kind: 'waste' }, waste, 3);
    expect(pos.x).toBe(layout.waste.x + wasteOffsetX(layout, 3, 4));
    expect(pos.y).toBe(layout.waste.y);
  });

  it('foundation es el slot plano', () => {
    const pos = cardPosition(layout, { kind: 'foundation', index: 3 }, [card(true)], 0);
    expect(pos).toEqual({ x: layout.foundations[3].x, y: layout.foundations[3].y });
  });
});

describe('hitTestPile', () => {
  const col = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `c${i}`, suit: 'S' as const, rank: 5, faceUp: true }));
  const tableau = [col(0), col(1), col(6), col(0), col(0), col(0), col(0)];

  const center = (rect: { x: number; y: number; width: number; height: number }) => ({
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  });

  it('centro de una foundation la identifica', () => {
    for (let i = 0; i < 4; i++) {
      const point = center(layout.foundations[i]);
      expect(hitTestPile(layout, point.x, point.y, tableau)).toEqual({ kind: 'foundation', index: i });
    }
  });

  it('toda la extensión de una columna apunta a ella (no solo el slot base)', () => {
    // col 2 tiene 6 cartas faceUp: el fondo de la pila sigue siendo drop-zone
    const rect = layout.tableau[2];
    const bottomY = rect.y + 5 * layout.faceUpOffset + layout.cardHeight - 2;
    expect(hitTestPile(layout, rect.x + rect.width / 2, bottomY, tableau)).toEqual({
      kind: 'tableau',
      index: 2,
    });
  });

  it('stock y waste no son destinos', () => {
    const stock = center(layout.stock);
    expect(hitTestPile(layout, stock.x, stock.y, tableau)).toBeNull();
    const waste = center(layout.waste);
    expect(hitTestPile(layout, waste.x, waste.y, tableau)).toBeNull();
  });

  it('fuera del tablero devuelve null', () => {
    expect(hitTestPile(layout, -50, -50, tableau)).toBeNull();
    expect(hitTestPile(layout, 10_000, 10_000, tableau)).toBeNull();
  });

  it('no hay solapamiento entre columnas vecinas', () => {
    const rect0 = layout.tableau[0];
    const rect1 = layout.tableau[1];
    expect(rect0.x + rect0.width).toBeLessThanOrEqual(rect1.x);
  });
});
