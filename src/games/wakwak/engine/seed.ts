/**
 * RNG determinista (mulberry32) y seeds sentinelas para E2E (ADR 0006).
 *
 * El `initialSeed` que llega por query param solo se propaga en builds con
 * EXPO_PUBLIC_E2E=1 (lo hace app/juego/[id].tsx); en producción no existe
 * canal para alterar el reparto. Acá se mapea a una configuración de partida.
 *
 * mulberry32 se duplica por juego a propósito: regla de aislamiento entre
 * juegos (nada bajo src/games/<a>/ importa de src/games/<b>/).
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash estable de string → uint32, para derivar el seed del RNG. */
export function hashSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface SeedConfig {
  label: string;
  rngSeed: number;
  /** Nivel de la partida (1-based); default 1. Los sentinelas E2E se fijan. */
  level?: number;
  /** Celdas (índices) que inician con batería normal */
  batteryCells: number[];
  /** Celdas que inician con súper batería */
  superCells: number[];
  /** ms de juego hasta que sale el primer drone; luego + stagger por drone.
   * Si faltan, valen los knobs del nivel (levels.ts). */
  releaseBase?: number;
  releaseStagger?: number;
  /** Overrides de arranque de drones (E2E): celda y modo iniciales */
  droneStart?: Array<{ id: number; cell: number; mode: 'waiting' | 'roaming' }>;
  /** Fase inicial scatter/chase (E2E); default 'scatter' */
  startPhase?: 'scatter' | 'chase';
}

const DEFAULT_RNG_SEED = 20260908;

/** Seed base de una run normal; cada nivel deriva su stream con `levelRngSeed`. */
export const RUN_BASE_SEED = DEFAULT_RNG_SEED;

import { MAZE, MAZE_COLS } from './maze';

const TEST_WIN_SEED = '__test_win__';
const TEST_LOSE_SEED = '__test_lose__';
const TEST_POWER_SEED = '__test_power__';
const TEST_COMBO_SEED = '__test_combo__';
const TEST_LEVEL_SEED = '__test_level__';

export type SeedSentinel =
  | typeof TEST_WIN_SEED
  | typeof TEST_LOSE_SEED
  | typeof TEST_POWER_SEED
  | typeof TEST_COMBO_SEED
  | typeof TEST_LEVEL_SEED;

/** Mapea el `initialSeed` del query param al sentinel; undefined = partida normal. */
export function parseGameSeed(initialSeed?: string): SeedSentinel | undefined {
  if (initialSeed === 'test-win') return TEST_WIN_SEED;
  if (initialSeed === 'test-lose') return TEST_LOSE_SEED;
  if (initialSeed === 'test-power') return TEST_POWER_SEED;
  if (initialSeed === 'test-combo') return TEST_COMBO_SEED;
  if (initialSeed === 'test-level') return TEST_LEVEL_SEED;
  return undefined;
}

/**
 * Seed base de una run para derivar el RNG de cada nivel: misma run → misma
 * familia de seeds; niveles distintos → streams distintos.
 */
export function levelRngSeed(base: number, level: number): number {
  return (base + level * 7919) >>> 0;
}

/** Config de la partida normal: todo el laberinto, salida escalonada de drones. */
function defaultConfig(level: number): SeedConfig {
  return {
    label: 'default',
    rngSeed: levelRngSeed(DEFAULT_RNG_SEED, level),
    level,
    batteryCells: MAZE.batteryCells,
    superCells: MAZE.superCells,
  };
}

/**
 * E2E `test-win`: solo 5 baterías en línea recta a la izquierda del spawn
 * (f15, c8..c4): un swipe/press a la izquierda las come todas y gana. Drones
 * que no salen del corral durante la partida. Fijado al nivel 8 (último):
 * ganar cierra la RUN y muestra el overlay de fin con récord (nivel 3 pin.
 * antiguo del MVP; ver PLAN-WAK-WAK-V2 §D8 y spec E2E).
 */
function testWinConfig(): SeedConfig {
  const batteryCells: number[] = [];
  for (let col = 8; col >= 4; col--) batteryCells.push(15 * MAZE_COLS + col);
  return {
    label: TEST_WIN_SEED,
    rngSeed: DEFAULT_RNG_SEED,
    level: 8,
    batteryCells,
    superCells: [],
    releaseBase: 600_000,
    releaseStagger: 0,
  };
}

/**
 * E2E `test-level`: igual layout que test-win pero en el NIVEL 1 de una run:
 * ganar el nivel muestra el interstitial "NIVEL 2" y arranca el siguiente
 * nivel conservando score y vidas (+1). No termina la run.
 */
function testLevelConfig(): SeedConfig {
  const win = testWinConfig();
  return {
    ...win,
    label: TEST_LEVEL_SEED,
    level: 1,
    releaseBase: 600_000,
    releaseStagger: 0,
  };
}

/** E2E `test-lose`: drones salen de inmediato y convergen; robot idle es atrapado. */
function testLoseConfig(): SeedConfig {
  return {
    label: TEST_LOSE_SEED,
    rngSeed: DEFAULT_RNG_SEED,
    level: 3,
    batteryCells: MAZE.batteryCells,
    superCells: MAZE.superCells,
    releaseBase: 500,
    releaseStagger: 1000,
  };
}

/**
 * E2E `test-power`: una súper batería pegada al spawn del robot y el drone 0
 * ya en roaming sobre la fila del robot: el robot come la súper, activa la
 * carga y alcanza al drone que huye (el robot es más rápido en modo flee).
 */
function testPowerConfig(): SeedConfig {
  const superCell = 15 * MAZE_COLS + 8; // vecina izquierda del spawn del robot
  const batteryCells = MAZE.batteryCells.filter((cell) => cell !== superCell);
  return {
    label: TEST_POWER_SEED,
    rngSeed: DEFAULT_RNG_SEED,
    level: 3,
    batteryCells,
    superCells: [superCell],
    releaseBase: 500,
    releaseStagger: 5000,
    droneStart: [{ id: 0, cell: 15 * MAZE_COLS + 6, mode: 'roaming' }],
    startPhase: 'chase', // sin scatter: el drone 0 caza de inmediato y el power lo alcanza en vuelo
  };
}

/**
 * E2E `test-combo`: súper pegada al spawn + dos drones alineados en la fila
 * del robot (f15, c6 y c4) en roaming y fase chase: el robot come la súper y
 * barre los dos drones dentro del MISMO power → cadena 1 (200) y cadena 2
 * (400). Sin baterías en la fila del robot para que el score sea exacto:
 * 50 + 200 + 400 = 650 pts.
 */
function testComboConfig(): SeedConfig {
  const superCell = 15 * MAZE_COLS + 8;
  const batteryCells = MAZE.batteryCells.filter(
    (cell) => cell !== superCell && Math.floor(cell / MAZE_COLS) !== 15,
  );
  return {
    label: TEST_COMBO_SEED,
    rngSeed: DEFAULT_RNG_SEED,
    level: 3,
    batteryCells,
    superCells: [superCell],
    releaseBase: 500,
    releaseStagger: 5000,
    droneStart: [
      { id: 0, cell: 15 * MAZE_COLS + 6, mode: 'roaming' },
      { id: 1, cell: 15 * MAZE_COLS + 4, mode: 'roaming' },
    ],
    startPhase: 'chase',
  };
}

export function seedConfig(sentinel?: SeedSentinel, level = 1): SeedConfig {
  if (sentinel === TEST_WIN_SEED) return testWinConfig();
  if (sentinel === TEST_LEVEL_SEED) return testLevelConfig();
  if (sentinel === TEST_LOSE_SEED) return testLoseConfig();
  if (sentinel === TEST_POWER_SEED) return testPowerConfig();
  if (sentinel === TEST_COMBO_SEED) return testComboConfig();
  return defaultConfig(level);
}
