import { useRouter } from 'expo-router';

/** Router de expo-router (tipo derivado del hook oficial). */
export type AppRouter = ReturnType<typeof useRouter>;

/**
 * Vuelve atrás si hay historial en el stack (navegación normal dentro de la
 * app); si la pantalla se abrió directamente (deep link, recarga web), el
 * stack no tiene screen previo y `back()` no lleva a ningún lado: reemplaza
 * por el home para que "Salir" siempre funcione.
 */
export function exitToHome(router: AppRouter): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}
