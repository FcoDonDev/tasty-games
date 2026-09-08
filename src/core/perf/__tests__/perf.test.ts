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
    perfUiFrame(GAME, 1, 10);
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
    perfUiFrame(GAME, 2, 100);
    endPerfSession(GAME);

    const snapshot = readPerfMetrics(GAME);
    expect(snapshot?.timers['audio.handlerToPlay']).toMatchObject({ count: 1 });
    expect(snapshot?.timers['render.board']).toMatchObject({ count: 1 });
    expect(snapshot?.timers['jsStall.dt']).toMatchObject({ count: 1 });
    expect(snapshot?.counters['render:pile:tableau-0']).toBe(2);
    expect(snapshot?.counters['render:pile:waste']).toBe(1);
    expect(snapshot?.counters['uiFrames.dropped']).toBe(2);
    expect(snapshot?.counters['uiFrames.total']).toBe(100);
  });

  it('el resumen imprime count/avg/min/p95 por métrica', () => {
    beginPerfSession(GAME);
    for (const ms of [10, 20, 30, 40, 100]) perfDragEvent(GAME, { handlerMs: ms });
    endPerfSession(GAME);

    const summaryLog = logSpy.mock.calls.find((call) => String(call[0]).includes('summary'));
    expect(summaryLog).toBeDefined();
    const text = String(summaryLog?.[0]);
    expect(text).toContain('drag.handler: count=5');
    expect(text).toContain('avg=40ms');
    expect(text).toContain('min=10ms');
    expect(text).toContain('p95=100ms');
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
    // floor(10 * 0.95) = 9 → el valor más alto
    expect(readPerfMetrics(GAME)?.timers['drag.handler'].p95).toBe(50);
  });
});
