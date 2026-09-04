import type { GameDefinition } from '@/core/types';
import MemoriceScreen from './MemoriceScreen';

const memorice: GameDefinition = {
  id: 'memorice',
  name: 'Memorice',
  description: 'Encuentra todos los pares de cartas con la menor cantidad de intentos.',
  minDurationHint: '3-5 min',
  Component: MemoriceScreen,
};

export default memorice;
