import { useEffect, useMemo } from 'react';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { isPerfEnabled, perfUiFrame } from './index';

const FLUSH_INTERVAL_MS = 5000;

interface FrameInfo {
  timeSincePreviousFrame: number | null;
}

/**
 * Monitor de FPS de la UI thread. Semántica separada (PLAN-PERFORMANCE §8):
 *  - `total`: frames medidos (dt !== null).
 *  - `longFrameEvents`: dt > presupuesto (frame largo ≠ frame perdido).
 *  - `estimatedDroppedFrames`: floor(dt/budget) por frame largo (estimación).
 *  - `maxDt`: peor dt del intervalo (persistido como timer `uiFrame.maxDt`).
 *
 * El callback está memoizado (identidad estable): `useFrameCallback` no
 * re-registra el worklet en renders ordinarios. El presupuesto es shared
 * value para poder leerlo desde el worklet sin cruzar runtimes. Solo hace
 * trabajo si el gate está activo — con gate apagado el callback no arranca
 * (`useFrameCallback(cb, false)`) y el flush ni se agenda.
 *
 * Presupuesto: paramétrico en ms (default 20 ≈ 50 fps). El llamante puede
 * ajustarlo por refresh rate del dispositivo (60/120 Hz quedan explícitos
 * como limitación conocida; ver PLAN-PERFORMANCE §8).
 */
export function usePerfFrameMonitor(gameId: string, budgetMs = 20): void {
  const active = isPerfEnabled();
  const budget = useSharedValue(budgetMs);
  const total = useSharedValue(0);
  const longFrames = useSharedValue(0);
  const dropped = useSharedValue(0);
  const maxDt = useSharedValue(0);

  // Memoizado: captura solo shared values (estables), así el worklet no se
  // vuelve a registrar en renders ordinarios.
  const onFrame = useMemo(
    () => (info: FrameInfo) => {
      'worklet';
      const dt = info.timeSincePreviousFrame;
      if (dt === null) return;
      total.value += 1;
      if (dt > maxDt.value) maxDt.value = dt;
      if (dt > budget.value) {
        longFrames.value += 1;
        dropped.value += Math.floor(dt / budget.value);
      }
    },
    [budget, total, longFrames, dropped, maxDt],
  );

  // El hook SIEMPRE se llama; con gate off `active=false` y el callback no corre.
  useFrameCallback(onFrame, active);

  useEffect(() => {
    if (!active) return undefined;
    const flush = () => {
      perfUiFrame(gameId, {
        longFrameEvents: longFrames.get(),
        estimatedDroppedFrames: dropped.get(),
        total: total.get(),
        maxDtMs: maxDt.get(),
      });
      longFrames.set(0);
      dropped.set(0);
      total.set(0);
      maxDt.set(0);
    };
    const interval = setInterval(flush, FLUSH_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      flush();
    };
  }, [active, gameId, budget, longFrames, dropped, total, maxDt]);
}
