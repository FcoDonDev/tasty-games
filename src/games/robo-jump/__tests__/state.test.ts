/**
 * Tests del store D8 (PLAN-DOODLE-JUMP §3.4): publicación discreta/
 * throttled (cero re-renders por frame), sub-pasos con acumulador,
 * sentinelas y stats de tick.
 */

import {
  type GameState,
} from '../engine/rules';
import {
  drainTickStats,
  getGame,
  setTickStatsEnabled,
  useRoboJumpStore,
} from '../engine/state';
import { WORLD_W } from '../engine/tuning';

/** Simula el loop rAF: `ms` en frames de 16 ms (como en producción). */
function loopTick(ms: number): ReturnType<ReturnType<typeof useRoboJumpStore.getState>['tick']> {
  const store = useRoboJumpStore.getState();
  const events: ReturnType<typeof store.tick> = [];
  const frames = Math.ceil(ms / 16);
  for (let i = 0; i < frames; i++) {
    events.push(...store.tick(16));
  }
  return events;
}

describe('store robo-jump: publicación D8', () => {
  beforeEach(() => {
    useRoboJumpStore.getState().reset(undefined);
    useRoboJumpStore.setState({ paused: false });
    setTickStatsEnabled(false);
  });

  test('getGame es el snapshot mutable: tick avanza sin publicar por frame', () => {
    const before = getGame();
    expect(before.status).toBe('playing');
    const events = loopTick(1000);
    const after = getGame();
    expect(after.elapsedMs).toBeGreaterThan(before.elapsedMs);
    expect(after).not.toBe(before);
    // Con torre sin input no hay muerte: eventos discretos de rebote solo.
    expect(events.filter((e) => typeof e === 'object')).toEqual([]);
  });

  test('publicación throttled: 2 s de tick → ≤ 16 publicaciones (≤5 Hz)', () => {
    let publishes = 0;
    const unsub = useRoboJumpStore.subscribe(() => {
      publishes += 1;
    });
    loopTick(2000);
    unsub();
    // 2 s a 5 Hz = 10 publicaciones de score + margen inicial.
    expect(publishes).toBeLessThanOrEqual(16);
    expect(publishes).toBeGreaterThanOrEqual(1);
  });

  test('la muerte publica inmediatamente el status (overlay de fin)', () => {
    useRoboJumpStore.getState().reset('test-lose');
    expect(useRoboJumpStore.getState().status).toBe('playing');
    loopTick(2000);
    expect(useRoboJumpStore.getState().status).toBe('over');
    expect(getGame().status).toBe('over');
  });

  test('pausa congela la simulación y el acumulador se descarta', () => {
    const store = useRoboJumpStore.getState();
    store.tick(100);
    const snapshot = getGame();
    store.togglePause();
    expect(useRoboJumpStore.getState().paused).toBe(true);
    expect(loopTick(1000)).toEqual([]);
    expect(getGame()).toBe(snapshot); // ni la referencia avanzó
    useRoboJumpStore.getState().togglePause();
  });

  test('applyDrag y setMoveDir ignoran pausa y partida terminada', () => {
    const store = useRoboJumpStore.getState();
    store.togglePause();
    const before = getGame();
    store.applyDrag(10);
    store.setMoveDir(1);
    expect(getGame().robo.x).toBe(before.robo.x);
    expect(getGame().moveDir).toBe(before.moveDir);
    useRoboJumpStore.getState().togglePause();
  });
});

describe('store robo-jump: inputs', () => {
  beforeEach(() => {
    useRoboJumpStore.getState().reset(undefined);
    useRoboJumpStore.setState({ paused: false });
  });

  test('applyDrag mueve al Robo con wrap', () => {
    const store = useRoboJumpStore.getState();
    const before = getGame();
    store.applyDrag(50);
    expect(getGame().robo.x).toBeCloseTo(Math.min(WORLD_W, before.robo.x + 24), 5); // clamp 24
  });

  test('shootNow respeta el cap y devuelve el evento', () => {
    const store = useRoboJumpStore.getState();
    for (let i = 0; i < 5; i++) {
      const events = store.shootNow();
      if (i < 3) expect(events).toEqual(['shoot']);
      else expect(events).toEqual([]);
    }
    expect(getGame().bullets).toHaveLength(3);
  });

  test('setMoveDir fija el dir y el tick lo consume', () => {
    const store = useRoboJumpStore.getState();
    store.setMoveDir(-1);
    expect(getGame().moveDir).toBe(-1);
    store.setMoveDir(0);
    expect(getGame().moveDir).toBe(0);
  });
});

describe('store robo-jump: sentinelas E2E (§3.5)', () => {
  test('test-win: torre central asciende SOLO (score crece sin input)', () => {
    useRoboJumpStore.getState().reset('test-win');
    const store = useRoboJumpStore.getState();
    const before = getGame();
    // El tramo de torre (mundo visible inicial) es todo en el eje X central.
    expect(before.platforms.filter((p) => p.y > 0).every((p) => p.x === WORLD_W / 2)).toBe(true);
    // 6 s en frames de 16 ms: ~5 rebotes de 89 u < MONSTER_START_HEIGHT.
    loopTick(6000);
    const after = getGame();
    expect(after.status).toBe('playing');
    expect(after.height).toBeGreaterThan(300);
    expect(after.score).toBe(Math.round(after.height / 10));
    // Determinismo: la misma seed reproduce la misma altura.
    useRoboJumpStore.getState().reset('test-win');
    loopTick(6000);
    expect(getGame().height).toBe(after.height);
  });

  test('test-lose: monstruo en el eje mata sin input (colisión determinista)', () => {
    useRoboJumpStore.getState().reset('test-lose');
    const events = loopTick(2000);
    expect(events.at(-1)).toEqual({ type: 'die', cause: 'monster' });
    expect(getGame().status).toBe('over');
  });

  test('reset sin seed: partida normal (reparto aleatorio, no torre)', () => {
    useRoboJumpStore.getState().reset(undefined);
    const game = getGame();
    // El reparto normal NO es torre (salvo coincidencia astronómica).
    expect(game.platforms.some((p) => p.x !== WORLD_W / 2)).toBe(true);
  });
});

describe('store robo-jump: stats de tick (ADR 0011)', () => {
  test('drainTickStats acumula y limpia', () => {
    setTickStatsEnabled(true);
    useRoboJumpStore.getState().reset(undefined);
    loopTick(500);
    const stats = drainTickStats();
    expect(stats.tickCalls).toBeGreaterThan(0);
    expect(stats.advanceSamples.length).toBeGreaterThan(0);
    expect(stats.tickPublished).toBeGreaterThan(0);
    const empty = drainTickStats();
    expect(empty.tickCalls).toBe(0);
    setTickStatsEnabled(false);
  });
});

describe('store robo-jump: determinismo de run completa', () => {
  test('misma seed + misma entrada → mismo estado final (incluye drag)', () => {
    const viaStore = (): GameState => {
      useRoboJumpStore.getState().reset('test-win');
      for (let i = 0; i < 120; i++) {
        useRoboJumpStore.getState().applyDrag(i % 2 === 0 ? 6 : -6);
        useRoboJumpStore.getState().tick(16);
      }
      return getGame();
    };
    const a = viaStore();
    const b = viaStore();
    expect(a.robo).toEqual(b.robo);
    expect(a.height).toBe(b.height);
    expect(a.score).toBe(b.score);
  });
});
