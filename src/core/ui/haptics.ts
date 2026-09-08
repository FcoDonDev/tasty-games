import * as Haptics from 'expo-haptics';

const ENABLED = process.env.EXPO_OS !== 'web';

/** Impacto ligero al commit de un drop (mismo frame que el settle visual). */
export function hapticDropCommit(): void {
  if (ENABLED) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

/** Selección direccional (D-pad): un tick por commit del usuario. */
export function hapticSelection(): void {
  if (ENABLED) {
    void Haptics.selectionAsync();
  }
}

/** Notificación de éxito: partida ganada. */
export function hapticGameWin(): void {
  if (ENABLED) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}
