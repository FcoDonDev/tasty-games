/**
 * Invariantes de la tabla de tuning (PLAN-DOODLE-JUMP §3.3): candean
 * RELACIONES entre constantes (alcanzabilidad, caps, estabilidad), no
 * valores exactos — el valor exacto se calibra en playtest (T6).
 */

import {
  BULLET_SPEED,
  CLEAN_MARGIN,
  DRAG_MAX_DELTA,
  GRAVITY,
  JUMP_V,
  MAX_BULLETS,
  MAX_GAP_BASE,
  MAX_JUMP_MARGIN,
  MAX_SUBSTEPS,
  MIN_GAP,
  MONSTER_START_HEIGHT,
  PLATFORM_POOL,
  PLATFORM_W,
  SPAWN_AHEAD,
  SPRING_V,
  SPRING_PROB,
  STEP_MS,
  WORLD_H,
  WORLD_W,
} from '../engine/tuning';
import { maxJumpHeight, maxGapFor, blueProbFor, brownProbFor, monsterProbFor } from '../engine/rules';

describe('tuning robo-jump: invariantes', () => {
  test('todo gap generado es alcanzable (≤ margen del salto máx)', () => {
    const maxJump = maxJumpHeight();
    expect(maxJump).toBeGreaterThan(0);
    for (let band = 0; band < 100; band++) {
      const height = band * 1000;
      expect(maxGapFor(height)).toBeLessThanOrEqual(maxJump * MAX_JUMP_MARGIN);
      expect(MIN_GAP).toBeLessThan(maxGapFor(height));
    }
  });

  test('el spring alcanza más que el gap máximo en cualquier banda', () => {
    const springJump = (SPRING_V * SPRING_V) / (2 * GRAVITY);
    expect(springJump).toBeGreaterThan(maxGapFor(100 * 1000));
  });

  test('la probabilidad de amenazas escala monótonico con la altura', () => {
    let last = -1;
    for (let band = 0; band <= 20; band++) {
      const height = band * 1000;
      expect(monsterProbFor(height)).toBeGreaterThanOrEqual(last);
      last = monsterProbFor(height);
    }
    expect(monsterProbFor(MONSTER_START_HEIGHT)).toBeLessThanOrEqual(0.25);
    expect(blueProbFor(20 * 1000)).toBeLessThanOrEqual(0.25);
    expect(brownProbFor(20 * 1000)).toBeLessThanOrEqual(0.2);
    expect(SPRING_PROB).toBeGreaterThan(0);
  });

  test('el paso físico es estable y cubre el frame típico', () => {
    expect(STEP_MS * MAX_SUBSTEPS).toBeGreaterThanOrEqual(50);
    expect(STEP_MS).toBeLessThan(17);
  });

  test('las entidades caben en el mundo y los caps son coherentes', () => {
    expect(PLATFORM_W).toBeLessThan(WORLD_W);
    expect(DRAG_MAX_DELTA).toBeGreaterThan(0);
    expect(MAX_BULLETS).toBeGreaterThan(0);
    expect(BULLET_SPEED).toBeGreaterThan(JUMP_V); // la bala sube más rápido que el salto
  });

  test('la base de gap respeta el margen de salto', () => {
    expect(MAX_GAP_BASE).toBeGreaterThan(MIN_GAP);
  });

  test('el pool de render cubre el peor caso de plataformas vivas (R0/R6/D16)', () => {
    // Span vivo: limpieza bajo (camY+WORLD_H+CLEAN_MARGIN) y generación
    // hasta (camY-SPAWN_AHEAD). Con gap mínimo, el peor caso divide el
    // span por MIN_GAP — un pool menor deja plataformas del engine sin
    // nodo de render ("escenario en blanco" del playtest 15-9).
    const span = CLEAN_MARGIN + WORLD_H + SPAWN_AHEAD;
    const worstCaseLive = Math.ceil(span / MIN_GAP) + 1;
    expect(PLATFORM_POOL).toBeGreaterThanOrEqual(worstCaseLive);
    // D16: las compañeras verdes de las brown suman ~brownProb máx (0.2)
    // de plataformas adicionales al span vivo.
    const withCompanions = worstCaseLive + Math.ceil(worstCaseLive * 0.2);
    expect(PLATFORM_POOL).toBeGreaterThanOrEqual(withCompanions);
  });
});
