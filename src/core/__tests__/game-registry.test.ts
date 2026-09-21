import { GAME_REGISTRY, getGameById, getVisibleGames } from '../game-registry';

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

  it('declaraciones de soporte landscape por juego', () => {
    expect(getGameById('solitario')?.supportsLandscape).toBe(true);
    // sin opt-in, el default es no-adaptado (falso por omisión)
    expect(getGameById('memorice')?.supportsLandscape).toBeFalsy();
    expect(getGameById('damas')?.supportsLandscape).toBeFalsy();
  });

  it('registra serpiente con su pantalla', () => {
    const game = getGameById('serpiente');
    expect(game?.id).toBe('serpiente');
    expect(typeof game?.Component).toBe('function');
    expect(game?.supportsLandscape).toBeFalsy();
  });

  it('getVisibleGames excluye hidden y mantiene el deep link por id', () => {
    const visible = getVisibleGames();
    expect(visible.length).toBeLessThan(GAME_REGISTRY.length);
    expect(visible.find((game) => game.id === 'damas')).toBeUndefined();
    // oculto del listado ≠ desactivado: getGameById sigue resolviendo
    expect(getGameById('damas')).toBeDefined();
    // sin hidden, el juego sigue listado
    expect(visible.find((game) => game.id === 'memorice')).toBeDefined();
  });
});
