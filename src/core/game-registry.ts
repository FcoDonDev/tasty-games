import type { GameDefinition } from '@/core/types';
import memorice from '@/games/memorice';
import solitario from '@/games/solitario';
import damas from '@/games/damas';
import wakwak from '@/games/wakwak';
import serpiente from '@/games/serpiente';
import roboJump from '@/games/robo-jump';

// Registrar un juego nuevo: crear su carpeta bajo src/games/<id>/,
// implementar el contrato GameDefinition y sumarlo acá.
// Nada más: Home, router y demás juegos no se tocan.
export const GAME_REGISTRY: GameDefinition[] = [memorice, solitario, damas, wakwak, serpiente, roboJump];

export function getGameById(id: string): GameDefinition | undefined {
  return GAME_REGISTRY.find((game) => game.id === id);
}

/** Juegos visibles en el Home: `hidden` saca la card pero mantiene el deep link. */
export function getVisibleGames(): GameDefinition[] {
  return GAME_REGISTRY.filter((game) => !game.hidden);
}
