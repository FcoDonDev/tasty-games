import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/** Media query que identifica al puntero primario táctil (celular/tablet web). */
export const COARSE_POINTER_QUERY = '(pointer: coarse)';

export type DevicePlatform = 'ios' | 'android' | 'web';

/**
 * Función pura (testeable): ¿el dispositivo tiene control táctil?
 * Nativo: siempre táctil. Web: el puntero primario es coarse (celular/tablet);
 * un desktop con pantalla táctil reporta `pointer: fine` (mouse) y por diseño
 * queda en teclado. `null` = señal no disponible (sin matchMedia) → no táctil.
 */
export function detectTouchDevice(platform: DevicePlatform, coarsePointer: boolean | null): boolean {
  if (platform !== 'web') return true;
  return coarsePointer ?? false;
}

/** Lee `pointer: coarse` con fallback a touch points si no hay matchMedia. */
function readCoarsePointer(): boolean | null {
  if (typeof window === 'undefined') return null;
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(COARSE_POINTER_QUERY).matches;
  }
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * ¿Hay control táctil en este dispositivo? Nativo: constante `true`. Web:
 * reactivo a cambios de puntero primario (ej. desconectar el mouse de una
 * tablet). Los juegos lo usan para decidir teclado vs overlay táctil.
 */
export function useIsTouchDevice(): boolean {
  const [touch, setTouch] = useState(() => detectTouchDevice(Platform.OS as DevicePlatform, readCoarsePointer()));

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(COARSE_POINTER_QUERY);
    const onChange = () => setTouch(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return touch;
}
