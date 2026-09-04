import { GAME_REGISTRY, getGameById } from '../game-registry';

describe('game-registry', () => {
  it('expone un registro (aún vacío en fase 0)', () => {
    expect(Array.isArray(GAME_REGISTRY)).toBe(true);
  });

  it('devuelve undefined para ids desconocidos', () => {
    expect(getGameById('inexistente')).toBeUndefined();
  });

  it('encuentra un juego registrado por id', () => {
    const game = getGameById('memorice');
    expect(game).toBeDefined();
    expect(game?.id).toBe('memorice');
    expect(typeof game?.Component).toBe('function');
  });
});
