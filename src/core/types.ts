import type { ComponentType } from 'react';
import type { ImageSourcePropType } from 'react-native';

/**
 * Resultado de una partida terminada.
 *
 * Convención de score: MÁS es mejor.
 * Cada juego debe calcular un score donde un valor mayor sea mejor
 * (ej: memorice `100 - moves`, damas: piezas capturadas).
 * Esto permite a recordsRepository ordenar siempre por score DESC.
 */
export interface GameResult {
  gameId: string;
  won: boolean;
  score?: number;
  durationMs: number;
  finishedAt: string; // ISO 8601
}

export interface GameScreenProps {
  onExit: () => void;
  onGameEnd: (result: GameResult) => void;
}

export interface GameDefinition {
  id: string; // 'memorice' | 'solitario' | 'damas' | ...
  name: string;
  description: string;
  thumbnail?: ImageSourcePropType; // require('./assets/thumb.png')
  minDurationHint?: string; // ej: "5-10 min", solo informativo
  Component: ComponentType<GameScreenProps>;
}
