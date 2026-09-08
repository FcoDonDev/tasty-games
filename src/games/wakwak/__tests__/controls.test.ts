import { beginFloatingDrag, directionFromSwipe, SWIPE_THRESHOLD, updateFloatingDrag } from '../engine/controls';

describe('directionFromSwipe', () => {
  it('null debajo del umbral (muerto para micromovimientos)', () => {
    expect(directionFromSwipe(10, 10)).toBeNull();
    expect(directionFromSwipe(23, 0)).toBeNull();
    expect(directionFromSwipe(0, 23)).toBeNull();
    expect(directionFromSwipe(0, 0)).toBeNull();
  });

  it('umbral exacto dispara', () => {
    expect(directionFromSwipe(SWIPE_THRESHOLD, 0)).toBe('right');
    expect(directionFromSwipe(0, -SWIPE_THRESHOLD)).toBe('up');
  });

  it('eje dominante decide', () => {
    expect(directionFromSwipe(-40, 12)).toBe('left');
    expect(directionFromSwipe(12, -40)).toBe('up');
    expect(directionFromSwipe(30, 30)).toBe('down'); // empate → vertical
  });

  it('umbral custom', () => {
    expect(directionFromSwipe(30, 0, 40)).toBeNull();
    expect(directionFromSwipe(40, 0, 40)).toBe('right');
  });
});

describe('gesto flotante (begin/update con re-centrado)', () => {
  it('el pad nace en el punto de contacto, sin dirección', () => {
    const drag = beginFloatingDrag(100, 200);
    expect(drag).toEqual({ ox: 100, oy: 200, dir: null });
  });

  it('movimiento pequeño no emite ni re-centra', () => {
    let drag = beginFloatingDrag(100, 200);
    drag = updateFloatingDrag(drag, 110, 210);
    expect(drag.dir).toBeNull();
    expect(drag.ox).toBe(100);
    expect(drag.oy).toBe(200);
  });

  it('primer tramo emite la dirección dominante y re-centra al commit', () => {
    let drag = beginFloatingDrag(100, 200);
    drag = updateFloatingDrag(drag, 76, 200); // 24px a la izquierda
    expect(drag.dir).toBe('left');
    expect(drag.ox).toBe(76);
    expect(drag.oy).toBe(200);
  });

  it('cambio al eje perpendicular: mini-swipe fresco desde el commit', () => {
    let drag = beginFloatingDrag(100, 200);
    drag = updateFloatingDrag(drag, 76, 200); // left
    drag = updateFloatingDrag(drag, 70, 224); // baja 24 desde el commit → down
    expect(drag.dir).toBe('down');
  });

  it('invertir la dirección exige un tramo completo desde el último commit', () => {
    let drag = beginFloatingDrag(100, 200);
    drag = updateFloatingDrag(drag, 76, 200); // left, commit en 76
    drag = updateFloatingDrag(drag, 85, 200); // retroceso parcial: sigue left
    expect(drag.dir).toBe('left');
    drag = updateFloatingDrag(drag, 100, 200); // 24 a la derecha del commit: right
    expect(drag.dir).toBe('right');
  });

  it('sin jitter en diagonal profunda: mantiene la dirección del eje dominante', () => {
    let drag = beginFloatingDrag(100, 200);
    drag = updateFloatingDrag(drag, 100, 176); // up
    drag = updateFloatingDrag(drag, 96, 152); // sigue subiendo con leve deriva x
    expect(drag.dir).toBe('up');
  });

  it('continuar en la misma dirección re-centra (histéresis permanente)', () => {
    let drag = beginFloatingDrag(100, 200);
    drag = updateFloatingDrag(drag, 76, 200); // left
    drag = updateFloatingDrag(drag, 52, 200); // otro tramo left
    expect(drag.dir).toBe('left');
    expect(drag.ox).toBe(52);
    // invertir desde el último commit (52) exige un tramo completo a la derecha
    drag = updateFloatingDrag(drag, 64, 200);
    expect(drag.dir).toBe('left');
    drag = updateFloatingDrag(drag, 76, 200);
    expect(drag.dir).toBe('right');
  });

  it('umbral custom propaga a los tramos', () => {
    let drag = beginFloatingDrag(0, 0);
    drag = updateFloatingDrag(drag, 30, 0, 40);
    expect(drag.dir).toBeNull();
    drag = updateFloatingDrag(drag, 40, 0, 40);
    expect(drag.dir).toBe('right');
  });
});
