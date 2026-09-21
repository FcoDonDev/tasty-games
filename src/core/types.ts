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
  /**
   * Seed opcional para escenarios de test (E2E). Solo se propaga desde
   * app/juego/[id].tsx cuando el build se exporta con EXPO_PUBLIC_E2E=1.
   */
  initialSeed?: string;
  /**
   * Modo de juego pedido por URL (E2E, ej. dificultad `facil|medio|dificil`
   * de serpiente). Solo se propaga con EXPO_PUBLIC_E2E=1; en producción no
   * existe canal para alterarlo. Los juegos que no lo usan lo ignoran.
   */
  initialDifficulty?: string;
  /**
   * Informa el id de registro EFECTIVO de la partida activa (ej. dificultad
   * → `serpiente-facil`). `app/juego/[id].tsx` lo usa para que el ScoreBoard
   * del header consulte la clave correcta (D6). Opcional.
   */
  onActiveGameId?: (gameId: string) => void;
}

export interface GameDefinition {
  id: string; // 'memorice' | 'solitario' | 'damas' | ...
  name: string;
  description: string;
  /** Emoji descriptivo para la card del Home; si falta, GameCard usa la inicial del nombre */
  icon?: string;
  thumbnail?: ImageSourcePropType; // require('./assets/thumb.png')
  minDurationHint?: string; // ej: "5-10 min", solo informativo
  /** Reglas condensadas para la ayuda in-app (RULES.md sigue siendo la fuente QA) */
  rules?: string;
  /**
   * Adapta su layout a landscape móvil (header vertical al costado) y habilita
   * la rotación nativa del dispositivo mientras el juego está activo
   * (lock/unlock por juego en app/juego/[id].tsx). Default: false.
   */
  supportsLandscape?: boolean;
  /**
   * Oculta la card del Home (app/index.tsx) sin desactivar la ruta: el deep
   * link /juego/<id> sigue vivo. Para juegos con UI/UX pendiente que no
   * queremos exponer a usuarios nuevos. Default: false.
   */
  hidden?: boolean;
  Component: ComponentType<GameScreenProps>;
}
