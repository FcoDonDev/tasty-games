import { MAX_SHORT_EDGE, isLandscapeMobile } from '../useLandscapeMobile';

describe('isLandscapeMobile', () => {
  it('portrait de teléfono: false (aunque sea chico)', () => {
    expect(isLandscapeMobile(360, 640)).toBe(false);
    expect(isLandscapeMobile(390, 844)).toBe(false);
  });

  it('landscape de teléfono: true (dimensión corta ≤ 480)', () => {
    expect(isLandscapeMobile(740, 360)).toBe(true);
    expect(isLandscapeMobile(844, 390)).toBe(true);
    expect(isLandscapeMobile(640, 360)).toBe(true);
  });

  it('landscape en el umbral exacto: true', () => {
    expect(isLandscapeMobile(MAX_SHORT_EDGE + 1, MAX_SHORT_EDGE)).toBe(true);
  });

  it('desktop web: false (dimensión corta > 480)', () => {
    expect(isLandscapeMobile(1280, 900)).toBe(false);
    expect(isLandscapeMobile(1920, 1080)).toBe(false);
  });

  it('tablet en landscape: false (dimensión corta > 480)', () => {
    expect(isLandscapeMobile(900, 800)).toBe(false);
    expect(isLandscapeMobile(1194, 834)).toBe(false);
  });

  it('cuadrado: false (no hay ventaja landscape)', () => {
    expect(isLandscapeMobile(600, 600)).toBe(false);
  });
});
