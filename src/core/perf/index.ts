/**
 * Métricas de performance gated por `EXPO_PUBLIC_PERF_METRICS=1` (inline en
 * build; default OFF → cero overhead: toda la API es no-op). Ver
 * PLAN-PERFORMANCE.md / ADR de métricas.
 *
 * Ejes de jank, deliberadamente separados (miden threads/contextos distintos):
 *  - `perfJsStall`: stalls del loop rAF del juego (JS thread).
 *  - `perfUiFrame`: frames de la UI thread (usePerfFrameMonitor) con semántica
 *    separada de frame largo vs frame omitido estimado.
 *  - `perfDragEvent`: latencia UI→JS y handler JS, mediciones separadas.
 *
 * Los percentiles usan nearest-rank sobre las últimas MAX_SAMPLES_PER_TIMER
 * muestras (buffer circular; PLAN-PERFORMANCE §6/§8).
 */

type GameId = string;

import { persistNativeSnapshot } from './snapshotSink';

/** Versión del schema de snapshot (PLAN-PERFORMANCE §6): cambiar si el formato
 * de PerfSnapshot/PerfTimerSummary se vuelve incompatible. */
export const PERF_SCHEMA_VERSION = 1;

/**
 * Acotación de muestras por timer (PLAN-PERFORMANCE §6): buffer circular con
 * las últimas N muestras. Determinista (sin reservoir aleatorio); una sesión
 * larga no puede crecer en memoria indefinidamente.
 */
const MAX_SAMPLES_PER_TIMER = 512;

interface TimerStats {
  count: number;
  sum: number;
  min: number;
  max: number;
  /** Últimas MAX_SAMPLES_PER_TIMER muestras, orden de llegada. */
  samples: number[];
}

interface Session {
  startedAt: number;
  timers: Map<string, TimerStats>;
  counters: Map<string, number>;
}

export interface PerfTimerSummary {
  count: number;
  avg: number;
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface PerfSnapshot {
  schemaVersion: number;
  startedAt: number;
  endedAt: number;
  timers: Record<string, PerfTimerSummary>;
  counters: Record<string, number>;
}

// Gate evaluado a variable (no const) para poder alternarlo en tests.
let enabled = process.env.EXPO_PUBLIC_PERF_METRICS === '1';

export function isPerfEnabled(): boolean {
  return enabled;
}

/** Exclusivo de tests: alterna el gate en runtime. */
export function setPerfEnabledForTests(value: boolean): void {
  enabled = value;
}

const IS_WEB = (): boolean => process.env.EXPO_OS === 'web';

/**
 * Punto de inyección para tests: babel-preset-expo inlinea `process.env.EXPO_OS`
 * (el check de plataforma es constante en cada build), así que en Jest no se
 * puede simular web por env. Los tests inyectan un storage adapter y el check
 * de producción queda intacto.
 */
let storageOverride: Pick<Storage, 'getItem' | 'setItem'> | null = null;

export function setPerfStorageForTests(storage: Pick<Storage, 'getItem' | 'setItem'> | null): void {
  storageOverride = storage;
}

function storage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  if (storageOverride) return storageOverride;
  return IS_WEB() && typeof localStorage !== 'undefined' ? localStorage : null;
}
const round = (n: number): number => Math.round(n * 100) / 100;

const sessions = new Map<GameId, Session>();
/** Último snapshot cerrado por juego: lectura inmediata sin esperar al write en idle. */
const latestSnapshots = new Map<GameId, PerfSnapshot>();

function getSession(gameId: GameId): Session | null {
  return enabled ? (sessions.get(gameId) ?? null) : null;
}

function recordTimer(session: Session, key: string, ms: number): void {
  const stats = session.timers.get(key) ?? { count: 0, sum: 0, min: Infinity, max: 0, samples: [] };
  stats.count += 1;
  stats.sum += ms;
  stats.min = Math.min(stats.min, ms);
  stats.max = Math.max(stats.max, ms);
  // Buffer circular: si excede el tope, descarta la más vieja.
  if (stats.samples.length >= MAX_SAMPLES_PER_TIMER) stats.samples.shift();
  stats.samples.push(ms);
  session.timers.set(key, stats);
}

function bumpCounter(session: Session, key: string, by = 1): void {
  session.counters.set(key, (session.counters.get(key) ?? 0) + by);
}

/** Abre/reinicia la sesión de métricas de un juego (al montar su pantalla). */
export function beginPerfSession(gameId: GameId): void {
  if (!enabled) return;
  sessions.set(gameId, { startedAt: Date.now(), timers: new Map(), counters: new Map() });
}

/** Cierra la sesión: imprime resumen y persiste snapshot (solo web, escritura
 * en idle, sobrescrita por sesión). La sesión mutable se libera; el último
 * snapshot queda en memoria hasta el próximo begin. */
export function endPerfSession(gameId: GameId): void {
  const session = getSession(gameId);
  if (!session) return;
  latestSnapshots.set(gameId, snapshotOf(gameId, session));
  printSummary(gameId, session);
  persistSnapshot(gameId, session);
  // Liberar la sesión mutable: samples/timers no deben sobrevivir al cierre
  // (PLAN-PERFORMANCE §6: al cerrar se conserva el snapshot y se libera la
  // sesión para medir memoria de la app, no del harness).
  sessions.delete(gameId);
}

export function perfDragEvent(
  gameId: GameId,
  data: { ui2jsMs?: number; handlerMs: number },
): void {
  const session = getSession(gameId);
  if (!session) return;
  recordTimer(session, 'drag.handler', data.handlerMs);
  if (data.ui2jsMs !== undefined) recordTimer(session, 'drag.ui2js', data.ui2jsMs);
  const parts = [`handler=${data.handlerMs.toFixed(2)}ms`];
  if (data.ui2jsMs !== undefined) parts.unshift(`ui2js=${data.ui2jsMs.toFixed(2)}ms`);
  console.log(`[perf][${gameId}] drag ${parts.join(' ')}`);
}

export function perfAudio(gameId: GameId, data: { handlerToPlayMs: number }): void {
  const session = getSession(gameId);
  if (!session) return;
  recordTimer(session, 'audio.handlerToPlay', data.handlerToPlayMs);
  console.log(`[perf][${gameId}] audio handlerToPlay=${data.handlerToPlayMs.toFixed(2)}ms`);
}

/**
 * Duración de un render (React Profiler onRender). ATENCIÓN (PLAN-PERFORMANCE
 * §19): React desactiva la instrumentación de Profiler en el build de
 * producción ESTÁNDAR — en ese perfil este timer no aparece. Existe solo en
 * builds con profiling (variante de medición con overhead, no representativa
 * del UX real). En el build instrumentado estándar la métrica de render es la
 * FRECUENCIA (perfRenderCount → `renderFreq:*`).
 */
export function perfRenderReport(gameId: GameId, actualDurationMs: number): void {
  const session = getSession(gameId);
  if (!session) return;
  recordTimer(session, 'render.board', actualDurationMs);
}

/**
 * Frecuencia de renders por clave (ej: `renderFreq:piece:1-1`): CUÁNTAS veces
 * se renderizó el componente por sesión — NO su duración. El llamante aporta
 * el key completo. `render.board` (duración, via perfRenderReport/React
 * Profiler) solo existe en builds con profiling de React; en el build
 * instrumentado estándar esta es la métrica de render disponible.
 * (PLAN-PERFORMANCE §19: semántica de frecuencia ≠ performance de render.)
 */
export function perfRenderCount(gameId: GameId, key: string): void {
  const session = getSession(gameId);
  if (!session) return;
  bumpCounter(session, key);
}

/**
 * Stall del loop rAF del juego (JS thread): el llamante decide cuándo hay stall
 * (dt por encima del presupuesto) y reporta el dt.
 */
export function perfJsStall(gameId: GameId, dtMs: number): void {
  const session = getSession(gameId);
  if (!session) return;
  recordTimer(session, 'jsStall.dt', dtMs);
  bumpCounter(session, 'jsStall.count');
}

/** Frames de la UI thread (usePerfFrameMonitor), semántica separada
 * (PLAN-PERFORMANCE §8): `longFrameEvents` = frames con dt por encima del
 * presupuesto; `estimatedDroppedFrames` = estimación de frames omitidos
 * (floor(dt/budget)); `total` = frames medidos; `maxDtMs` = peor dt del
 * intervalo de flush (se guarda como muestra de `uiFrame.maxDt`).
 * `dt > budget` NO equivale a frame perdido: por eso ambos contadores viven
 * separados y la conversión a frames omitidos queda explícita. */
export function perfUiFrame(
  gameId: GameId,
  data: {
    longFrameEvents: number;
    estimatedDroppedFrames: number;
    total: number;
    maxDtMs: number;
  },
): void {
  const session = getSession(gameId);
  if (!session) return;
  bumpCounter(session, 'uiFrames.longFrameEvents', data.longFrameEvents);
  bumpCounter(session, 'uiFrames.estimatedDroppedFrames', data.estimatedDroppedFrames);
  bumpCounter(session, 'uiFrames.total', data.total);
  if (data.maxDtMs > 0) recordTimer(session, 'uiFrame.maxDt', data.maxDtMs);
}

/** Percentil nearest-rank sobre muestras ordenadas: `ceil(p * n) - 1`.
 * Para muestras pequeñas coincide con el min/max según p. */
function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

function summarize(stats: TimerStats): PerfTimerSummary {
  const sorted = [...stats.samples].sort((a, b) => a - b);
  return {
    count: stats.count,
    avg: round(stats.sum / stats.count),
    min: round(stats.min),
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    p99: round(percentile(sorted, 0.99)),
    max: round(stats.max),
  };
}

function printSummary(gameId: GameId, session: Session): void {
  const lines: string[] = [];
  for (const [key, stats] of session.timers) {
    const s = summarize(stats);
    lines.push(
      `${key}: count=${s.count} avg=${s.avg}ms min=${s.min}ms p50=${s.p50}ms p95=${s.p95}ms p99=${s.p99}ms max=${s.max}ms`,
    );
  }
  for (const [key, value] of session.counters) {
    lines.push(`${key}: ${value}`);
  }
  const elapsed = ((Date.now() - session.startedAt) / 1000).toFixed(1);
  console.log(`[perf][${gameId}] summary (${elapsed}s)\n  ${lines.join('\n  ')}`);
}

function snapshotOf(gameId: GameId, session: Session): PerfSnapshot {
  const timers: Record<string, PerfTimerSummary> = {};
  for (const [key, stats] of session.timers) timers[key] = summarize(stats);
  const counters: Record<string, number> = {};
  for (const [key, value] of session.counters) counters[key] = value;
  return { schemaVersion: PERF_SCHEMA_VERSION, startedAt: session.startedAt, endedAt: Date.now(), timers, counters };
}

function persistSnapshot(gameId: GameId, session: Session): void {
  const snapshot = snapshotOf(gameId, session);
  const target = storage();
  if (!target) {
    // Nativo: archivo en Documents + fallback logcat (snapshotSink.ts;
    // Metro resuelve snapshotSink.web.ts — no-op — en web).
    persistNativeSnapshot(gameId, JSON.stringify(snapshot), snapshot.startedAt);
    return;
  }
  const write = () => {
    try {
      target.setItem(`perf-metrics-${gameId}`, JSON.stringify(snapshot));
    } catch {
      // Almacenamiento lleno/deshabilitado: las métricas no son críticas.
    }
  };
  const idle = typeof requestIdleCallback === 'function' ? requestIdleCallback : null;
  if (idle) idle(() => write(), { timeout: 2000 });
  else setTimeout(write, 50);
}

/** Lee el último snapshot (sesión en memoria; tras recargar, el de localStorage).
 * Dev-only: null si el gate está off. */
export function readPerfMetrics(gameId: GameId): PerfSnapshot | null {
  if (!enabled) return null;
  const latest = latestSnapshots.get(gameId);
  if (latest) return latest;
  const source = storage();
  if (!source) return null;
  try {
    const raw = source.getItem(`perf-metrics-${gameId}`);
    return raw ? (JSON.parse(raw) as PerfSnapshot) : null;
  } catch {
    return null;
  }
}
