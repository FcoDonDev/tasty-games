import { useEffect } from 'react';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { isPerfEnabled, perfUiFrame } from './index';

const FLUSH_INTERVAL_MS = 5000;

/**
 * Monitor de FPS de la UI thread: cuenta frames por encima del presupuesto
 * (drop). Solo hace trabajo si el gate está activo — el callback ni siquiera
 * arranca (`useFrameCallback(cb, false)`), y el flush es un read de shared
 * values una vez cada FLUSH_INTERVAL_MS y al desmontar.
 */
export function usePerfFrameMonitor(gameId: string, budgetMs = 20): void {
  const dropped = useSharedValue(0);
  const total = useSharedValue(0);
  const active = isPerfEnabled();

  useFrameCallback(
    (info) => {
      total.value += 1;
      const dt = info.timeSincePreviousFrame;
      if (dt !== null && dt > budgetMs) dropped.value += 1;
    },
    active,
  );

  useEffect(() => {
    if (!active) return;
    const flush = () => {
      perfUiFrame(gameId, dropped.get(), total.get());
      dropped.set(0);
      total.set(0);
    };
    const interval = setInterval(flush, FLUSH_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      flush();
    };
  }, [active, gameId, dropped, total]);
}
