/**
 * Seeds sentinelas E2E (D12): `test-win`, `test-lose`, `test-crecer`.
 * Solo activos cuando el build se exporta con `EXPO_PUBLIC_E2E=1` (el gate
 * vive en la pantalla, T3 — acá solo construcción determinista).
 */

import { CELL_COUNT, toIndex } from './grid';
import type { SerpienteConfig } from './rules';

export const TEST_WIN_SEED = '__serpiente_test_win__';
export const TEST_LOSE_SEED = '__serpiente_test_lose__';
export const TEST_GROW_SEED = '__serpiente_test_crecer__';

export type SerpienteSeed = typeof TEST_WIN_SEED | typeof TEST_LOSE_SEED | typeof TEST_GROW_SEED;

/** Query param `initialSeed` → sentinela, o `undefined` (partida normal). */
export function parseSerpienteSeed(initialSeed?: string | null): SerpienteSeed | undefined {
  if (initialSeed === 'test-win') return TEST_WIN_SEED;
  if (initialSeed === 'test-lose') return TEST_LOSE_SEED;
  if (initialSeed === 'test-crecer') return TEST_GROW_SEED;
  return undefined;
}

/**
 * A un paso de ganar: serpiente de 399 (todo menos la celda 0) con la cabeza
 * en la 1 mirando a la comida en la 0. Un tick come → tablero lleno → `won`.
 */
function testWinConfig(): SerpienteConfig {
  const snake: number[] = [1];
  for (let i = 2; i < CELL_COUNT; i++) snake.push(i);
  return { rngSeed: 1, wrap: true, snake, dir: 'left', food: 0, eaten: 399, score: 3990 };
}

/** Muerte contra el muro: cabeza en (0,5) subiendo con `wrap=false`. */
function testLoseConfig(): SerpienteConfig {
  return {
    rngSeed: 2,
    wrap: false,
    snake: [toIndex(0, 5), toIndex(1, 5), toIndex(2, 5)],
    dir: 'up',
    food: toIndex(10, 10),
  };
}

/** Crecimiento: comida justo adelante de la cabeza. */
function testGrowConfig(): SerpienteConfig {
  return {
    rngSeed: 3,
    wrap: true,
    snake: [toIndex(10, 10), toIndex(10, 9), toIndex(10, 8)],
    dir: 'right',
    food: toIndex(10, 11),
  };
}

export function seedConfig(sentinel?: SerpienteSeed): SerpienteConfig {
  if (sentinel === TEST_WIN_SEED) return testWinConfig();
  if (sentinel === TEST_LOSE_SEED) return testLoseConfig();
  if (sentinel === TEST_GROW_SEED) return testGrowConfig();
  return {};
}
