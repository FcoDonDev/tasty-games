/**
 * Feel puro de Serpiente (T4, §9.5): decisiones evento→feedback sin efectos.
 * La pantalla ejecuta sonido/haptics/popups con estos datos. Testeado en
 * `__tests__/feel.test.ts`.
 */

import { SPECIAL_EVERY, type SerpienteEvent } from './rules';

/** Hit-stop al comer el especial (visual-only, §4/C). */
export const SPECIAL_HIT_STOP_MS = 70;
/** Freeze de muerte antes del overlay (muerte con causa visible). */
export const DEATH_FREEZE_MS = 400;
/** Retardos del overlay final (muerte: freeze + shake + margen). */
export const END_DELAY_WON_MS = 600;
export const END_DELAY_LOST_MS = 750;

export interface ScorePopupSpec {
  text: string;
  color: string;
}

/** Popup `score-float` por evento (D17); `die`/`win` no llevan popup. */
export function popupForEvent(event: SerpienteEvent): ScorePopupSpec | null {
  if (event === 'eat') return { text: '+10', color: '#FBBF24' };
  if (event === 'special') return { text: '+50', color: '#C4B5FD' };
  return null;
}

/** Hit-stop visual-only por evento (solo el especial lo tiene). */
export function hitStopForEvent(event: SerpienteEvent): number {
  return event === 'special' ? SPECIAL_HIT_STOP_MS : 0;
}

/**
 * Cadena de pitch del blip (§4: sube cada 5 comidas): reutiliza
 * `soundCombo(chain)` de core, que eleva el playback rate con la cadena.
 */
export function comboChainForEaten(eaten: number): number {
  return Math.floor(eaten / SPECIAL_EVERY) + 1;
}
