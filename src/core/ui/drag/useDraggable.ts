import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { cancelAnimation, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export interface DragCallbacks {
  /** El gesto superó el umbral de activación: empieza el arrastre */
  onDragStart: (id: string) => void;
  /** El puntero se soltó; translation/velocity = desplazamiento y velocidad total del gesto */
  onDragEnd: (
    id: string,
    translationX: number,
    translationY: number,
    velocityX: number,
    velocityY: number,
  ) => void;
  /** El gesto se canceló antes de terminar (segundo dedo, llamada, etc.) */
  onDragCancel?: (id: string) => void;
}

export interface DragTranslate {
  tx: SharedValue<number>;
  ty: SharedValue<number>;
}

/**
 * Patrón reutilizable de arrastre (Pan + worklets) para cualquier elemento
 * identificado por `id`. Si se pasan `translate.tx/ty`, `onUpdate` escribe la
 * traslación directo en el worklet de UI thread (el elemento sigue el puntero
 * sin cruzar runtimes por frame); los callbacks JS quedan solo para
 * start/end/cancel. El consumidor decide qué hacer con la traslación final
 * (validar drop, snap-back, etc.); este hook solo reporta.
 */
export function useDragGesture(
  id: string,
  callbacks: DragCallbacks,
  enabled: boolean,
  translate?: DragTranslate,
) {
  const { tx, ty } = translate ?? {};
  return useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetX([-6, 6])
        .activeOffsetY([-6, 6])
        .onStart(() => {
          'worklet';
          if (tx && ty) {
            // Interrumpe un settle/snap-back en vuelo: el gesto manda
            cancelAnimation(tx);
            cancelAnimation(ty);
          }
          scheduleOnRN(callbacks.onDragStart, id);
        })
        .onUpdate((event) => {
          'worklet';
          tx?.set(event.translationX);
          ty?.set(event.translationY);
        })
        .onEnd((event) => {
          'worklet';
          scheduleOnRN(
            callbacks.onDragEnd,
            id,
            event.translationX,
            event.translationY,
            event.velocityX,
            event.velocityY,
          );
        })
        .onFinalize((_event, success) => {
          'worklet';
          if (!success) {
            // Gesto cancelado: reset inmediato + limpieza del estado visual en JS
            tx?.set(0);
            ty?.set(0);
            if (callbacks.onDragCancel) {
              scheduleOnRN(callbacks.onDragCancel, id);
            }
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, enabled, callbacks.onDragStart, callbacks.onDragEnd, callbacks.onDragCancel, tx, ty],
  );
}
