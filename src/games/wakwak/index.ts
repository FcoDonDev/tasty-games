import type { GameDefinition } from '@/core/types';
import WakWakScreen from './WakWakScreen';

const RULES = [
  'Wak Wak: guía al robot aspiradora por el laberinto recogiendo baterías mientras esquivas a los 4 drones antivirus.',
  '',
  '· Recoge todas las baterías del laberinto para despejar el nivel.',
  '· La súper batería (cuadrada) enciende la súper carga: los drones huyen y puedes recogerlos por puntos.',
  '· El chip dorado aparece a mitad de partida y dura unos segundos: vale 100 puntos.',
  '· Si un drone toca al robot pierdes una batería de vida (3 en total).',
  '· Drones: Cazador te sigue, Emboscador te corta el paso, Caprichoso improvisa y Tímido solo ataca de lejos.',
  '· El túnel lateral teletransporta de un borde al otro (solo el robot lo usa con cabeza fría).',
  '· Control: desliza sobre el tablero, usa el D-pad o las flechas del teclado.',
  '',
  'Puntaje: batería ×10 · súper ×50 · drone ×200 · chip ×100 · bonus por vidas al despejar.',
  '',
  'Reglas completas para QA: RULES.md del juego.',
].join('\n');

const wakwak: GameDefinition = {
  id: 'wakwak',
  name: 'Wak Wak',
  icon: '🤖',
  description: 'Maze-chase en tiempo real: recoge baterías y esquiva a los drones antivirus.',
  minDurationHint: '3-5 min',
  rules: RULES,
  Component: WakWakScreen,
};

export default wakwak;
