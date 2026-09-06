import * as Haptics from 'expo-haptics';

const ENABLED = process.env.EXPO_OS !== 'web';

/** Impacto ligero al commit de un drop (mismo frame que el settle visual). */
export function hapticDropCommit(): void {
  if (ENABLED) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

/** Notificación de éxito: partida ganada. */
export function hapticGameWin(): void {
  if (ENABLED) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}
