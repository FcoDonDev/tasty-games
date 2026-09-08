import { COARSE_POINTER_QUERY, detectTouchDevice } from '../useIsTouchDevice';

describe('detectTouchDevice', () => {
  it('nativo (ios/android): siempre táctil, sin mirar la media query', () => {
    expect(detectTouchDevice('ios', true)).toBe(true);
    expect(detectTouchDevice('android', false)).toBe(true);
    expect(detectTouchDevice('android', null)).toBe(true);
  });

  it('web con puntero coarse (celular/tablet): táctil', () => {
    expect(detectTouchDevice('web', true)).toBe(true);
  });

  it('web con puntero fino (PC con mouse): no táctil → teclado', () => {
    expect(detectTouchDevice('web', false)).toBe(false);
  });

  it('web sin señal disponible (sin matchMedia): no táctil (default conservador)', () => {
    expect(detectTouchDevice('web', null)).toBe(false);
  });

  it('expone la media query canónica de puntero coarse', () => {
    expect(COARSE_POINTER_QUERY).toBe('(pointer: coarse)');
  });
});
