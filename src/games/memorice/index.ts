import type { GameDefinition } from '@/core/types';
import MemoriceScreen from './MemoriceScreen';

const RULES = [
  'Encuentra todos los pares volteando cartas de a dos.',
  '',
  '· Nivel: se elige al entrar (fácil 8 pares, medio 10, difícil 12).',
  '· Toca una carta para verla; toca una segunda para buscar su par.',
  '· Si coinciden, quedan descubiertas. Si no, se voltean de nuevo al instante.',
  '· Se gana al emparejar todas las cartas.',
  '',
  'Puntaje (más es mejor): score = 100 − intentos. Récords por nivel.',
  '',
  'Reglas completas para QA: RULES.md del juego.',
].join('\n');

const memorice: GameDefinition = {
  id: 'memorice',
  name: 'Memorice',
  icon: '🧠',
  description: 'Encuentra todos los pares de cartas con la menor cantidad de intentos.',
  minDurationHint: '3-5 min',
  rules: RULES,
  Component: MemoriceScreen,
};

export default memorice;
