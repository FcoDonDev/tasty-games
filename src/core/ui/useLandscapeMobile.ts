import { useWindowDimensions } from 'react-native';

/**
 * Dimensión corta máxima de un teléfono en CSS px. Un viewport landscape con
 * dimensión corta ≤ 480 es un móvil "de costado"; desktop (900+) y tablets
 * (800+) quedan fuera incluso en landscape.
 */
export const MAX_SHORT_EDGE = 480;

/**
 * Función pura (testeable): ¿es un móvil en landscape?
 * Señal de espacio disponible: cubre split-screen/foldables; en desktop una
 * ventana muy achicada (< 480 de corto) también dispara el modo compacto,
 * aceptable (más tablero, misma UI).
 */
export function isLandscapeMobile(width: number, height: number): boolean {
  if (width <= height) return false; // portrait
  return Math.min(width, height) <= MAX_SHORT_EDGE;
}

/**
 * Modo compacto horizontal (header vertical al costado): reactivo al rotar
 * vía useWindowDimensions (multiplataforma, incl. web). En nativo la
 * orientación física la gestiona expo-screen-orientation (lock/unlock por
 * juego); aquí solo importa el espacio disponible.
 */
export function useLandscapeMobile(): boolean {
  const { width, height } = useWindowDimensions();
  return isLandscapeMobile(width, height);
}
