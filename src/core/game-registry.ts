import type { GameDefinition } from '@/core/types';

// Registrar un juego nuevo: crear su carpeta bajo src/games/<id>/,
// implementar el contrato GameDefinition y sumarlo acá.
// Nada más: Home, router y demás juegos no se tocan.
export const GAME_REGISTRY: GameDefinition[] = [];

export function getGameById(id: string): GameDefinition | undefined {
  return GAME_REGISTRY.find((game) => game.id === id);
}
