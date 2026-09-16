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
import { isCompanionPlatform, platformX, type RoboJumpEvent } from '../engine/rules';
import { MIN_GAP, PLATFORM_POOL, SPAWN_AHEAD, WORLD_H, CLEAN_MARGIN } from '../engine/tuning';

/** D18: los eventos con posición son objetos — lectura tipada en tests. */
const kind = (e: RoboJumpEvent): string => (typeof e === 'string' ? e : e.type);
const kinds = (events: RoboJumpEvent[]): string[] => events.map(kind);
const countOf = (events: RoboJumpEvent[], type: string): number =>
  kinds(events).filter((t) => t === type).length;

describe('fixtures robo-jump: mecánicas pautadas', () => {
  test('fix-spring — el resorte impulsa más alto que el salto y el Robo vive', () => {
    const { state, events } = replayFixture(FIX_SPRING);
    const spring = events.find((e) => typeof e !== 'string' && e.type === 'spring');
    expect(spring).toBeDefined();
    // D18: origen = plataforma del resorte (coincide con alguna plataforma).
    expect(
      state.platforms.some((p) => p.x === spring!.x && p.y === spring!.y),
    ).toBe(true);
    expect(state.status).toBe('playing');
    expect(state.score).toBeGreaterThanOrEqual(30);
  });

  test('fix-hat — hat asciende, mata al atravesar y anula el disparo (D12)', () => {
    const { state, events } = replayFixture(FIX_HAT);
    const order = kinds(events).indexOf('hat') < kinds(events).indexOf('kill');
    expect(order).toBe(true);
    expect(kinds(events)).toContain('hat');
    const kill = events.find((e) => typeof e !== 'string' && e.type === 'kill');
    expect(kill).toMatchObject({ by: 'hat' });
    expect(Number.isFinite(kill!.x)).toBe(true);
    expect(Number.isFinite(kill!.y)).toBe(true);
    expect(state.monsters).toHaveLength(0);
    expect(state.bullets).toHaveLength(0); // hat anula disparo
    expect(state.status).toBe('playing');
  });

  test('fix-squish — aplaste tipo Mario: mata, el monstruo muere y el Robo vive', () => {
    const { state, events } = replayFixture(FIX_SQUISH);
    const kill = events.find((e) => typeof e !== 'string' && e.type === 'kill');
    expect(kill).toMatchObject({ by: 'squish' });
    expect(state.monsters).toHaveLength(0);
    expect(state.status).toBe('playing');
  });

  test('fix-squish-fast — caída rápida NO muere por contacto (tolerancia R4)', () => {
    const { state, events } = replayFixture(FIX_SQUISH_FAST);
    expect(kinds(events)).toContain('kill');
    expect(state.status).toBe('playing');
  });

  test('fix-aim — toques derecha/izquierda/arriba matan a los tres monstruos', () => {
    const { state, events } = replayFixture(FIX_AIM);
    expect(countOf(events, 'kill')).toBe(3);
    // D18: cada kill por bala lleva la posición del monstruo impactado.
    const kills = events.filter(
      (e): e is Extract<RoboJumpEvent, { type: 'kill' }> =>
        typeof e !== 'string' && e.type === 'kill',
    );
    for (const k of kills) {
      expect(k.by).toBe('bullet');
      expect(Number.isFinite(k.x) && Number.isFinite(k.y)).toBe(true);
    }
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
    expect(state.robo.x).toBeLessThan(60);
    expect(state.status).toBe('playing');
    expect(events.some((e) => typeof e === 'object' && e.type === 'die')).toBe(false);
  });

  test('fix-density — escalada forzada: plataformas acotadas, gaps legales, cursor avanza', () => {
    const { state, events } = replayFixture(FIX_DENSITY);
    expect(state.status).toBe('playing');
    const span = CLEAN_MARGIN + WORLD_H + SPAWN_AHEAD;
    const worstCase = Math.ceil(span / MIN_GAP) + 1;
    expect(state.platforms.length).toBeLessThanOrEqual(Math.max(worstCase, PLATFORM_POOL) + 6);
    // Escalera sin compañeras (D16): gaps legales en todo momento.
    const ladder = state.platforms
      .filter((p) => !isCompanionPlatform(p, state.platforms))
      .sort((a, b) => b.y - a.y);
    for (let i = 0; i < ladder.length - 1; i++) {
      expect(ladder[i].y - ladder[i + 1].y).toBeGreaterThanOrEqual(MIN_GAP - 1);
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
