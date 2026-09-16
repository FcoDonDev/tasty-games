/**
 * Tests pautados por fixture (PLAN-DOODLE-JUMP, pedido del usuario):
 * escenario FIJO + guión de input → comportamiento esperado exacto.
 * Deterministas al 100% (mundo cerrado, sub-pasos fijos).
 */

import {
  FIX_BLUE_BROWN,
  FIX_DENSITY,
  FIX_HAT,
  FIX_SQUISH,
  FIX_SQUISH_FAST,
  FIX_SPRING,
  FIX_AIM,
  FIX_WRAP,
  replayFixture,
  type Fixture,
} from '../engine/fixtures';
import { platformX, type DoodleJumpEvent } from '../engine/rules';
import { MIN_GAP, PLATFORM_POOL, SPAWN_AHEAD, WORLD_H, CLEAN_MARGIN } from '../engine/tuning';

describe('fixtures doodle-jump: mecánicas pautadas', () => {
  test('fix-spring — el resorte impulsa más alto que el salto y el Doodler vive', () => {
    const { state, events } = replayFixture(FIX_SPRING);
    expect(events).toContain('spring');
    expect(state.status).toBe('playing');
    expect(state.score).toBeGreaterThanOrEqual(30);
  });

  test('fix-hat — hat asciende, mata al atravesar y anula el disparo (D12)', () => {
    const { state, events } = replayFixture(FIX_HAT);
    const order = events.indexOf('hat') < events.indexOf('kill');
    expect(order).toBe(true);
    expect(events).toContain('hat');
    expect(events).toContain('kill');
    expect(state.monsters).toHaveLength(0);
    expect(state.bullets).toHaveLength(0); // hat anula disparo
    expect(state.status).toBe('playing');
  });

  test('fix-squish — aplaste tipo Mario: mata, el monstruo muere y el Doodler vive', () => {
    const { state, events } = replayFixture(FIX_SQUISH);
    expect(events).toContain('kill');
    expect(state.monsters).toHaveLength(0);
    expect(state.status).toBe('playing');
  });

  test('fix-squish-fast — caída rápida NO muere por contacto (tolerancia R4)', () => {
    const { state, events } = replayFixture(FIX_SQUISH_FAST);
    expect(events).toContain('kill');
    expect(state.status).toBe('playing');
  });

  test('fix-aim — toques derecha/izquierda/arriba matan a los tres monstruos', () => {
    const { state, events } = replayFixture(FIX_AIM);
    const kills = events.filter((e) => e === 'kill').length;
    expect(kills).toBe(3);
    expect(state.monsters).toHaveLength(0);
    expect(state.status).toBe('playing');
  });

  test('fix-blue-brown — marrón se rompe, azul oscila y alcanza', () => {
    const { state, events } = replayFixture(FIX_BLUE_BROWN);
    expect(events).toContain('break');
    expect(events).toContain('bounce');
    const blue = state.platforms.find((p) => p.kind === 'blue');
    expect(blue).toBeDefined();
    // La fase avanzó (osciló desde phase 0).
    expect(platformX(blue!)).not.toBe(blue!.x);
    expect(state.status).toBe('playing');
  });

  test('fix-wrap — el drag cruza el borde y reaparece por el opuesto', () => {
    const { state, events } = replayFixture(FIX_WRAP);
    expect(state.doodler.x).toBeLessThan(60);
    expect(state.status).toBe('playing');
    expect(events.some((e) => typeof e === 'object' && e.type === 'die')).toBe(false);
  });

  test('fix-density — escalada forzada: plataformas acotadas, gaps legales, cursor avanza', () => {
    const { state, events } = replayFixture(FIX_DENSITY);
    expect(state.status).toBe('playing');
    const span = CLEAN_MARGIN + WORLD_H + SPAWN_AHEAD;
    const worstCase = Math.ceil(span / MIN_GAP) + 1;
    expect(state.platforms.length).toBeLessThanOrEqual(Math.max(worstCase, PLATFORM_POOL) + 2);
    const sorted = [...state.platforms].sort((a, b) => b.y - a.y);
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i].y - sorted[i + 1].y).toBeGreaterThanOrEqual(MIN_GAP - 1);
    }
    expect(state.nextSpawnY).toBeLessThanOrEqual(state.camY - SPAWN_AHEAD);
    expect(events.some((e) => typeof e === 'object' && e.type === 'die')).toBe(false);
  });

  test('los fixtures son deterministas: dos corridas → mismo estado final', () => {
    const runTwice = (fixture: Fixture): string =>
      JSON.stringify(replayFixture(fixture).state);
    for (const fixture of [FIX_SPRING, FIX_AIM, FIX_WRAP]) {
      expect(runTwice(fixture)).toBe(runTwice(fixture));
    }
  });
});
