import { Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

/** Solo nativo tiene control fiable de lock; en web el lock del navegador
 * puede rechazar (desktop) o pedir fullscreen (móvil): no-op. */
const IS_NATIVE = Platform.OS === 'ios' || Platform.OS === 'android';

/** Fija la app en vertical (portrait-up). No-op en web. */
export async function lockPortrait(): Promise<void> {
  if (!IS_NATIVE) return;
  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  } catch {
    // Algunos dispositivos/emuladores rechazan el lock: no debe tumbar la UI.
  }
}

/** Libera la orientación (el sistema decide según el giro del dispositivo). No-op en web. */
export async function unlockOrientation(): Promise<void> {
  if (!IS_NATIVE) return;
  try {
    await ScreenOrientation.unlockAsync();
  } catch {
    // Igual que lockPortrait: el rechazo del sistema no es fatal.
  }
}
