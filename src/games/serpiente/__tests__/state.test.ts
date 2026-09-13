import { useSerpienteStore, drainTickStats, setTickStatsEnabled } from '../engine/state';

function store(): ReturnType<typeof useSerpienteStore.getState> {
  return useSerpienteStore.getState();
}

beforeEach(() => {
  setTickStatsEnabled(false);
  drainTickStats();
  store().setWrap(true);
  store().startRun();
});

describe('store serpiente (T2)', () => {
  test('startRun normal: jugando, 4 segmentos, wrap del setting', () => {
    const { game, paused, wrap } = store();
    expect(game.status).toBe('playing');
    expect(game.snake).toHaveLength(4);
    expect(game.wrap).toBe(true);
    expect(paused).toBe(false);
    expect(wrap).toBe(true);
  });

  test('el sentinela manda en wrap (test-lose) y el tick mata', () => {
    store().startRun('test-lose');
    expect(store().game.wrap).toBe(false);
    const events = store().tick(140);
    expect(events).toEqual(['die']);
    expect(store().game.status).toBe('lost');
  });

  test('el wrap del usuario se conserva en runs normales', () => {
    store().setWrap(false);
    store().startRun();
    expect(store().game.wrap).toBe(false);
  });

  test('setWrap se aplica en vivo a la run en curso', () => {
    expect(store().game.wrap).toBe(true);
    store().setWrap(false);
    expect(store().wrap).toBe(false);
    expect(store().game.wrap).toBe(false);
  });

  test('tick sin pasos no publica (misma referencia)', () => {
    const before = store().game;
    expect(store().tick(0)).toEqual([]);
    expect(store().game).toBe(before);
  });

  test('dirección rechazada no publica (misma referencia)', () => {
    const before = store().game;
    store().setDirection('left'); // reversa de 'right' inicial
    expect(store().game).toBe(before);
  });

  test('dirección válida publica y el tick avanza', () => {
    store().setDirection('down');
    expect(store().game.queued).toEqual(['down']);
    store().tick(140);
    expect(store().game.dir).toBe('down');
  });

  test('pausa congela el tick y reanudar lo libera', () => {
    store().togglePause();
    expect(store().paused).toBe(true);
    const before = store().game;
    expect(store().tick(5000)).toEqual([]);
    expect(store().game).toBe(before);
    store().togglePause();
    store().tick(140);
    expect(store().game).not.toBe(before);
  });

  test('tickStats D-WW0: contadores y muestras acotadas', () => {
    setTickStatsEnabled(true);
    store().tick(140);
    store().tick(0);
    const drained = drainTickStats();
    expect(drained.tickCalls).toBe(2);
    expect(drained.tickPublished).toBe(1);
    // Se muestrea cada advance (publique o no, como en wakwak).
    expect(drained.advanceSamples).toHaveLength(2);
    // Drenar limpia.
    expect(drainTickStats()).toEqual({ advanceSamples: [], tickCalls: 0, tickPublished: 0 });
    setTickStatsEnabled(false);
  });

  test('apagado por defecto: cero overhead de stats', () => {
    store().tick(140);
    expect(drainTickStats()).toEqual({ advanceSamples: [], tickCalls: 0, tickPublished: 0 });
  });

  test('reset reinicia la run', () => {
    store().tick(5000);
    const score = store().game.score;
    expect(store().game.elapsedMs).toBeGreaterThan(0);
    store().reset();
    expect(store().game.elapsedMs).toBe(0);
    expect(store().game.score).toBe(0);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
