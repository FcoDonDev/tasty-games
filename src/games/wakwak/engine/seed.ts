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
  /** Celdas (índices) que inician con batería normal */
  batteryCells: number[];
  /** Celdas que inician con súper batería */
  superCells: number[];
  /** ms de juego hasta que sale el primer drone; luego + stagger por drone */
  releaseBase: number;
  releaseStagger: number;
  /** Overrides de arranque de drones (E2E): celda y modo iniciales */
  droneStart?: Array<{ id: number; cell: number; mode: 'waiting' | 'roaming' }>;
  /** Fase inicial scatter/chase (E2E); default 'scatter' */
  startPhase?: 'scatter' | 'chase';
}

const DEFAULT_RNG_SEED = 20260908;

import { MAZE, MAZE_COLS } from './maze';

const TEST_WIN_SEED = '__test_win__';
const TEST_LOSE_SEED = '__test_lose__';
const TEST_POWER_SEED = '__test_power__';

export type SeedSentinel =
  | typeof TEST_WIN_SEED
  | typeof TEST_LOSE_SEED
  | typeof TEST_POWER_SEED;

/** Mapea el `initialSeed` del query param al sentinel; undefined = partida normal. */
export function parseGameSeed(initialSeed?: string): SeedSentinel | undefined {
  if (initialSeed === 'test-win') return TEST_WIN_SEED;
  if (initialSeed === 'test-lose') return TEST_LOSE_SEED;
  if (initialSeed === 'test-power') return TEST_POWER_SEED;
  return undefined;
}

/** Config de la partida normal: todo el laberinto, salida escalonada de drones. */
function defaultConfig(): SeedConfig {
  return {
    label: 'default',
    rngSeed: DEFAULT_RNG_SEED,
    batteryCells: MAZE.batteryCells,
    superCells: MAZE.superCells,
    releaseBase: 1200,
    releaseStagger: 2500,
  };
}

/**
 * E2E `test-win`: solo 5 baterías en línea recta a la izquierda del spawn
 * (f15, c8..c4): un swipe/press a la izquierda las come todas y gana. Drones
 * que no salen del corral durante la partida.
 */
function testWinConfig(): SeedConfig {
  const batteryCells: number[] = [];
  for (let col = 8; col >= 4; col--) batteryCells.push(15 * MAZE_COLS + col);
  return {
    label: TEST_WIN_SEED,
    rngSeed: DEFAULT_RNG_SEED,
    batteryCells,
    superCells: [],
    releaseBase: 600_000,
    releaseStagger: 0,
  };
}

/** E2E `test-lose`: drones salen de inmediato y convergen; robot idle es atrapado. */
function testLoseConfig(): SeedConfig {
  return {
    label: TEST_LOSE_SEED,
    rngSeed: DEFAULT_RNG_SEED,
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
    batteryCells,
    superCells: [superCell],
    releaseBase: 500,
    releaseStagger: 5000,
    droneStart: [{ id: 0, cell: 15 * MAZE_COLS + 6, mode: 'roaming' }],
    startPhase: 'chase', // sin scatter: el drone 0 caza de inmediato y el power lo alcanza en vuelo
  };
}

export function seedConfig(sentinel?: SeedSentinel): SeedConfig {
  if (sentinel === TEST_WIN_SEED) return testWinConfig();
  if (sentinel === TEST_LOSE_SEED) return testLoseConfig();
  if (sentinel === TEST_POWER_SEED) return testPowerConfig();
  return defaultConfig();
}
