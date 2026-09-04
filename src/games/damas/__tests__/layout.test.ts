import { computeLayout, hitTestSquare, squareCenter, squarePosition } from '../engine/layout';

const layout = computeLayout(400, 800);

describe('layout: damas', () => {
  it('casilla derivada del ancho disponible y tablero centrado', () => {
    // (400 - 12*2) / 8 = 47
    expect(layout.square).toBe(47);
    expect(layout.boardSize).toBe(47 * 8);
    expect(layout.originX).toBe(12);
    expect(layout.originY).toBe(0);
  });

  it('squarePosition: esquinas del tablero', () => {
    expect(squarePosition(layout, 0)).toEqual({ x: 12, y: 0 });
    expect(squarePosition(layout, 9)).toEqual({ x: 12 + 47, y: 47 }); // r1,c1
    expect(squarePosition(layout, 63)).toEqual({ x: 12 + 7 * 47, y: 7 * 47 });
  });

  it('squareCenter cae en el medio de la casilla', () => {
    const center = squareCenter(layout, 28);
    const pos = squarePosition(layout, 28);
    expect(center.x).toBeCloseTo(pos.x + 23.5);
    expect(center.y).toBeCloseTo(pos.y + 23.5);
  });

  it('hitTestSquare: centros de casillas', () => {
    expect(hitTestSquare(layout, squareCenter(layout, 28).x, squareCenter(layout, 28).y)).toBe(28);
    expect(hitTestSquare(layout, squareCenter(layout, 63).x, squareCenter(layout, 63).y)).toBe(63);
    expect(hitTestSquare(layout, layout.originX + 1, 1)).toBe(0);
  });

  it('hitTestSquare: fuera del tablero devuelve null', () => {
    expect(hitTestSquare(layout, -5, 10)).toBeNull();
    expect(hitTestSquare(layout, layout.originX + layout.boardSize + 10, 10)).toBeNull();
    expect(hitTestSquare(layout, 10, layout.boardSize + 10)).toBeNull();
  });

  it('contenedor angosto: la casilla se achica', () => {
    const narrow = computeLayout(300, 2000);
    expect(narrow.square).toBe(Math.floor((300 - 24) / 8));
    expect(narrow.boardSize).toBe(narrow.square * 8);
  });
});
