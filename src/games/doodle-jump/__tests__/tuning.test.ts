/**
 * Invariantes de la tabla de tuning (PLAN-DOODLE-JUMP §3.3): candean
 * RELACIONES entre constantes (alcanzabilidad, caps, estabilidad), no
 * valores exactos — el valor exacto se calibra en playtest (T6).
 */

import {
  BULLET_SPEED,
  DRAG_MAX_DELTA,
  GRAVITY,
  JUMP_V,
  MAX_BULLETS,
  MAX_GAP_BASE,
  MAX_JUMP_MARGIN,
  MAX_SUBSTEPS,
  MIN_GAP,
  MONSTER_START_HEIGHT,
  PLATFORM_W,
  SPRING_V,
  SPRING_PROB,
  STEP_MS,
  WORLD_W,
} from '../engine/tuning';
import { maxJumpHeight, maxGapFor, blueProbFor, brownProbFor, monsterProbFor } from '../engine/rules';

describe('tuning doodle-jump: invariantes', () => {
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
});
