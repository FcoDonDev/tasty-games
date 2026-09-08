/**
 * Métricas de performance gated por `EXPO_PUBLIC_PERF_METRICS=1` (inline en
 * build; default OFF → cero overhead: toda la API es no-op). Ver
 * PLAN-PERFORMANCE.md / ADR de métricas.
 *
 * Dos ejes de jank, deliberadamente separados (miden threads distintos):
 *  - `perfJsStall`: stalls del loop rAF del juego (JS thread).
 *  - `perfUiFrame`: frames perdidos de render (UI thread, usePerfFrameMonitor).
 */

type GameId = string;

interface TimerStats {
  count: number;
  sum: number;
  min: number;
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
  p95: number;
}

export interface PerfSnapshot {
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
  const stats = session.timers.get(key) ?? { count: 0, sum: 0, min: Infinity, samples: [] };
  stats.count += 1;
  stats.sum += ms;
  stats.min = Math.min(stats.min, ms);
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

/** Cierra la sesión: imprime resumen (count/avg/min/p95) y persiste snapshot
 * (solo web, escritura en idle, sobrescrita por sesión). La sesión queda en
 * memoria hasta el próximo begin. */
export function endPerfSession(gameId: GameId): void {
  const session = getSession(gameId);
  if (!session) return;
  latestSnapshots.set(gameId, snapshotOf(gameId, session));
  printSummary(gameId, session);
  persistSnapshot(gameId, session);
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

/** Duración de un render (React Profiler onRender). Solo acumula; el log va en el resumen. */
export function perfRenderReport(gameId: GameId, actualDurationMs: number): void {
  const session = getSession(gameId);
  if (!session) return;
  recordTimer(session, 'render.board', actualDurationMs);
}

/** Contador de renders por clave (pila/componente): verifica CA3. */
export function perfRenderCount(gameId: GameId, key: string): void {
  const session = getSession(gameId);
  if (!session) return;
  bumpCounter(session, `render:${key}`);
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

/** Frames de la UI thread (usePerfFrameMonitor): acumulado periódico. */
export function perfUiFrame(gameId: GameId, dropped: number, total: number): void {
  const session = getSession(gameId);
  if (!session) return;
  bumpCounter(session, 'uiFrames.dropped', dropped);
  bumpCounter(session, 'uiFrames.total', total);
}

function summarize(stats: TimerStats): PerfTimerSummary {
  const sorted = [...stats.samples].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  return { count: stats.count, avg: round(stats.sum / stats.count), min: round(stats.min), p95: round(p95) };
}

function printSummary(gameId: GameId, session: Session): void {
  const lines: string[] = [];
  for (const [key, stats] of session.timers) {
    const s = summarize(stats);
    lines.push(`${key}: count=${s.count} avg=${s.avg}ms min=${s.min}ms p95=${s.p95}ms`);
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
  return { startedAt: session.startedAt, endedAt: Date.now(), timers, counters };
}

function persistSnapshot(gameId: GameId, session: Session): void {
  const target = storage();
  if (!target) return;
  const snapshot = snapshotOf(gameId, session);
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
