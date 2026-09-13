import { toIndex } from '../engine/grid';
import {
  advance,
  createGameState,
  SCORE_FOOD,
  SCORE_SPECIAL,
  SPECIAL_TTL_MS,
  setDirection,
  stepMs,
  type GameState,
} from '../engine/rules';

function tick(state: GameState, steps = 1): { state: GameState; events: string[] } {
  let current = state;
  const events: string[] = [];
  for (let i = 0; i < steps; i++) {
    const result = advance(current, stepMs(current.eaten));
    events.push(...result.events);
    current = result.state;
  }
  return { state: current, events };
}

describe('rules serpiente', () => {
  test('velocidad progresiva D2: 140 → 70 con piso', () => {
    expect(stepMs(0)).toBe(140);
    expect(stepMs(5)).toBe(120);
    expect(stepMs(17)).toBe(72);
    expect(stepMs(18)).toBe(70);
    expect(stepMs(100)).toBe(70);
  });

  test('comer crece +10 con evento eat y respawnea comida libre', () => {
    const head = toIndex(10, 10);
    const state = createGameState({
      rngSeed: 7,
      wrap: true,
      snake: [head, toIndex(10, 9), toIndex(10, 8)],
      dir: 'right',
      food: toIndex(10, 11),
    });
    const { state: next, events } = tick(state);
    expect(events).toEqual(['eat']);
    expect(next.snake).toHaveLength(4);
    expect(next.snake[0]).toBe(toIndex(10, 11));
    expect(next.eaten).toBe(1);
    expect(next.score).toBe(SCORE_FOOD);
    expect(next.snake).not.toContain(next.food);
  });

  test('mover sin comer: cabeza avanza y cola se libera (puede volver)', () => {
    const state = createGameState({
      rngSeed: 7,
      wrap: true,
      snake: [toIndex(10, 10), toIndex(10, 9)],
      dir: 'right',
      food: toIndex(0, 0),
    });
    const { state: next, events } = tick(state);
    expect(events).toEqual([]);
    expect(next.snake).toEqual([toIndex(10, 11), toIndex(10, 10)]);
    expect(next.status).toBe('playing');
  });

  test('reversa 180° prohibida y duplicado descartado (misma referencia)', () => {
    const state = createGameState({ rngSeed: 7, dir: 'right' });
    expect(setDirection(state, 'left')).toBe(state);
    expect(setDirection(state, 'right')).toBe(state);
    const turned = setDirection(state, 'up');
    expect(turned).not.toBe(state);
    expect(setDirection(turned, 'up')).toBe(turned);
    // Opuesto de lo último encolado también se rechaza.
    expect(setDirection(turned, 'down')).toBe(turned);
  });

  test('buffer máx 2 último-gana', () => {
    const state = createGameState({ rngSeed: 7, dir: 'right' });
    const queued = setDirection(setDirection(setDirection(state, 'up'), 'left'), 'down');
    expect(queued.queued).toEqual(['left', 'down']);
    // Se consumen en orden: up se perdió por el cap, left luego down.
    const { state: next } = tick(queued);
    expect(next.dir).toBe('left');
    expect(next.queued).toEqual(['down']);
  });

  test('muro sin wrap mata con bonus de supervivencia', () => {
    const state = createGameState({
      rngSeed: 7,
      wrap: false,
      snake: [toIndex(0, 5), toIndex(1, 5)],
      dir: 'up',
      food: toIndex(10, 10),
    });
    // 3 s de juego antes de chocar: bonus +3.
    const surviving: GameState = { ...state, elapsedMs: 3050 };
    const { state: next, events } = tick(surviving);
    expect(events).toEqual(['die']);
    expect(next.status).toBe('lost');
    expect(next.score).toBe(3);
  });

  test('muro con wrap atraviesa', () => {
    const state = createGameState({
      rngSeed: 7,
      wrap: true,
      snake: [toIndex(0, 5), toIndex(1, 5)],
      dir: 'up',
      food: toIndex(10, 10),
    });
    const { state: next } = tick(state);
    expect(next.status).toBe('playing');
    expect(next.snake[0]).toBe(toIndex(19, 5));
  });

  test('auto-colisión mata (la cola liberada no cuenta)', () => {
    // Cabeza en (5,5) bajando hacia (6,5) ocupada por el cuerpo.
    const state = createGameState({
      rngSeed: 7,
      wrap: true,
      snake: [toIndex(5, 5), toIndex(5, 6), toIndex(6, 6), toIndex(6, 5), toIndex(6, 4)],
      dir: 'down',
      food: toIndex(0, 0),
    });
    const { state: next, events } = tick(state);
    expect(events).toEqual(['die']);
    expect(next.status).toBe('lost');
  });

  test('especial cada 5 comidas, +50, y caduca a los 8 s', () => {
    let state = createGameState({
      rngSeed: 7,
      wrap: true,
      snake: [toIndex(10, 10), toIndex(10, 9)],
      dir: 'right',
      food: toIndex(10, 11),
    });
    // 4 comidas seguidas poniendo la comida adelante cada vez.
    for (let i = 0; i < 4; i++) {
      const r = tick(state);
      state = r.state;
      state = { ...state, food: state.snake[0] + 1 };
    }
    expect(state.eaten).toBe(4);
    expect(state.special).toBeNull();
    const fifth = tick(state);
    expect(fifth.events).toEqual(['eat']);
    expect(fifth.state.eaten).toBe(5);
    expect(fifth.state.special).not.toBeNull();
    expect(fifth.state.special?.ttlMs).toBe(SPECIAL_TTL_MS);
    // El especial no spawnea sobre la serpiente ni la comida.
    expect(fifth.state.snake).not.toContain(fifth.state.special?.cell ?? -1);
    // Sin comerlo, caduca tras 8 s: el advance topa 8 pasos por llamada
    // (anti-espiral), así que se avanza en tramos. La comida queda en (0,0),
    // inalcanzable en la fila 10: no hay más comidas ni especiales nuevos.
    let roaming = { ...fifth.state, food: toIndex(0, 0) };
    for (let t = 0; t < 10; t++) roaming = advance(roaming, 1000).state;
    expect(roaming.eaten).toBe(5);
    expect(roaming.special).toBeNull();
    expect(roaming.status).toBe('playing');
  });

  test('comer el especial da +50 con evento special', () => {
    const head = toIndex(10, 10);
    const state = createGameState({
      rngSeed: 7,
      wrap: true,
      snake: [head, toIndex(10, 9)],
      dir: 'right',
      food: toIndex(0, 0),
      special: { cell: toIndex(10, 11), ttlMs: SPECIAL_TTL_MS },
    });
    const { state: next, events } = tick(state);
    expect(events).toEqual(['special']);
    expect(next.score).toBe(SCORE_SPECIAL);
    expect(next.snake).toHaveLength(3);
    expect(next.special).toBeNull();
  });

  test('tablero lleno = won con bonus', () => {
    const snake: number[] = [1];
    for (let i = 2; i < 400; i++) snake.push(i);
    const state = createGameState({
      rngSeed: 1,
      wrap: true,
      snake,
      dir: 'left',
      food: 0,
      eaten: 399,
      score: 3990,
    });
    const full: GameState = { ...state, elapsedMs: 2000 };
    const { state: next, events } = tick(full);
    expect(events).toEqual(['eat', 'win']);
    expect(next.status).toBe('won');
    expect(next.snake).toHaveLength(400);
    expect(next.score).toBe(3990 + SCORE_FOOD + 2);
  });

  test('tope 8 pasos por frame (anti-espiral)', () => {
    const state = createGameState({ rngSeed: 7, wrap: true, food: toIndex(0, 0) });
    const { state: next } = advance(state, 100000);
    expect(next.elapsedMs).toBe(8 * 140);
    expect(next.remainderMs).toBe(100000 - 8 * 140);
  });

  test('sin pasos pendientes devuelve la misma referencia', () => {
    const state = createGameState({ rngSeed: 7 });
    expect(advance(state, 0).state).toBe(state);
    const dead: GameState = { ...state, status: 'lost' };
    expect(advance(dead, 5000).state).toBe(dead);
  });

  test('spawn con tablero casi lleno termina (fallback determinista)', () => {
    // 398 segmentos, libres solo la comida (0) y la 2: al comer, el respawn
    // determinista cae en la 2 (el muestreo casi seguro la falla y el
    // fallback la encuentra; ambos caminos devuelven lo mismo).
    const body: number[] = [1];
    for (let i = 3; i < 400; i++) body.push(i);
    const state = createGameState({
      rngSeed: 7,
      wrap: true,
      snake: body,
      dir: 'left',
      food: 0,
      eaten: 398,
      score: 3980,
    });
    expect(state.snake).toHaveLength(398);
    const { state: next, events } = tick(state);
    expect(events).toEqual(['eat']);
    expect(next.snake).toHaveLength(399);
    expect(next.food).toBe(2);
    expect(next.snake).not.toContain(next.food);
  });

  test('determinismo: misma config + mismos inputs = mismo estado', () => {
    const config = { rngSeed: 42, wrap: true } as const;
    const run = (): GameState => {
      let s = createGameState({ ...config });
      s = setDirection(s, 'down');
      s = advance(s, 140).state;
      s = setDirection(s, 'left');
      s = advance(s, 500).state;
      return s;
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  test('dt negativo no retrocede', () => {
    const state = createGameState({ rngSeed: 7 });
    expect(advance(state, -100).state).toBe(state);
  });
});
