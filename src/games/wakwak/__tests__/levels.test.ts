import { LEVELS, MAX_LEVEL, levelConfig, type LevelConfig } from '../engine/levels';

describe('levels: catálogo', () => {
  it('8 niveles numerados consecutivos', () => {
    expect(MAX_LEVEL).toBe(8);
    expect(LEVELS.map((l: LevelConfig) => l.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('levelConfig clampea fuera de rango', () => {
    expect(levelConfig(0).level).toBe(1);
    expect(levelConfig(-5).level).toBe(1);
    expect(levelConfig(99).level).toBe(8);
    expect(levelConfig(3.9).level).toBe(3); // floor
  });

  it('el nivel 1 es más fácil que el MVP y el nivel 3 reproduce el MVP', () => {
    const l1 = levelConfig(1);
    const l3 = levelConfig(3);
    expect(l1.speeds.droneChase).toBeLessThan(4.6); // MVP
    expect(l1.powerMs).toBeGreaterThan(6000); // power más largo
    expect(l1.releaseBase).toBeGreaterThan(1200); // corral más lento
    // nivel 3 = números exactos del MVP
    expect(l3.speeds).toEqual({ robot: 5.5, droneChase: 4.6, droneFrightened: 3.2, droneCorral: 3 });
    expect(l3.powerMs).toBe(6000);
  });

  it('dificultad monótona creciente: ratio drone/robot sube, power baja, corral sale antes', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      const prev = LEVELS[i - 1];
      const curr = LEVELS[i];
      const ratioPrev = prev.speeds.droneChase / prev.speeds.robot;
      const ratioCurr = curr.speeds.droneChase / curr.speeds.robot;
      expect(ratioCurr).toBeGreaterThan(ratioPrev);
      expect(curr.powerMs).toBeLessThan(prev.powerMs);
      expect(curr.releaseBase).toBeLessThan(prev.releaseBase);
      expect(curr.releaseStagger).toBeLessThan(prev.releaseStagger);
      // el robot debe seguir siendo más rápido que cualquier drone en chase
      expect(curr.speeds.droneChase).toBeLessThan(curr.speeds.robot);
      // huida en power siempre claramente más lenta que el robot
      expect(curr.speeds.droneFrightened).toBeLessThan(curr.speeds.droneChase);
    }
  });

  it('Elroy: desactivado en nivel 1, activado desde el 2, umbral no crece', () => {
    expect(levelConfig(1).elroyThreshold).toBeNull();
    for (let i = 2; i <= MAX_LEVEL; i++) {
      expect(levelConfig(i).elroyThreshold).not.toBeNull();
      expect(levelConfig(i).elroyThreshold!).toBeLessThanOrEqual(levelConfig(i - 1).elroyThreshold ?? 1);
      expect(levelConfig(i).elroyBoost).toBeGreaterThan(1);
    }
  });
});
