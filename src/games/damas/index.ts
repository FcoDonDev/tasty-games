import type { GameDefinition } from '@/core/types';
import DamasScreen from './DamasScreen';

const RULES = [
  'Damas chilenas para 2 jugadores en el mismo dispositivo.',
  '',
  '· Peones avanzan 1 casilla en diagonal hacia adelante y capturan hacia adelante y atrás.',
  '· La dama (★) vuela: se desliza cualquier distancia y captura aterrizando en cualquier casilla libre detrás de la pieza rival.',
  '· Capturar es obligatorio; la cadena de multi-salto continúa mientras haya capturas desde la casilla de llegada.',
  '· El peón que llega a la última fila se corona (★) y termina el turno.',
  '· Arrastra la ficha hasta una casilla resaltada; soltar fuera devuelve la ficha.',
  '',
  'Gana quien captura todas las fichas rivales o las deja sin movimientos.',
  'MVP sin récord: no se guarda puntaje.',
  '',
  'Reglas completas para QA: RULES.md del juego.',
].join('\n');

const damas: GameDefinition = {
  id: 'damas',
  name: 'Damas',
  description: 'Damas chilenas para 2 jugadores: captura obligatoria, multi-salto y dama voladora.',
  minDurationHint: '5-10 min',
  rules: RULES,
  Component: DamasScreen,
};

export default damas;
