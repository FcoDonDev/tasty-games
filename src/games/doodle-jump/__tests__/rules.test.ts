/**
 * Tests del engine puro de Doodle Jump (PLAN-DOODLE-JUMP T1–T3, §3.3):
 * física, colisiones, cámara monotónica, caps y determinismo por partición
 * de dt (D9). El auto-rebote sin input horizontal es el ancla determinista
 * de los seeds E2E (§3.5).
 */

import {
  advance,
  applyDragX,
  blueProbFor,
  createGameState,
  maxGapFor,
  maxJumpHeight,
  monsterProbFor,
  monsterX,
  platformX,
  setMoveDir,
  shoot,
  type DoodleJumpEvent,
  type GameState,
  type Platform,
} from '../engine/rules';
import {
  DOODLER_H,
  JUMP_V,
  MAX_BULLETS,
  MIN_GAP,
  SPRING_V,
  STEP_MS,
  WORLD_H,
  WORLD_W,
} from '../engine/tuning';

/** Avanza `ms` conservando el leftover entre llamadas (partición del rAF). */
function run(state: GameState, ms: number, chunkMs = 16): { state: GameState; events: DoodleJumpEvent[] } {
  let current = state;
  const events: DoodleJumpEvent[] = [];
  let remaining = ms;
  let carry = 0;
  while (remaining > 0) {
    const chunk = Math.min(chunkMs, remaining);
    const result = advance(current, chunk + carry);
    events.push(...result.events);
    current = result.state;
    carry = result.leftoverMs;
    remaining -= chunk;
  }
  return { state: current, events };
}

/** Avanza N sub-pasos exactos (STEP_MS), exponiendo el estado de cada uno. */
function substeps(
  state: GameState,
  n: number,
): { states: GameState[]; events: DoodleJumpEvent[]; final: GameState } {
  const states: GameState[] = [];
  const events: DoodleJumpEvent[] = [];
  let current = state;
  for (let i = 0; i < n; i++) {
    const r = advance(current, STEP_MS);
    states.push(r.state);
    events.push(...r.events);
    current = r.state;
  }
  return { states, events, final: current };
}

describe('rules doodle-jump: física núcleo', () => {
  test('auto-rebote: cae sobre la plataforma inicial y rebota (sin input)', () => {
    const state = createGameState({ rngSeed: 7 });
    // Un salto completo: sube con JUMP_V y vuelve a la plataforma.
    const bounceMs = (2 * JUMP_V) / 1400 * 1000;
    const { state: after, events } = run(state, bounceMs + 120);
    expect(events).toContain('bounce');
    expect(after.status).toBe('playing');
    // El rebote lo dejó nuevamente justo sobre la plataforma inicial.
    expect(after.doodler.vy).toBeLessThanOrEqual(0);
  });

  test('determinismo por partición de dt (D9): mismo input → mismo estado', () => {
    const a = run(createGameState({ rngSeed: 42 }), 2000, 16);
    const b = run(createGameState({ rngSeed: 42 }), 2000, 7);
    const c = run(createGameState({ rngSeed: 42 }), 2000, 40);
    expect(a.state.doodler).toEqual(b.state.doodler);
    expect(a.state.doodler).toEqual(c.state.doodler);
    expect(a.state.height).toBe(c.state.height);
    expect(a.state.platforms.map((p) => p.id)).toEqual(c.state.platforms.map((p) => p.id));
  });

  test('mismo seed → misma secuencia; distinto seed → distinto reparto', () => {
    const a = createGameState({ rngSeed: 1 });
    const b = createGameState({ rngSeed: 1 });
    const c = createGameState({ rngSeed: 2 });
    expect(a.platforms).toEqual(b.platforms);
    expect(a.platforms).not.toEqual(c.platforms);
  });

  test('avance sin sub-pasos devuelve la misma referencia', () => {
    const state = createGameState({ rngSeed: 7 });
    const result = advance(state, 3);
    expect(result.state).toBe(state);
    expect(result.leftoverMs).toBe(3);
  });

  test('la partida terminada no avanza (misma referencia, sin eventos)', () => {
    const state = { ...createGameState({ rngSeed: 7 }), status: 'over' as const };
    const result = advance(state, 100);
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
  });
});

describe('rules doodle-jump: colisiones de plataformas', () => {
  test('subir atraviesa la plataforma sin rebotar (colisión solo al caer)', () => {
    const state = createGameState({ rngSeed: 7 });
    // Doodler DEBAJO de una plataforma, subiendo: nunca la cruza hacia arriba.
    const p = state.platforms[0];
    const under: GameState = {
      ...state,
      doodler: { ...state.doodler, x: p.x, y: p.y + DOODLER_H / 2 + 4, vy: -200 },
    };
    const { final, events } = substeps(under, 20);
    expect(events).not.toContain('bounce');
    expect(final.doodler.y).toBeLessThan(under.doodler.y); // atravesó hacia arriba
  });

  test('aterrizar en brown la rompe: no rebota y desaparece (evento break)', () => {
    const state = createGameState({ rngSeed: 7 });
    const brown: Platform = { id: 999, kind: 'brown', x: WORLD_W / 2, y: state.doodler.y + DOODLER_H / 2, phase: 0, spring: false, hat: false };
    const withBrown: GameState = { ...state, platforms: [brown, ...state.platforms.filter((p) => p.id !== 0)] };
    const { state: after, events } = run(withBrown, 150);
    expect(events).toContain('break');
    expect(after.platforms.some((p) => p.id === 999)).toBe(false);
    expect(events).not.toContain('bounce');
  });

  test('aterrizar en spring impulsa más fuerte (evento spring)', () => {
    const state = createGameState({ rngSeed: 7 });
    const spring: Platform = {
      id: 999,
      kind: 'green',
      x: WORLD_W / 2,
      y: state.doodler.y + DOODLER_H / 2,
      phase: 0,
      spring: true,
      hat: false,
    };
    const withSpring: GameState = {
      ...state,
      platforms: [spring, ...state.platforms.filter((p) => p.id !== 0)],
    };
    const { states, events } = substeps(withSpring, 30);
    const landing = events.findIndex((e) => e === 'spring');
    expect(landing).toBeGreaterThanOrEqual(0);
    expect(states[landing].doodler.vy).toBe(-SPRING_V);
  });

  test('la plataforma azul oscila determinísticamente', () => {
    const state = createGameState({ rngSeed: 7 });
    const blue: Platform = {
      id: 998,
      kind: 'blue',
      x: WORLD_W / 2,
      y: 100,
      phase: 0,
      spring: false,
      hat: false,
    };
    const withBlue: GameState = { ...state, platforms: [blue, ...state.platforms] };
    const { state: after } = run(withBlue, 1000);
    const blueOut = after.platforms.find((p) => p.id === 998);
    if (!blueOut) throw new Error('plataforma azul desapareció');
    expect(blueOut.phase).toBeCloseTo(1.6, 0); // BLUE_SPEED rad/s × 1 s
    expect(platformX(blueOut)).not.toBe(blueOut.x);
    // Determinista: mismo tiempo → misma fase.
    const again = run(withBlue, 1000).state.platforms.find((p) => p.id === 998);
    expect(again?.phase).toBe(blueOut.phase);
  });
});

describe('rules doodle-jump: wrap, drag y teclado', () => {
  test('drag cruza el borde izquierdo y aparece por la derecha (facing -1)', () => {
    const state = createGameState({ rngSeed: 7 });
    const atLeft = { ...state, doodler: { ...state.doodler, x: 5 } };
    const after = applyDragX(atLeft, -10);
    expect(after.doodler.x).toBeCloseTo(WORLD_W - 5, 0);
    expect(after.doodler.facing).toBe(-1);
  });

  test('el drag clampea el delta por evento (anti-teleport)', () => {
    const state = createGameState({ rngSeed: 7 });
    const after = applyDragX(state, 5000);
    expect(after.doodler.x - state.doodler.x).toBeLessThanOrEqual(24 + 1e-9);
  });

  test('el drag no se aplica con la partida terminada', () => {
    const state = { ...createGameState({ rngSeed: 7 }), status: 'over' as const };
    expect(applyDragX(state, 10)).toBe(state);
  });

  test('teclado D7: setMoveDir fija velocidad; sin tecla vuelve a 0', () => {
    const state = createGameState({ rngSeed: 7 });
    const moving = setMoveDir(state, -1);
    expect(moving.moveDir).toBe(-1);
    const { state: after } = run(moving, 100);
    expect(after.doodler.x).toBeLessThan(state.doodler.x);
    expect(after.doodler.facing).toBe(-1);
    const stopped = setMoveDir(after, 0);
    const { state: still } = run(stopped, 50);
    expect(still.doodler.vx).toBe(0);
  });
});

describe('rules doodle-jump: cámara y score', () => {
  test('la cámara scrolla solo al cruzar la línea y nunca retrocede (D11)', () => {
    let state = createGameState({ rngSeed: 7 });
    let lastCam = state.camY;
    for (let i = 0; i < 200 && state.status === 'playing'; i++) {
      const result = advance(state, 16);
      state = result.state;
      expect(state.camY).toBeLessThanOrEqual(lastCam); // nunca baja
      lastCam = state.camY;
    }
    // Sin input horizontal: el Doodler rebota en la primera plataforma y el
    // apex (≈ START_Y - maxJump) no cruza la línea (256) → sin scroll.
    expect(state.camY).toBe(0);
    expect(state.score).toBe(Math.round(state.height / 10));

    // Con el Doodler por encima de la línea, el scroll lo deja sobre ella.
    const above: GameState = { ...state, doodler: { ...state.doodler, y: 200, vy: 0 } };
    const { state: scrolled } = advance(above, 8);
    expect(scrolled.camY).toBeCloseTo(scrolled.doodler.y - WORLD_H * 0.4, 5);
    expect(scrolled.camY).toBeLessThan(0);
  });

  test('al caer la cámara no baja (no hay descenso)', () => {
    const state = createGameState({ rngSeed: 7 });
    // Cámara elevada con el Doodler DEBAJO de la línea, cayendo.
    const high: GameState = { ...state, camY: 300, nextSpawnY: 0, doodler: { ...state.doodler, y: 600, vy: 200 } };
    const { state: after } = run(high, 200);
    expect(after.camY).toBe(300);
  });
});

describe('rules doodle-jump: hat, balas y monstruos', () => {
  function withHatPlatform(): { state: GameState; hatId: number } {
    const base = createGameState({ rngSeed: 7 });
    const hat: Platform = { id: 997, kind: 'green', x: WORLD_W / 2, y: base.doodler.y + DOODLER_H / 2, phase: 0, spring: false, hat: true };
    return { state: { ...base, platforms: [hat, ...base.platforms.filter((p) => p.id !== 0)] }, hatId: 997 };
  }

  test('el hat se activa al aterrizar: ascenso sostenido y dispara evento hat', () => {
    const { state } = withHatPlatform();
    const { state: after, events } = run(state, 300);
    expect(events).toContain('hat');
    expect(after.doodler.hatMs).toBeGreaterThan(0);
    expect(after.doodler.vy).toBe(-160);
    expect(after.doodler.y).toBeLessThan(state.doodler.y);
  });

  test('con hat activo el disparo se rechaza (misma referencia, D12)', () => {
    const { state } = withHatPlatform();
    const hatted = run(state, 300).state;
    const shot = shoot(hatted);
    expect(shot.state).toBe(hatted);
    expect(shot.events).toEqual([]);
  });

  test('el hat atraviesa y destruye al monstruo sin bounce (D12)', () => {
    const base = createGameState({ rngSeed: 7, height: 1000 });
    const hatted: GameState = {
      ...base,
      doodler: { ...base.doodler, hatMs: 1000, vy: -160 },
      monsters: [{ id: 50, kind: 'static', x: WORLD_W / 2, y: base.doodler.y - 60, phase: 0 }],
    };
    const { state: after, events } = run(hatted, 600);
    expect(events).toContain('kill');
    expect(after.monsters.some((m) => m.id === 50)).toBe(false);
    expect(after.status).toBe('playing');
  });

  test('disparo mata al monstruo por contacto (evento kill)', () => {
    const base = createGameState({ rngSeed: 7 });
    // Monstruo al LADO del Doodler, a la altura de la nariz: la bala
    // horizontal lo alcanza (D3 revisada).
    const bulletY = base.doodler.y - DOODLER_H / 2 - 4;
    const setup: GameState = {
      ...base,
      monsters: [{ id: 50, kind: 'static', x: base.doodler.x + 120, y: bulletY, phase: 0 }],
    };
    const { state: fired } = shoot(setup);
    expect(fired.bullets).toHaveLength(1);
    const { state: after, events } = run(fired, 400);
    expect(events).toContain('kill');
    expect(after.monsters.some((m) => m.id === 50)).toBe(false);
    expect(after.status).toBe('playing');
  });

  test('tope de balas activas (MAX_BULLETS)', () => {
    let state = createGameState({ rngSeed: 7 });
    for (let i = 0; i < MAX_BULLETS + 2; i++) {
      const result = shoot(state);
      state = result.state;
    }
    expect(state.bullets).toHaveLength(MAX_BULLETS);
  });

  test('disparo horizontal según facing (D3 revisada)', () => {
    const base = createGameState({ rngSeed: 7 });
    // Mirando a la derecha: la bala sale por la nariz y avanza +x.
    const right: GameState = { ...base, doodler: { ...base.doodler, facing: 1 } };
    const shotRight = shoot(right).state;
    expect(shotRight.bullets).toHaveLength(1);
    const b0 = shotRight.bullets[0];
    expect(b0.vx).toBeGreaterThan(0);
    expect(b0.x).toBeGreaterThan(right.doodler.x);
    const { state: after } = run(shotRight, 32);
    const b1 = after.bullets[0];
    if (!b1) throw new Error('bala despawneara antes de tiempo');
    expect(b1.x).toBeGreaterThan(b0.x); // avanzó horizontal
    expect(b1.y).toBe(b0.y); // altura constante ("nose ball", sin gravedad)
    // Mirando a la izquierda: vx negativo y sale hacia -x.
    const left: GameState = { ...base, doodler: { ...base.doodler, facing: -1 } };
    const shotLeft = shoot(left).state;
    expect(shotLeft.bullets[0].vx).toBeLessThan(0);
    expect(shotLeft.bullets[0].x).toBeLessThan(left.doodler.x);
  });

  test('la bala despawnea al salir por el borde lateral (sin wrap, D3)', () => {
    const base = createGameState({ rngSeed: 7 });
    const left: GameState = {
      ...base,
      doodler: { ...base.doodler, facing: -1 },
      platforms: [],
      nextSpawnY: -700,
    };
    const { state: fired } = shoot(left);
    // 300 ms: la bala sale del borde (~235 ms) y el Doodler sigue vivo.
    const { state: after } = run(fired, 300);
    expect(after.bullets).toHaveLength(0);
    expect(after.status).toBe('playing');
  });

  test('aplaste con caída rápida: la tolerancia escala con el sub-paso (R4)', () => {
    const base = createGameState({ rngSeed: 7 });
    // Caída RÁPIDA (vy 900 u/s): cruza ~7 u por sub-paso de 8 ms — una
    // tolerancia fija de 2 u leía el cruce como muerte en vez de aplaste.
    const monsterY = base.doodler.y;
    const setup: GameState = {
      ...base,
      doodler: { ...base.doodler, y: monsterY - 120, vy: 900 },
      monsters: [{ id: 50, kind: 'static', x: WORLD_W / 2, y: monsterY, phase: 0 }],
      platforms: [],
      nextSpawnY: -700,
    };
    const { state: after, events } = run(setup, 300);
    expect(events).toContain('kill');
    expect(after.monsters.some((m) => m.id === 50)).toBe(false);
    expect(after.status).toBe('playing'); // el aplaste lo salvó
  });

  test('aplaste tipo Mario: cayendo sobre la cabeza lo mata y rebota (D12)', () => {
    const base = createGameState({ rngSeed: 7 });
    // Sin plataformas en el trayecto (y sin generación): caída limpia al monstruo.
    const monsterY = base.doodler.y;
    const setup: GameState = {
      ...base,
      doodler: { ...base.doodler, y: monsterY - 80, vy: 300 },
      monsters: [{ id: 50, kind: 'static', x: WORLD_W / 2, y: monsterY, phase: 0 }],
      platforms: [],
      nextSpawnY: -700,
    };
    const { state: after, events } = run(setup, 300);
    expect(events).toContain('kill');
    expect(after.monsters.some((m) => m.id === 50)).toBe(false);
    expect(after.status).toBe('playing'); // el aplaste lo salvó
    expect(after.doodler.vy).toBeLessThan(0); // rebotó hacia arriba
  });

  test('tocar un monstruo de lado muere (evento die monster)', () => {
    const base = createGameState({ rngSeed: 7 });
    // Sin plataformas: contacto lateral con vy > 0 pero sin cruce superior.
    const monsterY = base.doodler.y;
    const setup: GameState = {
      ...base,
      doodler: { ...base.doodler, x: WORLD_W / 2 - 18, y: monsterY, vy: 50 },
      monsters: [{ id: 50, kind: 'static', x: WORLD_W / 2, y: monsterY, phase: 0 }],
      platforms: [],
      nextSpawnY: -700,
    };
    const { state: after, events } = run(setup, 100);
    expect(events).toEqual([{ type: 'die', cause: 'monster' }]);
    expect(after.status).toBe('over');
  });

  test('el monstruo móvil oscila (fase avanza, x cambia)', () => {
    const base = createGameState({ rngSeed: 7, height: 1000 });
    const setup: GameState = {
      ...base,
      monsters: [{ id: 50, kind: 'mobile', x: WORLD_W / 2, y: base.doodler.y - 300, phase: 0 }],
    };
    const { state: after } = run(setup, 1000);
    const mob = after.monsters.find((m) => m.id === 50);
    if (!mob) throw new Error('monstruo desapareció');
    expect(monsterX(mob)).not.toBe(mob.x);
    const again = run(setup, 1000).state.monsters.find((m) => m.id === 50);
    expect(again?.phase).toBe(mob.phase);
  });
});

describe('rules doodle-jump: muerte, generación y caps', () => {
  test('caer bajo la cámara muere con cause fall (una sola vez)', () => {
    let state = createGameState({ rngSeed: 7 });
    // Quitar TODAS las plataformas Y desactivar la generación: caída limpia.
    state = { ...state, platforms: [], nextSpawnY: -700 };
    const { state: after, events } = run(state, 3000);
    expect(events.filter((e) => typeof e === 'object')).toHaveLength(1);
    expect(events[events.length - 1]).toEqual({ type: 'die', cause: 'fall' });
    expect(after.status).toBe('over');
  });

  test('alcanzabilidad estructural: todo gap generado cabe en el salto (D-test)', () => {
    const maxJump = maxJumpHeight();
    for (const seed of [1, 2, 3, 11, 42, 97]) {
      for (const height of [0, 1000, 5000, 20000]) {
        const state = createGameState({ rngSeed: seed, height });
        // Orden descendente por y: de abajo hacia arriba, gaps consecutivos.
        const sorted = [...state.platforms].sort((a, b) => b.y - a.y);
        expect(sorted.length).toBeGreaterThan(10);
        for (let i = 0; i < sorted.length - 1; i++) {
          const low = sorted[i];
          const high = sorted[i + 1];
          const gap = low.y - high.y;
          expect(gap).toBeLessThanOrEqual(maxGapFor(height) + 1e-9);
          expect(gap).toBeLessThan(maxJump); // margen de salto siempre
          expect(gap).toBeGreaterThanOrEqual(MIN_GAP - 1e-9);
        }
      }
    }
  });

  test('caps de entidades activas y limpieza bajo cámara', () => {
    let state = createGameState({ rngSeed: 7, height: 5000 });
    for (let i = 0; i < 200 && state.status === 'playing'; i++) {
      state = advance(state, 16).state;
      expect(state.monsters.length).toBeLessThanOrEqual(6);
      for (const p of state.platforms) {
        expect(p.y).toBeLessThan(state.camY + WORLD_H + 100);
        expect(p.y).toBeGreaterThan(state.camY - WORLD_H - 150);
      }
    }
    expect(state.height).toBeGreaterThan(0);
  });

  test('invariantes de probabilidad de generación', () => {
    expect(blueProbFor(0)).toBeCloseTo(0.05, 5);
    expect(monsterProbFor(100 * 1000)).toBeCloseTo(0.25, 5);
    expect(maxJumpHeight()).toBeCloseTo(112, 0);
  });
});
