import type { GameDefinition } from '@/core/types';
import SerpienteScreen from './SerpienteScreen';

/**
 * Regla resumida que se muestra en la pantalla de ayuda.
 * Las reglas completas están en RULES.md del juego y deben usarse para QA.
 */
const RULES = [
  'Serpiente: guía a la serpiente por el tablero 20×20 comiendo sin chocar.',
  '',
  '· Come para crecer: cada comida suma 10 puntos y acelera el paso.',
  '· Cada 5 comidas aparece un especial violeta que caduca en 8 s: vale 50.',
  '· Muere al chocar contra tu propio cuerpo (y contra el muro si el setting de atravesar está apagado).',
  '· Llénalo todo para ganar; al cerrar sumas +1 punto por segundo sobrevivido.',
  '· Control: flechas/WASD en PC, swipe o control flotante en táctil.',
  '',
  'Puntaje: comida ×10 · especial ×50 · supervivencia +1/s.',
  '',
].join('\n');

const serpiente: GameDefinition = {
  id: 'serpiente',
  name: 'Serpiente',
  icon: '🐍',
  description: 'Snake arcade en tiempo real: come, crece y no te muerdas.',
  minDurationHint: '2-5 min',
  supportsLandscape: false,
  rules: RULES,
  Component: SerpienteScreen,
};

export default serpiente;
