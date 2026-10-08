/** Nivel de dificultad: decide el nº de pares del mazo (D1). */
export type Difficulty = 'facil' | 'medio' | 'dificil';

/** Orden de presentación en el modal del Home. */
export const DIFFICULTIES: readonly Difficulty[] = ['facil', 'medio', 'dificil'];

/**
 * D1: la dificultad = nº de pares. Facil 8 = juego actual (D5, récord base
 * `memorice` retrocompatible); los símbolos disponibles (12) alcanzan hasta
 * difícil.
 */
export const DIFFICULTY_PAIR_COUNTS: Record<Difficulty, number> = {
  facil: 8,
  medio: 10,
  dificil: 12,
};

/** Nivel default (D5): el juego actual de 8 pares. */
export const DEFAULT_DIFFICULTY: Difficulty = 'facil';

/** Labels de presentación (modal del Home, HUD). */
export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  facil: 'Fácil',
  medio: 'Medio',
  dificil: 'Difícil',
};

/** Hints del modal del Home. */
export const DIFFICULTY_HINTS: Record<Difficulty, string> = {
  facil: '8 pares',
  medio: '10 pares',
  dificil: '12 pares',
};

/**
 * Id de RÉCORD de la dificultad (D2, patrón serpiente/wakwak): claves
 * separadas sin migración de DB — la clave base `memorice` = fácil
 * (retrocompatible con los récords existentes de 8 pares).
 */
export function recordGameId(difficulty: Difficulty): string {
  return difficulty === 'facil' ? 'memorice' : `memorice-${difficulty}`;
}

/**
 * Query param `difficulty` (E2E + flujo normal del Home) → Difficulty, o
 * `undefined` (el caller aplica el default). Igual que
 * `parseSerpienteDifficulty`.
 */
export function parseMemoriceDifficulty(difficulty?: string | null): Difficulty | undefined {
  if (difficulty === 'facil' || difficulty === 'medio' || difficulty === 'dificil') {
    return difficulty;
  }
  return undefined;
}
