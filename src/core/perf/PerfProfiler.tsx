import { Profiler, type ReactNode } from 'react';
import { isPerfEnabled, perfRenderReport } from './index';

interface PerfProfilerProps {
  gameId: string;
  /** id del subtree para el onRender de React Profiler (ej: "board"). */
  id: string;
  children: ReactNode;
}

/**
 * Wrapper estable de React Profiler: con el gate apagado (`EXPO_PUBLIC_PERF_
 * METRICS` inline en build) devuelve los children directos, sin montar el
 * Profiler — cero overhead de profiling en release. El gate se evalúa a nivel
 * de build, así que la rama es constante y no hay hooks condicionales.
 */
export function PerfProfiler({ gameId, id, children }: PerfProfilerProps): ReactNode {
  if (!isPerfEnabled()) return children;
  return (
    <Profiler
      id={id}
      onRender={(_id, _phase, actualDuration) => {
        perfRenderReport(gameId, actualDuration);
      }}
    >
      {children}
    </Profiler>
  );
}
