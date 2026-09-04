import type { GameDefinition } from '@/core/types';
import SolitarioScreen from './SolitarioScreen';

const solitario: GameDefinition = {
  id: 'solitario',
  name: 'Solitario',
  description: 'Klondike clásico: ordena las 52 cartas en las 4 pilas por palo, del As al K.',
  minDurationHint: '5-10 min',
  Component: SolitarioScreen,
};

export default solitario;
