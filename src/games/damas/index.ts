import type { GameDefinition } from '@/core/types';
import DamasScreen from './DamasScreen';

const damas: GameDefinition = {
  id: 'damas',
  name: 'Damas',
  description: 'Damas chilenas para 2 jugadores: captura obligatoria, multi-salto y dama voladora.',
  minDurationHint: '5-10 min',
  Component: DamasScreen,
};

export default damas;
