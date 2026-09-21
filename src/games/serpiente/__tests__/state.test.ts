import { useSerpienteStore, drainTickStats, getStepProgress, setTickStatsEnabled } from '../engine/state';

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
    expect(events).toEqual([{ type: 'die', cause: 'wall', cell: null }]);
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

  test('acumula fracciones entre frames (regresión: loop de 16 ms)', () => {
    const before = store().game;
    // 8×16 = 128 < 140: sin pasos ni publicación.
    for (let i = 0; i < 8; i++) {
      expect(store().tick(16)).toEqual([]);
      expect(store().game).toBe(before);
    }
    // 9×16 = 144 ≥ 140: avanza un paso (cabeza a la derecha) y publica.
    store().tick(16);
    expect(store().game).not.toBe(before);
    expect(store().game.snake[0]).toBe(10 * 20 + 11);
    expect(store().game.elapsedMs).toBe(140);
  });

  test('cadencia nominal exacta (regresión: el sobrante no se cuenta doble, D21)', () => {
    // Ciclos de 150 ms (10 de sobrante por paso de 140): 10 ticks → 10 pasos.
    // Con el bug pre-D21 el sobrante se sumaba dos veces (state.remainderMs +
    // acumulador) y la serpiente corría cada vez más rápido que D2.
    for (let i = 0; i < 10; i++) store().tick(150);
    expect(store().game.elapsedMs).toBe(10 * 140);
  });

  test('getStepProgress: fracción del paso en curso (D20)', () => {
    expect(getStepProgress()).toBe(0);
    // Mitad del paso (70/140): progreso 0.5, sin publish (estado intacto).
    store().tick(70);
    expect(store().game.elapsedMs).toBe(0);
    expect(getStepProgress()).toBeCloseTo(0.5);
    // Completa el paso: el sobrante vuelve a ~0.
    store().tick(70);
    expect(store().game.elapsedMs).toBe(140);
    expect(getStepProgress()).toBeLessThan(0.01);
    // Pausado: 0 (la interpolación no debe correr congelada).
    store().tick(70);
    store().togglePause();
    expect(getStepProgress()).toBe(0);
    store().togglePause();
  });

  test('pausar descarta el acumulado (sin tormenta al reanudar)', () => {
    store().tick(100);
    const before = store().game;
    store().togglePause();
    store().tick(5000);
    store().togglePause();
    expect(store().game).toBe(before);
    // Los 100 ms previos no cuentan: 50 ms no alcanzan el paso.
    store().tick(50);
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

  test('setDifficulty a mitad de partida reinicia con la nueva tabla (D5)', () => {
    store().tick(5000);
    expect(store().game.elapsedMs).toBeGreaterThan(0);
    store().setDifficulty('dificil');
    expect(store().difficulty).toBe('dificil');
    // Run nueva: estado fresco con la dificultad aplicada.
    expect(store().game.status).toBe('playing');
    expect(store().game.difficulty).toBe('dificil');
    expect(store().game.elapsedMs).toBe(0);
    expect(store().game.snake).toHaveLength(4);
    // La nueva cadencia es la de difícil (110ms: 109 no avanza, 110 sí).
    const after = store().game;
    expect(store().tick(109)).toEqual([]);
    expect(store().game).toBe(after);
    store().tick(110);
    expect(store().game).not.toBe(after);
  });

  test('setDifficulty sin run activa solo fija el setting', () => {
    store().tick(5000);
    store().reset('test-lose'); // muere en el primer tick → status lost
    store().tick(140);
    expect(store().game.status).toBe('lost');
    store().setDifficulty('facil');
    expect(store().difficulty).toBe('facil');
    // NO reinicia: el juego sigue terminado y conserva su dificultad.
    expect(store().game.status).toBe('lost');
    expect(store().game.difficulty).toBe('medio');
  });

  test('la dificultad del setting no pisa al sentinela (test-crecer sigue en medio)', () => {
    store().setDifficulty('dificil');
    store().startRun('test-crecer');
    // El sentinela fija 'medio' explícito: manda sobre el setting.
    expect(store().game.difficulty).toBe('medio');
  });

  test('el parámetro de URL manda sobre el config del sentinela (E2E)', () => {
    store().startRun('test-crecer', 'dificil');
    expect(store().game.difficulty).toBe('dificil');
    // Y sobre el setting del usuario en runs normales.
    store().setDifficulty('medio');
    store().startRun(undefined, 'facil');
    expect(store().game.difficulty).toBe('facil');
  });

  test('startRun sin parámetros conserva el setting de dificultad', () => {
    store().setDifficulty('facil');
    store().startRun();
    expect(store().game.difficulty).toBe('facil');
  });
});
