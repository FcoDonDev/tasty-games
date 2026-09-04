import type { GameDefinition } from '@/core/types';
import SolitarioScreen from './SolitarioScreen';

const RULES = [
  'Klondike clásico: ordena las 52 cartas en las 4 foundations, por palo y del As al K.',
  '',
  '· Tableau: baja en rango alternando colores; sobre columna vacía solo se acepta K.',
  '· Roba del mazo (1 o 3 cartas según ajustes); con el mazo vacío se recicla la waste sin límite.',
  '· Solo se mueven secuencias válidas boca arriba; al descubrir una carta, se voltea.',
  '· Undo opcional (ajustes): cada uso penaliza el puntaje.',
  '',
  'Puntaje (más es mejor): score = 1000 − 5·movimientos − floor(segundos/2) − 25·undos.',
  '',
  'Reglas completas para QA: RULES.md del juego.',
].join('\n');

const solitario: GameDefinition = {
  id: 'solitario',
  name: 'Solitario',
  description: 'Klondike clásico: ordena las 52 cartas en las 4 pilas por palo, del As al K.',
  minDurationHint: '5-10 min',
  rules: RULES,
  Component: SolitarioScreen,
};

export default solitario;
