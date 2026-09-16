/**
 * GameDefinition de Robo Jump (PLAN-DOODLE-JUMP T7): la única pieza que
 * toca el registro. Nada de este juego importa de otro juego ni expo-sqlite.
 */

import type { GameDefinition } from '@/core/types';
import RoboJumpScreen from './RoboJumpScreen';

const roboJump: GameDefinition = {
  id: 'robo-jump',
  name: 'Robo Jump',
  description:
    'Un robot saltarín trepa plataformas infinitas: resortes, hélice turbo, monstruos y disparos. ¿Hasta dónde llega tu circuito?',
  icon: '🤖',
  minDurationHint: '1-5 min',
  rules: [
    'Tu robot salta solo: movelo arrastrando el dedo (o las flechas del teclado) para aterrizar sobre las plataformas.',
    'La cámara sube con vos: si caés por abajo, perdiste. Las plataformas que quedan atrás desaparecen.',
    'Plataformas: verdes aguantan, azules se mueven, marrones se rompen al pisarlas (tienen una verde de respaldo).',
    'Los resortes y la hélice turbo te impulsan más alto. Con la hélice activa no podés disparar.',
    'Salí por un borde y entrás por el otro.',
    'Dispará con un toque (o Espacio) para eliminar monstruos; también podés aplastarlos cayendo sobre la cabeza.',
    'El score son los metros que subiste: más es mejor.',
  ].join('\n'),
  Component: RoboJumpScreen,
};

export default roboJump;
