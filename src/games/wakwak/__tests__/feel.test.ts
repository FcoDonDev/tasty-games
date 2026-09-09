import {
  DEATH_FREEZE_FINAL_MS,
  DEATH_FREEZE_MS,
  DEATH_RECOVER_MS,
  HITSTOP_BASE_MS,
  HITSTOP_MAX_MS,
  HITSTOP_STEP_MS,
  SLOWMO_MIN_SCALE,
  SLOWMO_PEAK_DISTANCE,
  SLOWMO_RADIUS,
  THREAT_MAX_ZOOM,
  hitStopMs,
  slowMoScale,
  threatZoom,
} from '../engine/feel';

describe('feel: hit-stop paramétrico (D4)', () => {
  it('60ms base + 25ms por eslabón de cadena', () => {
    expect(HITSTOP_BASE_MS).toBe(60);
    expect(HITSTOP_STEP_MS).toBe(25);
    expect(hitStopMs(1)).toBe(60);
    expect(hitStopMs(2)).toBe(85);
    expect(hitStopMs(3)).toBe(110);
    expect(hitStopMs(4)).toBe(135);
  });

  it('cap en 150ms y robusto ante entradas raras', () => {
    expect(HITSTOP_MAX_MS).toBe(150);
    expect(hitStopMs(5)).toBe(150);
    expect(hitStopMs(20)).toBe(150);
    expect(hitStopMs(0)).toBe(60); // cadena inválida → eslabón 1
    expect(hitStopMs(-4)).toBe(60);
    expect(hitStopMs(2.9)).toBe(85); // floor a eslabón 2
  });
});

describe('feel: secuencia de muerte (F5)', () => {
  it('constantes del clip: visual < visual+recover; derrota final más larga', () => {
    expect(DEATH_FREEZE_MS).toBeGreaterThan(0);
    expect(DEATH_FREEZE_FINAL_MS).toBeGreaterThan(DEATH_FREEZE_MS);
    expect(DEATH_RECOVER_MS).toBeGreaterThan(0);
  });
});

describe('feel: near-death v3 — slow-mo continuo', () => {
  it('curva monótona: más cerca → más lento (bordes incluidos)', () => {
    // fuera del radio: sin efecto
    expect(slowMoScale([{ distance: SLOWMO_RADIUS + 0.1, closing: true }], false)).toBe(1);
    // en el borde del radio: empieza el efecto (≈1)
    expect(slowMoScale([{ distance: SLOWMO_RADIUS, closing: true }], false)).toBeCloseTo(1, 5);
    // a media distancia: punto medio de la curva
    const mid = slowMoScale([{ distance: (SLOWMO_RADIUS + SLOWMO_PEAK_DISTANCE) / 2, closing: true }], false);
    expect(mid).toBeGreaterThan(SLOWMO_MIN_SCALE);
    expect(mid).toBeLessThan(1);
    // a distancia de colisión (y más cerca): escala mínima
    expect(slowMoScale([{ distance: SLOWMO_PEAK_DISTANCE, closing: true }], false)).toBe(SLOWMO_MIN_SCALE);
    expect(slowMoScale([{ distance: 0.2, closing: true }], false)).toBe(SLOWMO_MIN_SCALE);
  });

  it('sin amenaza: distancia lejana, alejándose, o sin drones', () => {
    expect(slowMoScale([], false)).toBe(1);
    expect(slowMoScale([{ distance: 0.3, closing: false }], false)).toBe(1);
  });

  it('en modo power nunca hay slow-mo', () => {
    expect(slowMoScale([{ distance: 0.1, closing: true }], true)).toBe(1);
  });

  it('la amenaza MÁS CERCANA manda (mínimo de escalas)', () => {
    const threats = [
      { distance: 5, closing: false },
      { distance: 0.8, closing: true },
    ];
    expect(slowMoScale(threats, false)).toBeLessThan(slowMoScale([{ distance: 1.5, closing: true }], false));
  });

  it('zoom de amenaza: rango [1, THREAT_MAX_ZOOM], monótono, powered → 1', () => {
    expect(threatZoom([{ distance: SLOWMO_RADIUS + 0.5, closing: true }], false)).toBe(1);
    const mid = threatZoom([{ distance: SLOWMO_RADIUS / 2, closing: true }], false);
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThan(THREAT_MAX_ZOOM);
    expect(threatZoom([{ distance: 0.3, closing: true }], false)).toBe(THREAT_MAX_ZOOM);
    expect(threatZoom([{ distance: 0.3, closing: false }], false)).toBe(1);
    expect(threatZoom([{ distance: 0.3, closing: true }], true)).toBe(1);
  });
});
