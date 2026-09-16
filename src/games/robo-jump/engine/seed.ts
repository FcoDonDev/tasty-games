/**
 * Seeds sentinelas E2E (PLAN-DOODLE-JUMP §3.5): `test-win` (torre central),
 * `test-lose` (monstruo en el eje) y `perf-long` (fixture de performance).
 * Solo activos cuando el build se exporta con `EXPO_PUBLIC_E2E=1` (el gate
 * vive en la pantalla, T6 — acá solo construcción determinista).
 *
 * La clave del diseño: el auto-rebote SIN input es determinista — el
 * Robo rebotando en una plataforma no se mueve horizontalmente. Los
 * sentinelas explotan eso y no dependen del drag humano.
 */

import {
  ROBO_H,
  MAX_JUMP_MARGIN,
  SPAWN_AHEAD,
  START_Y,
  WORLD_H,
  WORLD_W,
} from './tuning';
import { maxJumpHeight, type RoboJumpConfig, type Monster, type Platform } from './rules';
import { FIXTURES } from './fixtures';

export const TEST_WIN_SEED = '__robo_test_win__';
export const TEST_LOSE_SEED = '__robo_test_lose__';
/** Fixture de performance (T4): mundo denso alto. */
export const PERF_LONG_SEED = '__robo_perf_long__';
/** Prefijo de seeds de fixtures de mecánica: `fix-<id>` → `__robo_fix_<id>__`. */
export const FIX_SEED_PREFIX = '__robo_fix_';

export type RoboJumpSeed =
  | typeof TEST_WIN_SEED
  | typeof TEST_LOSE_SEED
  | typeof PERF_LONG_SEED
  | `__robo_fix_${string}`;

/** Query param `initialSeed` → sentinela/fixture, o `undefined` (partida normal). */
export function parseRoboJumpSeed(initialSeed?: string | null): RoboJumpSeed | undefined {
  if (initialSeed === 'test-win') return TEST_WIN_SEED;
  if (initialSeed === 'test-lose') return TEST_LOSE_SEED;
  if (initialSeed === 'perf-long') return PERF_LONG_SEED;
  if (initialSeed?.startsWith('fix-')) {
    const id = initialSeed.slice(4);
    if (id in FIXTURES) return `__robo_fix_${id}`;
  }
  return undefined;
}

const TOWER_GAP = Math.floor(maxJumpHeight() * MAX_JUMP_MARGIN); // 89 ≤ margen

/**
 * Torre central (§3.5): plataformas verdes apiladas en el eje X del
 * Robo → el auto-rebote asciende solo, sin input. Cada rebote sube
 * `TOWER_GAP` u: el E2E valida score creciente y luego mata con drag
 * lateral + caída.
 */
function towerPlatforms(): Platform[] {
  const platforms: Platform[] = [];
  let id = 0;
  let y = START_Y + ROBO_H / 2; // primera plataforma bajo el Robo
  while (y > -SPAWN_AHEAD) {
    platforms.push({ id, kind: 'green', x: WORLD_W / 2, y, phase: 0, spring: false, hat: false });
    y -= TOWER_GAP;
    id += 1;
  }
  return platforms;
}

function testWinConfig(): RoboJumpConfig {
  return { rngSeed: 11, platforms: towerPlatforms() };
}

/** Monstruo estático anclado sobre el eje del rebote: colisión sin input. */
function testLoseConfig(): RoboJumpConfig {
  const monster: Monster = {
    id: 900,
    kind: 'static',
    x: WORLD_W / 2,
    y: START_Y - 28, // sobre la cabeza del primer rebote
    phase: 0,
  };
  return { rngSeed: 12, platforms: towerPlatforms(), monsters: [monster] };
}

/** Mundo denso y alto: peor caso de render y coste de `advance`. */
function perfLongConfig(): RoboJumpConfig {
  return { rngSeed: 13, height: 20000 };
}

export function seedConfig(sentinel?: RoboJumpSeed): RoboJumpConfig {
  if (sentinel === TEST_WIN_SEED) return testWinConfig();
  if (sentinel === TEST_LOSE_SEED) return testLoseConfig();
  if (sentinel === PERF_LONG_SEED) return perfLongConfig();
  if (sentinel?.startsWith(FIX_SEED_PREFIX)) {
    const fixture = FIXTURES[sentinel.slice(FIX_SEED_PREFIX.length)];
    if (fixture) return fixture.config;
  }
  return {};
}

/** Altura inicial de la torre para aserciones E2E. */
export const TOWER_FIRST_PLATFORM_Y = START_Y + ROBO_H / 2;
export const WORLD_BOTTOM = WORLD_H;
