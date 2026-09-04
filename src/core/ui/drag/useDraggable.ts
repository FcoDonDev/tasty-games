import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

export interface DragCallbacks {
  /** El gesto superó el umbral de activación: empieza el arrastre */
  onDragStart: (id: string) => void;
  /** El puntero se soltó; translationX/Y = desplazamiento total del gesto */
  onDragEnd: (id: string, translationX: number, translationY: number) => void;
}

/**
 * Patrón reutilizable de arrastre (Pan + worklets) para cualquier elemento
 * identificado por `id`. El consumidor decide qué hacer con la traslación
 * final (validar drop, snap-back, etc.); este hook solo reporta.
 */
export function useDragGesture(id: string, callbacks: DragCallbacks, enabled: boolean) {
  return useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetX([-10, 10])
        .activeOffsetY([-10, 10])
        .onStart(() => {
          runOnJS(callbacks.onDragStart)(id);
        })
        .onEnd((event) => {
          runOnJS(callbacks.onDragEnd)(id, event.translationX, event.translationY);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, enabled, callbacks.onDragStart, callbacks.onDragEnd],
  );
}
