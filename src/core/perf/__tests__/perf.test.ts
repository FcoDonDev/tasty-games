import {
  beginPerfSession,
  endPerfSession,
  perfAudio,
  perfDragEvent,
  perfJsStall,
  perfRenderCount,
  perfRenderReport,
  perfUiFrame,
  readPerfMetrics,
  setPerfEnabledForTests,
  setPerfStorageForTests,
} from '../index';

const GAME = 'solitario-test';

const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

const store = new Map<string, string>();
const storageAdapter = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
};

beforeAll(() => {
  setPerfStorageForTests(storageAdapter);
});

beforeEach(() => {
  store.clear();
  logSpy.mockClear();
  jest.useFakeTimers();
});

afterEach(() => {
  setPerfEnabledForTests(false);
  jest.useRealTimers();
});

afterAll(() => {
  setPerfStorageForTests(null);
});

describe('perf (gate apagado)', () => {
  it('toda la API es no-op y no imprime nada', () => {
    beginPerfSession(GAME);
    perfDragEvent(GAME, { handlerMs: 1 });
    perfAudio(GAME, { handlerToPlayMs: 1 });
    perfRenderReport(GAME, 1);
    perfRenderCount(GAME, 'pile:tableau-0');
    perfJsStall(GAME, 30);
    perfUiFrame(GAME, { longFrameEvents: 1, estimatedDroppedFrames: 2, total: 10, maxDtMs: 30 });
    endPerfSession(GAME);
    expect(logSpy).not.toHaveBeenCalled();
    expect(readPerfMetrics(GAME)).toBeNull();
  });
});

describe('perf (gate encendido)', () => {
  beforeEach(() => {
    setPerfEnabledForTests(true);
  });

  it('acumula métricas de drag (handler + ui2js opcional) y loguea por evento', () => {
    beginPerfSession(GAME);
    perfDragEvent(GAME, { handlerMs: 2 });
    perfDragEvent(GAME, { ui2jsMs: 5, handlerMs: 4 });
    endPerfSession(GAME);

    const dragLogs = logSpy.mock.calls.filter((call) => String(call[0]).includes(`][${GAME}] drag`));
    expect(dragLogs).toHaveLength(2);

    expect(readPerfMetrics(GAME)?.timers['drag.handler']).toMatchObject({ count: 2, avg: 3, min: 2 });
    expect(readPerfMetrics(GAME)?.timers['drag.ui2js']).toMatchObject({ count: 1, avg: 5, min: 5 });
  });

  it('acumula audio, render, stalls y contadores', () => {
    beginPerfSession(GAME);
    perfAudio(GAME, { handlerToPlayMs: 0.5 });
    perfRenderReport(GAME, 12);
    perfRenderCount(GAME, 'pile:tableau-0');
    perfRenderCount(GAME, 'pile:tableau-0');
    perfRenderCount(GAME, 'pile:waste');
    perfJsStall(GAME, 30);
    perfUiFrame(GAME, { longFrameEvents: 2, estimatedDroppedFrames: 3, total: 100, maxDtMs: 42 });
    endPerfSession(GAME);

    const snapshot = readPerfMetrics(GAME);
    expect(snapshot?.timers['audio.handlerToPlay']).toMatchObject({ count: 1 });
    expect(snapshot?.timers['render.board']).toMatchObject({ count: 1 });
    expect(snapshot?.timers['jsStall.dt']).toMatchObject({ count: 1 });
    expect(snapshot?.counters['render:pile:tableau-0']).toBe(2);
    expect(snapshot?.counters['render:pile:waste']).toBe(1);
    expect(snapshot?.counters['uiFrames.longFrameEvents']).toBe(2);
    expect(snapshot?.counters['uiFrames.estimatedDroppedFrames']).toBe(3);
    expect(snapshot?.counters['uiFrames.total']).toBe(100);
    // maxDt persistido como timer con semántica propia (peor dt del intervalo)
    expect(snapshot?.timers['uiFrame.maxDt']).toMatchObject({ count: 1, max: 42 });
  });

  it('el resumen imprime count/avg/min y percentiles por métrica', () => {
    beginPerfSession(GAME);
    for (const ms of [10, 20, 30, 40, 100]) perfDragEvent(GAME, { handlerMs: ms });
    endPerfSession(GAME);

    const summaryLog = logSpy.mock.calls.find((call) => String(call[0]).includes('summary'));
    expect(summaryLog).toBeDefined();
    const text = String(summaryLog?.[0]);
    expect(text).toContain('drag.handler: count=5');
    expect(text).toContain('avg=40ms');
    expect(text).toContain('min=10ms');
    // nearest-rank: p50 = ceil(0.5*5)-1 = 2 → 30
    expect(text).toContain('p50=30ms');
    expect(text).toContain('p95=100ms');
    expect(text).toContain('p99=100ms');
    expect(text).toContain('max=100ms');
  });

  it('beginPerfSession reinicia la sesión', () => {
    beginPerfSession(GAME);
    perfDragEvent(GAME, { handlerMs: 10 });
    beginPerfSession(GAME);
    perfDragEvent(GAME, { handlerMs: 2 });
    endPerfSession(GAME);
    expect(readPerfMetrics(GAME)?.timers['drag.handler']).toMatchObject({ count: 1, avg: 2 });
  });

  it('persiste el snapshot en idle (web) y sobrescribe por sesión', () => {
    beginPerfSession(GAME);
    perfDragEvent(GAME, { handlerMs: 3 });
    endPerfSession(GAME);
    jest.advanceTimersByTime(2100);
    const first = readPerfMetrics(GAME);
    expect(first?.timers['drag.handler']).toMatchObject({ count: 1 });

    beginPerfSession(GAME);
    perfDragEvent(GAME, { handlerMs: 7 });
    endPerfSession(GAME);
    jest.advanceTimersByTime(2100);
    expect(readPerfMetrics(GAME)?.timers['drag.handler']).toMatchObject({ count: 1, avg: 7 });
  });

  it('calcula p95 sobre muestras ordenadas', () => {
    beginPerfSession(GAME);
    for (const ms of [1, 2, 3, 4, 5, 6, 7, 8, 9, 50]) perfDragEvent(GAME, { handlerMs: ms });
    endPerfSession(GAME);
    // nearest-rank: ceil(10 * 0.95) - 1 = 9 → el valor más alto
    expect(readPerfMetrics(GAME)?.timers['drag.handler'].p95).toBe(50);
  });

  it('calcula p50/p95/p99/max (semántica de percentiles, PLAN §6)', () => {
    beginPerfSession(GAME);
    for (let ms = 1; ms <= 100; ms++) perfDragEvent(GAME, { handlerMs: ms });
    endPerfSession(GAME);
    const t = readPerfMetrics(GAME)?.timers['drag.handler'];
    expect(t).toMatchObject({ count: 100, min: 1, max: 100 });
    // n=100: p50 → ceil(50)-1 = índice 49 → 50; p95 → índice 94 → 95;
    // p99 → índice 98 → 99. p95 < max demuestra que el p99 no es el máximo.
    expect(t?.p50).toBe(50);
    expect(t?.p95).toBe(95);
    expect(t?.p99).toBe(99);
    expect(t?.max).toBe(100);
  });

  it('con muestras pequeñas los percentiles coinciden con min/max (edge cases)', () => {
    beginPerfSession(GAME);
    perfDragEvent(GAME, { handlerMs: 5 }); // n=1: p50=p95=p99=max
    endPerfSession(GAME);
    const single = readPerfMetrics(GAME)?.timers['drag.handler'];
    expect(single).toMatchObject({ count: 1, p50: 5, p95: 5, p99: 5, max: 5 });

    beginPerfSession(GAME);
    perfDragEvent(GAME, { handlerMs: 2 });
    perfDragEvent(GAME, { handlerMs: 9 });
    endPerfSession(GAME);
    const pair = readPerfMetrics(GAME)?.timers['drag.handler'];
    // n=2: p50 → ceil(1)-1=0 → 2; p95/p99 → ceil(1.9)-1=1 → 9
    expect(pair).toMatchObject({ p50: 2, p95: 9, p99: 9, max: 9 });
  });

  it('acota las muestras con buffer circular sin perder count/sum', () => {
    beginPerfSession(GAME);
    for (let i = 1; i <= 1000; i++) perfDragEvent(GAME, { handlerMs: i });
    endPerfSession(GAME);
    const t = readPerfMetrics(GAME)?.timers['drag.handler'];
    // count/sum/min/max se llevan la cuenta completa; solo el buffer de
    // muestras queda acotado (percentiles sobre las últimas ~512).
    expect(t?.count).toBe(1000);
    expect(t?.max).toBe(1000);
    expect(t?.min).toBe(1);
    // Buffer de 512: muestras 489..1000 (ordenadas). n=512:
    // p50 → ceil(256)-1=255 → 489+255=744; p95 → ceil(486.4)-1=486 → 975;
    // p99 → ceil(506.88)-1=506 → 995.
    expect(t?.p50).toBe(744);
    expect(t?.p95).toBe(975);
    expect(t?.p99).toBe(995);
  });

  it('endPerfSession libera la sesión mutable (el snapshot persiste)', () => {
    beginPerfSession(GAME);
    perfDragEvent(GAME, { handlerMs: 4 });
    endPerfSession(GAME);
    // El snapshot cerrado sigue legible (memoria + storage)
    expect(readPerfMetrics(GAME)?.timers['drag.handler']).toMatchObject({ count: 1, avg: 4 });
    // begin tras el cierre abre una sesión NUEVA (no reutiliza la anterior)
    beginPerfSession(GAME);
    endPerfSession(GAME);
    expect(readPerfMetrics(GAME)?.timers['drag.handler']).toBeUndefined();
  });
});
