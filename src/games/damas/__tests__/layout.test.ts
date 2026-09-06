import { computeLayout, hitTestSquare, squareCenter, squarePosition } from '../engine/layout';

const layout = computeLayout(400, 800);

describe('layout: damas', () => {
  it('casilla derivada del área real medida y tablero centrado en ambos ejes', () => {
    // min(400, 800) / 8 = 50
    expect(layout.square).toBe(50);
    expect(layout.boardSize).toBe(400);
    expect(layout.originX).toBe(0);
    expect(layout.originY).toBe(200); // (800 - 400) / 2
  });

  it('squarePosition: esquinas del tablero (con centrado vertical)', () => {
    expect(squarePosition(layout, 0)).toEqual({ x: 0, y: 200 });
    expect(squarePosition(layout, 9)).toEqual({ x: 50, y: 250 }); // r1,c1
    expect(squarePosition(layout, 63)).toEqual({ x: 350, y: 550 });
  });

  it('squareCenter cae en el medio de la casilla', () => {
    const center = squareCenter(layout, 28);
    const pos = squarePosition(layout, 28);
    expect(center.x).toBeCloseTo(pos.x + 25);
    expect(center.y).toBeCloseTo(pos.y + 25);
  });

  it('hitTestSquare: centros de casillas', () => {
    expect(hitTestSquare(layout, squareCenter(layout, 28).x, squareCenter(layout, 28).y)).toBe(28);
    expect(hitTestSquare(layout, squareCenter(layout, 63).x, squareCenter(layout, 63).y)).toBe(63);
    expect(hitTestSquare(layout, layout.originX + 1, layout.originY + 1)).toBe(0);
  });

  it('hitTestSquare: fuera del tablero devuelve null', () => {
    expect(hitTestSquare(layout, -5, 10)).toBeNull();
    expect(hitTestSquare(layout, layout.originX + layout.boardSize + 10, layout.originY + 10)).toBeNull();
    expect(hitTestSquare(layout, layout.originX + 10, layout.originY + layout.boardSize + 10)).toBeNull();
  });

  it('contenedor angosto: la casilla se achica', () => {
    const narrow = computeLayout(300, 2000);
    expect(narrow.square).toBe(Math.floor(300 / 8));
    expect(narrow.boardSize).toBe(narrow.square * 8);
  });
});
