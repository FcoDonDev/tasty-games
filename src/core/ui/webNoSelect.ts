import { Platform } from 'react-native';

const STYLE_ID = 'web-no-select';

/**
 * CSS que deshabilita la selección de texto y el callout de long-press del
 * navegador. En Safari/iOS, un tap sobre un Text (cartas del solitario, HUD de
 * wakwak) activa la selección nativa y dispara "Look Up"/búsqueda o los handles
 * de copiar/pegar, interfiriendo con el juego. La app no tiene TextInput, así
 * que aplicar a '*' es seguro (no hay texto que el usuario necesite copiar).
 */
export const NO_SELECT_CSS = [
  '* {',
  '  -webkit-user-select: none;',
  '  user-select: none;',
  '  -webkit-touch-callout: none;',
  '}',
].join('\n');

/** Inyección DOM testeable. Devuelve true solo si insertó el <style>. */
export function injectNoSelectStyle(doc: Document): boolean {
  if (doc.getElementById(STYLE_ID)) return false;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = NO_SELECT_CSS;
  doc.head.appendChild(style);
  return true;
}

/** Deshabilita la selección de texto en web; idempotente. No-op en nativo. */
export function disableWebTextSelection(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  injectNoSelectStyle(document);
}
