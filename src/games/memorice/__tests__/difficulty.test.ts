import {
  MEMORICE_SYMBOLS,
} from '../engine/deck';
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  DIFFICULTY_HINTS,
  DIFFICULTY_LABELS,
  DIFFICULTY_PAIR_COUNTS,
  parseMemoriceDifficulty,
  recordGameId,
} from '../engine/difficulty';

describe('memorice difficulty', () => {
  it('la tabla D1 fija el nº de pares por nivel (facil = juego actual)', () => {
    expect(DIFFICULTY_PAIR_COUNTS).toEqual({ facil: 8, medio: 10, dificil: 12 });
    expect(DEFAULT_DIFFICULTY).toBe('facil');
  });

  it('los 3 niveles caben en los símbolos disponibles (máx 12 pares = 12 símbolos)', () => {
    for (const difficulty of DIFFICULTIES) {
      expect(DIFFICULTY_PAIR_COUNTS[difficulty]).toBeLessThanOrEqual(MEMORICE_SYMBOLS.length);
    }
  });

  it('recordGameId: la clave base es facil (retrocompatible, D2)', () => {
    expect(recordGameId('facil')).toBe('memorice');
    expect(recordGameId('medio')).toBe('memorice-medio');
    expect(recordGameId('dificil')).toBe('memorice-dificil');
  });

  it('labels y hints cubren los 3 niveles', () => {
    for (const difficulty of DIFFICULTIES) {
      expect(DIFFICULTY_LABELS[difficulty]).toBeTruthy();
      expect(DIFFICULTY_HINTS[difficulty]).toBeTruthy();
    }
  });

  it('parseMemoriceDifficulty: solo los valores canónicos valen', () => {
    expect(parseMemoriceDifficulty('facil')).toBe('facil');
    expect(parseMemoriceDifficulty('medio')).toBe('medio');
    expect(parseMemoriceDifficulty('dificil')).toBe('dificil');
    expect(parseMemoriceDifficulty('normal')).toBeUndefined();
    expect(parseMemoriceDifficulty(undefined)).toBeUndefined();
    expect(parseMemoriceDifficulty('')).toBeUndefined();
  });
});
