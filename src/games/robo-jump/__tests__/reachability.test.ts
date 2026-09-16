/**
 * Test de regresión D16 (playtest 2): la escalera generada es SIEMPRE
 * alcanzable — el dead-end del playtest ("imposible avanzar") era una
 * brown como única ruta (se rompe al pisarla → rebote eterno sin
 * avanzar; escáner: 75% de spans en banda alta). La brown ahora trae
 * compañera verde y la x respeta una ventana alcanzable desde la
 * plataforma previa.
 *
 * Modelo del escáner (jugador perfecto, conservador):
 *  - solo se puede PARAR en green/blue (la brown se rompe);
 *  - t_land = rama descendente del salto: (V + √(V²−2·G·gap))/G;
 *  - alcance horizontal = KEY_VX·t_land + solape de bordes, descontando
 *    la oscilación azul del peor caso; spring/hat extienden el alcance;
 *  - wrap: distancia circular en el mundo de 360 u.
 */
import { createGameState, reachForGap, maxGapFor, type Platform } from '../engine/rules';
import {
  BLUE_AMP,
  GRAVITY,
  JUMP_V,
  KEY_VX,
  COMPANION_DIST,
  COMPANION_DROP,
  PLATFORM_W,
  SPRING_V,
  WORLD_W,
} from '../engine/tuning';

function tLandFor(v0: number, gap: number): number {
  const disc = v0 * v0 - 2 * GRAVITY * gap;
  if (disc <= 0) return -1;
  return (v0 + Math.sqrt(disc)) / GRAVITY;
}

function circDist(a: number, b: number): number {
  const d = Math.abs(a - b) % WORLD_W;
  return Math.min(d, WORLD_W - d);
}

function xRange(p: Platform): number[] {
  return p.kind === 'blue' ? [p.x - BLUE_AMP, p.x + BLUE_AMP] : [p.x];
}

/** ¿Se puede aterrizar en v (más arriba) partiendo de u? */
function canReach(u: Platform, v: Platform): boolean {
  if (v.y >= u.y) return false;
  const gap = u.y - v.y;
  const maxJump = (JUMP_V * JUMP_V) / (2 * GRAVITY);
  let v0 = JUMP_V;
  if (u.hat) v0 = Number.POSITIVE_INFINITY; // el hat cubre el span entero
  else if (u.spring) v0 = SPRING_V;
  else if (gap > maxJump) return false;
  const t = tLandFor(v0, gap);
  if (t < 0) return false;
  const reach =
    KEY_VX * t +
    (PLATFORM_W / 2 + 12) -
    (u.kind === 'blue' ? BLUE_AMP : 0) -
    (v.kind === 'blue' ? BLUE_AMP : 0);
  const minDist = Math.min(
    ...xRange(u).map((a) => xRange(v).map((b) => circDist(a, b))).flat(),
  );
  return minDist <= reach;
}

/** BFS de plataformas parables: ¿la escalera entera es encadenable? */
function blockedCount(state: ReturnType<typeof createGameState>): number {
  const platforms = [...state.platforms].sort((a, b) => b.y - a.y);
  const start = platforms.find((p) => p.y >= state.robo.y) ?? platforms[0];
  const standable = (p: Platform): boolean => p.kind !== 'brown';
  const reachable = new Set<number>([start.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const u of platforms) {
      if (!reachable.has(u.id) || !standable(u)) continue;
      for (const v of platforms) {
        if (reachable.has(v.id) || !canReach(u, v)) continue;
        reachable.add(v.id);
        grew = true;
      }
    }
  }
  return platforms.length - reachable.size;
}

describe('robo-jump D16: generación alcanzable', () => {
  test('la escalera es encadenable en toda banda (40 seeds × 5 bandas)', () => {
    for (const band of [0, 2, 5, 10, 20]) {
      for (let seed = 1; seed <= 40; seed++) {
        const state = createGameState({ rngSeed: seed, height: band * 1000 });
        expect(blockedCount(state)).toBe(0);
      }
    }
  });

  test('toda brown trae compañera verde al alcance de la caída', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const state = createGameState({ rngSeed: seed, height: 10000 });
      for (const brown of state.platforms.filter((p) => p.kind === 'brown')) {
        const companion = state.platforms.find(
          (p) =>
            p.kind === 'green' &&
            p !== brown &&
            Math.abs(p.y - (brown.y + COMPANION_DROP)) <= 8 &&
            circDist(p.x, brown.x) <= COMPANION_DIST + PLATFORM_W,
        );
        expect(companion).toBeDefined();
      }
    }
  });

  test('reachForGap: física coherente (positiva bajo el salto máx, 0 fuera)', () => {
    const maxJump = (JUMP_V * JUMP_V) / (2 * GRAVITY);
    expect(reachForGap(maxGapFor(0), false, false)).toBeGreaterThan(0);
    expect(reachForGap(maxGapFor(0), true, true)).toBeGreaterThan(0);
    expect(reachForGap(maxJump + 1, false, false)).toBe(0);
    // con teclado, un gap máximo deja al menos media pantalla de alcance
    expect(reachForGap(maxGapFor(0), false, false)).toBeGreaterThan(WORLD_W / 4);
  });
});
