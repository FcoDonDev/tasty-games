/**
 * Fixture de performance del engine (PLAN-DOODLE-JUMP §3.3, convención
 * perf-fixtures del repo): el coste de `advance` no se dispara con el
 * mundo alto (limpieza + generación acotadas por cámara).
 */

import { advance, createGameState } from '../engine/rules';
import { PERF_LONG_SEED, seedConfig } from '../engine/seed';

describe('perf fixture robo-jump: advance', () => {
  test('200 frames de 16 ms en un mundo alto (banda 20) ≤ 2 s total', () => {
    let state = createGameState(seedConfig(PERF_LONG_SEED));
    const t0 = performance.now();
    let frames = 0;
    for (let i = 0; i < 200 && state.status === 'playing'; i++) {
      state = advance(state, 16).state;
      frames += 1;
    }
    const total = performance.now() - t0;
    expect(frames).toBe(200);
    expect(total).toBeLessThan(2000);
    // Promedio por frame muy por debajo del presupuesto de 16 ms.
    expect(total / frames).toBeLessThan(4);
  });
});
