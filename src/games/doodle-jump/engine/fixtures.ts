/**
 * Fixtures de validación (PLAN-DOODLE-JUMP, pedido del usuario): escenarios
 * con mundo FIJO (plataformas/monstruos/potenciadores explícitos) + GUIÓN de
 * input, para tests pautados con comportamiento esperado — tanto unit
 * (`__tests__/fixtures.test.ts`) como E2E vía seeds `?seed=fix-<id>`
 * (el gate EXPO_PUBLIC_E2E los activa, §3.5).
 *
 * Los mundos son CERRADOS (`closed: true`): lo provisto es el mundo, sin
 * generación procedural → 100% determinista. Cada fixture documenta el
 * resultado esperado; los asserts viven en los tests.
 */

import { advance, applyDragX, createGameState, shoot, type DoodleJumpConfig, type DoodleJumpEvent, type GameState } from './rules';

/** Un paso del guión: avanzar ms y opcionalmente input discreto. */
export interface FixtureStep {
  ms: number;
  /** Teclado (D7): -1 izq, 1 der. */
  dir?: -1 | 0 | 1;
  /** Drag relativo en unidades (clamp DRAG_MAX_DELTA por llamada). */
  drag?: number;
  /** Disparo apuntado (dirección en unidades del mundo). */
  aim?: { dx: number; dy: number };
}

export interface Fixture {
  id: string;
  description: string;
  config: DoodleJumpConfig;
  steps: FixtureStep[];
  /** Resultado esperado, documentado (los asserts viven en los tests). */
  expected: string[];
}

/** Crea el mundo del fixture (determinista, cerrado). */
export function fixtureState(fixture: Fixture): { state: ReturnType<typeof createGameState>; events: DoodleJumpEvent[] } {
  const state = createGameState(fixture.config);
  return { state, events: [] };
}

/** Pasos con avance particionado en frames de 16 ms (patrón run de rules.test). */
export function stepOnce(state: GameState, step: FixtureStep): { state: GameState; events: DoodleJumpEvent[] } {
  let current = state;
  const events: DoodleJumpEvent[] = [];
  if (step.drag) {
    current = applyDragX(current, step.drag);
  }
  if (step.dir !== undefined) {
    current = { ...current, moveDir: step.dir };
  }
  if (step.aim !== undefined) {
    const result = shoot(current, step.aim);
    current = result.state;
    events.push(...result.events);
  }
  let remaining = step.ms;
  let carry = 0;
  while (remaining > 0) {
    const chunk = Math.min(16, remaining);
    const result = advance(current, chunk + carry);
    events.push(...result.events);
    current = result.state;
    carry = result.leftoverMs;
    remaining -= chunk;
  }
  return { state: current, events };
}

/** Corre el guión completo; expone el estado final y todos los eventos. */
export function replayFixture(fixture: Fixture): { state: GameState; events: DoodleJumpEvent[] } {
  let { state } = fixtureState(fixture);
  const events: DoodleJumpEvent[] = [];
  for (const step of fixture.steps) {
    const result = stepOnce(state, step);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

const baseDoodler = { x: 180 };

export const FIX_SPRING: Fixture = {
  id: 'spring',
  description: 'Spring: el Doodler cae sobre la plataforma con resorte y sale impulsado (SPRING_V).',
  config: {
    closed: true,
    rngSeed: 21,
    doodler: { ...baseDoodler, y: 430, vy: 200 },
    platforms: [
      { id: 0, kind: 'green', x: 180, y: 556, phase: 0, spring: false, hat: false },
      { id: 1, kind: 'green', x: 180, y: 456, phase: 0, spring: true, hat: false },
    ],
  },
  steps: [{ ms: 2200 }],
  expected: [
    "evento 'spring'",
    'el Doodler sobrevive (bota eternamente en el spring)',
    'score ≥ 30 (el impulso lo lleva ~240 u sobre el resorte)',
  ],
};

export const FIX_HAT: Fixture = {
  id: 'hat',
  description: 'Propeller hat: asciende sostenido, atraviesa letalmente al monstruo y anula el disparo (D12).',
  config: {
    closed: true,
    rngSeed: 22,
    doodler: { ...baseDoodler, y: 430, vy: 150 },
    platforms: [
      { id: 0, kind: 'green', x: 180, y: 556, phase: 0, spring: false, hat: false },
      { id: 1, kind: 'green', x: 180, y: 456, phase: 0, spring: false, hat: true },
    ],
    monsters: [{ id: 50, kind: 'static', x: 180, y: 206, phase: 0 }],
  },
  steps: [{ ms: 600, aim: undefined }, { ms: 1000 }, { ms: 1400, aim: { dx: 1, dy: 0 } }],
  expected: [
    "eventos en orden ['hat', 'kill']",
    'el monstruo desaparece (atravesado con hat)',
    'sin bala al intentar disparar con hat activo',
    'el Doodler sigue vivo',
  ],
};

export const FIX_SQUISH: Fixture = {
  id: 'squish',
  description: 'Aplaste tipo Mario: cayendo sobre la cabeza del monstruo lo mata y rebota (vy 300 y vy 900, R4).',
  config: {
    closed: true,
    rngSeed: 22,
    doodler: { ...baseDoodler, y: 376, vy: 300 },
    platforms: [
      { id: 0, kind: 'green', x: 180, y: 556, phase: 0, spring: false, hat: false },
    ],
    monsters: [{ id: 50, kind: 'static', x: 180, y: 436, phase: 0 }],
  },
  steps: [{ ms: 800 }],
  expected: ["evento 'kill'", 'el monstruo muere', 'el Doodler rebotó (vy < 0) y vive'],
};

export const FIX_SQUISH_FAST: Fixture = {
  id: 'squish-fast',
  description: 'Aplaste con caída RÁPIDA (vy 900): la tolerancia escala con el sub-paso (R4) — no muere.',
  config: {
    closed: true,
    rngSeed: 23,
    doodler: { ...baseDoodler, y: 316, vy: 900 },
    platforms: [
      { id: 0, kind: 'green', x: 180, y: 556, phase: 0, spring: false, hat: false },
    ],
    monsters: [{ id: 50, kind: 'static', x: 180, y: 436, phase: 0 }],
  },
  steps: [{ ms: 700 }],
  expected: ["evento 'kill'", 'el Doodler NO muere por contacto lateral'],
};

export const FIX_AIM: Fixture = {
  id: 'aim',
  description: 'Disparo apuntado (D3): toques derecha/izquierda/arriba eliminan al monstruo de cada lado.',
  config: {
    closed: true,
    rngSeed: 24,
    platforms: [
      { id: 0, kind: 'green', x: 180, y: 556, phase: 0, spring: false, hat: false },
    ],
    monsters: [
      { id: 51, kind: 'static', x: 300, y: 544, phase: 0 },
      { id: 52, kind: 'static', x: 60, y: 544, phase: 0 },
      { id: 53, kind: 'static', x: 180, y: 344, phase: 0 },
    ],
  },
  steps: [
    { ms: 0, aim: { dx: 1, dy: 0 } }, // t=0: sin rebotar aún, a la altura de R/L
    { ms: 300, aim: { dx: -1, dy: 0 } },
    { ms: 300, aim: { dx: 0, dy: -1 } },
    { ms: 400 },
  ],
  expected: [
    "tres eventos 'kill' (derecha, izquierda, arriba)",
    'los tres monstruos desaparecen',
    'el Doodler sigue vivo (botando en la plataforma base)',
  ],
};

export const FIX_BLUE_BROWN: Fixture = {
  id: 'blue-brown',
  description: 'Azul oscila (alcanzable en dos rebotes); marrón se rompe al caer y no rebota.',
  config: {
    closed: true,
    rngSeed: 25,
    doodler: { ...baseDoodler, y: 200, vy: 300 },
    platforms: [
      { id: 0, kind: 'green', x: 180, y: 556, phase: 0, spring: false, hat: false },
      { id: 1, kind: 'brown', x: 180, y: 300, phase: 0, spring: false, hat: false },
      { id: 2, kind: 'blue', x: 180, y: 400, phase: 0, spring: false, hat: false },
    ],
  },
  steps: [{ ms: 1800 }],
  expected: [
    "evento 'break' (marrón atravesado) y luego 'bounce' (azul)",
    'la fase de la azul avanzó (oscilación)',
    'el Doodler sigue vivo',
  ],
};

export const FIX_WRAP: Fixture = {
  id: 'wrap',
  description: 'Wrap-around lateral: drag continuo cruza el borde y reaparece por el opuesto.',
  config: {
    closed: true,
    rngSeed: 26,
    platforms: [
      { id: 0, kind: 'green', x: 180, y: 556, phase: 0, spring: false, hat: false },
    ],
  },
  steps: [
    { ms: 40, drag: 15 },
    { ms: 40, drag: 15 },
    { ms: 40, drag: 15 },
    { ms: 40, drag: 15 },
    { ms: 40, drag: 15 },
    { ms: 40, drag: 15 },
    { ms: 40, drag: 15 },
    { ms: 40, drag: 15 },
    { ms: 40, drag: 15 },
    { ms: 40, drag: 15 },
    { ms: 40, drag: 15 },
    { ms: 40, drag: 15 },
    { ms: 40, drag: 15 },
    { ms: 40, drag: 15 },
    { ms: 40, drag: 15 },
  ],
  expected: ['doodler.x < 60 (cruzó el borde derecho y reapareció por la izquierda)', 'vivo'],
};

/**
 * Mundo denso (R0/R6/R7): escalada forzada con hat 8 s — el conteo de
 * plataformas vivas no puede exceder el peor caso del span (pool).
 */
export const FIX_DENSITY: Fixture = {
  id: 'density',
  description: 'Escalada forzada (hat 8 s): plataformas vivas acotadas y gaps ≥ MIN_GAP en todo momento.',
  config: {
    rngSeed: 27,
    height: 0,
    doodler: { hatMs: 8000, vy: -160 },
  },
  steps: [{ ms: 8000 }],
  expected: ['platforms.length ≤ peor caso del span en todo momento', 'gaps consecutivos ≥ MIN_GAP', 'nextSpawnY avanza'],
};

export const FIXTURES: Record<string, Fixture> = {
  [FIX_SPRING.id]: FIX_SPRING,
  [FIX_HAT.id]: FIX_HAT,
  [FIX_SQUISH.id]: FIX_SQUISH,
  [FIX_SQUISH_FAST.id]: FIX_SQUISH_FAST,
  [FIX_AIM.id]: FIX_AIM,
  [FIX_BLUE_BROWN.id]: FIX_BLUE_BROWN,
  [FIX_WRAP.id]: FIX_WRAP,
  [FIX_DENSITY.id]: FIX_DENSITY,
};
