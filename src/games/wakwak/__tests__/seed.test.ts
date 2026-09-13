import { MAZE, toIndex } from '../engine/maze';
import { hashSeed, levelRngSeed, mulberry32, parseGameSeed, seedConfig } from '../engine/seed';

describe('seed: mulberry32', () => {
  it('secuencia determinista en [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('seeds distintos → secuencias distintas', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).not.toEqual(seqB);
  });
});

describe('seed: hashSeed', () => {
  it('estable y sensible al input', () => {
    expect(hashSeed('wakwak')).toBe(hashSeed('wakwak'));
    expect(hashSeed('wakwak')).not.toBe(hashSeed('wakwak2'));
  });
});

describe('seed: parseGameSeed', () => {
  it('mapea los valores del query param a sentinelas', () => {
    expect(parseGameSeed('test-win')).toBeDefined();
    expect(parseGameSeed('test-lose')).toBeDefined();
    expect(parseGameSeed('test-power')).toBeDefined();
    expect(parseGameSeed('test-combo')).toBeDefined();
    expect(parseGameSeed('test-level')).toBeDefined();
    expect(parseGameSeed('perf-level-1')).toBeDefined();
    expect(parseGameSeed('perf-level-8')).toBeDefined();
    expect(parseGameSeed(undefined)).toBeUndefined();
    expect(parseGameSeed('otro')).toBeUndefined();
  });
});

describe('seed: seedConfig', () => {
  it('default: laberinto completo; knobs de salida vienen del nivel', () => {
    const config = seedConfig(undefined, 1);
    expect(config.level).toBe(1);
    expect(config.label).toBe('default');
    expect(config.batteryCells).toEqual([...MAZE.batteryCells].sort((a, b) => a - b));
    expect(config.superCells).toEqual([...MAZE.superCells].sort((a, b) => a - b));
    expect(config.releaseBase).toBeUndefined(); // fallback al knob del nivel
    expect(config.releaseStagger).toBeUndefined();
    expect(config.rngSeed).not.toBe(seedConfig(undefined, 2).rngSeed); // stream por nivel
  });

  it('levelRngSeed: determinista y distinto por nivel', () => {
    expect(levelRngSeed(100, 1)).toBe(levelRngSeed(100, 1));
    expect(levelRngSeed(100, 1)).not.toBe(levelRngSeed(100, 2));
  });

  it('test-win: 5 baterías en línea recta a la izquierda del spawn, sin súper, drones no salen; nivel 8 (cierra la run)', () => {
    const config = seedConfig('__test_win__');
    expect(config.level).toBe(8);
    expect(config.superCells).toHaveLength(0);
    expect(config.batteryCells).toHaveLength(5);
    for (const cell of config.batteryCells) {
      expect(Math.floor(cell / 19)).toBe(15);
      expect(cell).toBeLessThan(15 * 19 + 9); // a la izquierda del spawn (f15,c9)
    }
    expect(config.releaseBase).toBe(600_000);
  });

  it('test-level: igual layout que test-win pero en el nivel 1 (no cierra la run)', () => {
    const config = seedConfig('__test_level__');
    expect(config.level).toBe(1);
    expect(config.batteryCells).toHaveLength(5);
    expect(config.releaseBase).toBe(600_000);
  });

  it('test-lose: salida inmediata de drones', () => {
    const config = seedConfig('__test_lose__');
    expect(config.releaseBase).toBeLessThanOrEqual(500);
    expect(config.batteryCells).toHaveLength(MAZE.batteryCells.length);
  });

  it('perf-level-1 / perf-level-8: partida NORMAL determinista fijada al nivel', () => {
    for (const [seed, level] of [
      ['__perf_level_1__', 1],
      ['__perf_level_8__', 8],
    ] as const) {
      const config = seedConfig(seed);
      expect(config.level).toBe(level);
      // Reparto normal: laberinto completo, knobs del nivel (sin overrides E2E)
      expect(config.batteryCells).toEqual([...MAZE.batteryCells].sort((a, b) => a - b));
      expect(config.superCells).toEqual([...MAZE.superCells].sort((a, b) => a - b));
      expect(config.releaseBase).toBeUndefined();
      // Determinista: dos llamadas producen la misma config (mismo stream)
      expect(seedConfig(seed)).toEqual(config);
      // Y es exactamente la config default de ese nivel (solo cambia el label)
      expect(seedConfig(undefined, level)).toEqual({ ...config, label: 'default' });
    }
    // Niveles distintos → streams distintos
    expect(seedConfig('__perf_level_1__').rngSeed).not.toBe(seedConfig('__perf_level_8__').rngSeed);
  });

  it('test-power: súper junto al spawn y drone 0 en roaming en su camino', () => {
    const config = seedConfig('__test_power__');
    expect(config.superCells).toEqual([toIndex(15, 8)]);
    expect(config.batteryCells).not.toContain(toIndex(15, 8));
    expect(config.batteryCells).toHaveLength(MAZE.batteryCells.length - 1);
    expect(config.droneStart).toEqual([
      { id: 0, cell: toIndex(15, 6), mode: 'roaming' },
    ]);
    expect(config.startPhase).toBe('chase');
  });

  it('test-combo: súper + dos drones alineados para cadena 1→2 en un power', () => {
    const config = seedConfig('__test_combo__');
    expect(config.superCells).toEqual([toIndex(15, 8)]);
    expect(config.droneStart).toEqual([
      { id: 0, cell: toIndex(15, 6), mode: 'roaming' },
      { id: 1, cell: toIndex(15, 4), mode: 'roaming' },
    ]);
    expect(config.startPhase).toBe('chase');
  });
});
