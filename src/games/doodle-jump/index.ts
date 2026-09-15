/**
 * GameDefinition de Doodle Jump (PLAN-DOODLE-JUMP T7): la única pieza que
 * toca el registro. Nada de este juego importa de otro juego ni expo-sqlite.
 */

import type { GameDefinition } from '@/core/types';
import DoodleJumpScreen from './DoodleJumpScreen';

const doodleJump: GameDefinition = {
  id: 'doodle-jump',
  name: 'Doodle Jump',
  description:
    'Salta entre plataformas infinitas sobre papel cuadriculado: resortes, sombreretes propeller, monstruos y disparos. ¿Hasta dónde llegas?',
  icon: '🟩',
  minDurationHint: '1-5 min',
  rules: [
    'Tu Doodler salta solo: muevelo arrastrando el dedo (o las flechas del teclado) para aterrizar sobre las plataformas.',
    'La cámara sube con vos: si caés por abajo, perdiste. Las plataformas que quedan atrás desaparecen.',
    'Plataformas: verdes aguantan, azules se mueven, marrones se rompen al pisarlas.',
    'Los resortes y los sombreretes propeller te impulsan más alto. Con el sombrerete activo no podés disparar.',
    'Salí por un borde y entrás por el otro.',
    'Dispará con un toque (o Espacio) para eliminar monstruos; también podés aplastarlos cayendo sobre la cabeza.',
    'El score son los metros que subiste: más es mejor.',
  ].join('\n'),
  Component: DoodleJumpScreen,
};

export default doodleJump;
