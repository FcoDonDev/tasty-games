import { advance, createGameState, stepMs } from '../engine/rules';
import { parseSerpienteSeed, seedConfig } from '../engine/seed';

describe('seeds serpiente (D12)', () => {
  test('parsea los 3 sentinelas y rechaza el resto', () => {
    expect(parseSerpienteSeed('test-win')).toBe('__serpiente_test_win__');
    expect(parseSerpienteSeed('test-lose')).toBe('__serpiente_test_lose__');
    expect(parseSerpienteSeed('test-crecer')).toBe('__serpiente_test_crecer__');
    expect(parseSerpienteSeed('test-move')).toBeUndefined();
    expect(parseSerpienteSeed(undefined)).toBeUndefined();
    expect(parseSerpienteSeed(null)).toBeUndefined();
  });

  test('test-win: un tick gana', () => {
    const state = createGameState(seedConfig(parseSerpienteSeed('test-win')));
    const { state: next, events } = advance(state, stepMs(state.eaten));
    expect(events).toContain('win');
    expect(next.status).toBe('won');
  });

  test('test-lose: un tick muere contra el muro', () => {
    const state = createGameState(seedConfig(parseSerpienteSeed('test-lose')));
    const { state: next, events } = advance(state, stepMs(state.eaten));
    expect(events).toEqual(['die']);
    expect(next.status).toBe('lost');
  });

  test('test-crecer: un tick come y crece', () => {
    const state = createGameState(seedConfig(parseSerpienteSeed('test-crecer')));
    const result = advance(state, stepMs(state.eaten));
    expect(result.events).toEqual(['eat']);
    expect(result.state.eaten).toBe(1);
    expect(result.state.snake).toHaveLength(4);
  });

  test('sin sentinela: partida normal determinista por rngSeed', () => {
    const a = createGameState({ ...seedConfig(undefined), rngSeed: 99 });
    const b = createGameState({ ...seedConfig(undefined), rngSeed: 99 });
    expect(a).toEqual(b);
    expect(a.snake).toHaveLength(4);
    expect(a.status).toBe('playing');
  });
});
