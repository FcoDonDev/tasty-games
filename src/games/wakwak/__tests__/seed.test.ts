import { MAZE, toIndex } from '../engine/maze';
import { hashSeed, mulberry32, parseGameSeed, seedConfig } from '../engine/seed';

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
    expect(parseGameSeed(undefined)).toBeUndefined();
    expect(parseGameSeed('otro')).toBeUndefined();
  });
});

describe('seed: seedConfig', () => {
  it('default: laberinto completo, salida escalonada', () => {
    const config = seedConfig();
    expect(config.batteryCells).toEqual([...MAZE.batteryCells].sort((a, b) => a - b));
    expect(config.superCells).toEqual([...MAZE.superCells].sort((a, b) => a - b));
    expect(config.releaseBase).toBeLessThan(2000);
    expect(config.releaseStagger).toBeGreaterThan(0);
  });

  it('test-win: 5 baterías en línea recta a la izquierda del spawn, sin súper, drones no salen', () => {
    const config = seedConfig('__test_win__');
    expect(config.superCells).toHaveLength(0);
    expect(config.batteryCells).toHaveLength(5);
    for (const cell of config.batteryCells) {
      expect(Math.floor(cell / 19)).toBe(15);
      expect(cell).toBeLessThan(15 * 19 + 9); // a la izquierda del spawn (f15,c9)
    }
    expect(config.releaseBase).toBe(600_000);
  });

  it('test-lose: salida inmediata de drones', () => {
    const config = seedConfig('__test_lose__');
    expect(config.releaseBase).toBeLessThanOrEqual(500);
    expect(config.batteryCells).toHaveLength(MAZE.batteryCells.length);
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
});
