import { TICK_MS, type GameEvent } from '../engine/rules';
import { toIndex } from '../engine/maze';
import { MAX_LEVEL } from '../engine/levels';
import { useWakWakStore } from '../engine/state';

describe('state: store zustand', () => {
  beforeEach(() => {
    useWakWakStore.getState().reset();
  });

  it('reset sin seed: partida normal completa en el nivel 1', () => {
    const { game } = useWakWakStore.getState();
    expect(game.status).toBe('playing');
    expect(game.level).toBe(1);
    expect(game.totalEdibles).toBeGreaterThan(100);
    expect(game.seedLabel).toBe('default');
  });

  it('reset con seed sentinela aplica la configuración (nivel fijado por el sentinela)', () => {
    useWakWakStore.getState().reset('test-win');
    const { game, runLevel } = useWakWakStore.getState();
    expect(game.seedLabel).toBe('__test_win__');
    expect(game.level).toBe(8);
    expect(runLevel).toBe(8);
    expect(game.supers).toHaveLength(0);
    expect(game.totalEdibles).toBeLessThan(100);
  });

  it('tick avanza la simulación y devuelve eventos', () => {
    useWakWakStore.getState().setDirection('left');
    const events: GameEvent[] = [];
    for (let i = 0; i < 40; i++) {
      events.push(...useWakWakStore.getState().tick(TICK_MS * 2));
    }
    const { game } = useWakWakStore.getState();
    expect(game.elapsedMs).toBeGreaterThan(0);
    expect(game.score).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'battery')).toBe(true);
  });

  it('tick con pausa no simula', () => {
    const store = useWakWakStore.getState();
    store.setDirection('left');
    store.togglePause();
    expect(useWakWakStore.getState().paused).toBe(true);
    const events = useWakWakStore.getState().tick(TICK_MS * 60);
    expect(events).toHaveLength(0);
    expect(useWakWakStore.getState().game.elapsedMs).toBe(0);
    useWakWakStore.getState().togglePause();
    expect(useWakWakStore.getState().paused).toBe(false);
  });

  it('tick no simula una partida terminada', () => {
    useWakWakStore.getState().reset('test-lose');
    // forzar estado perdido
    useWakWakStore.setState((s) => ({ game: { ...s.game, status: 'lost', lives: 0 } }));
    const events = useWakWakStore.getState().tick(TICK_MS * 60);
    expect(events).toHaveLength(0);
  });

  it('setDirection encola y la reversa es inmediata', () => {
    const store = useWakWakStore.getState();
    store.setDirection('left');
    expect(useWakWakStore.getState().game.robot.dir).toBe('left');
    useWakWakStore.getState().setDirection('right');
    expect(useWakWakStore.getState().game.robot.dir).toBe('right');
  });

  it('setDirection sobre el spawn con muro abajo queda encolada', () => {
    useWakWakStore.getState().setDirection('down');
    const { game } = useWakWakStore.getState();
    expect(game.robot.dir).toBeNull();
    expect(game.robot.queued).toEqual(['down']);
  });

  it('el robot del store arranca en el spawn y los drones en el corral', () => {
    const { game } = useWakWakStore.getState();
    expect(game.robot.cell).toBe(toIndex(15, 9));
    expect(game.drones).toHaveLength(4);
  });
});

describe('state: run continua de niveles', () => {
  beforeEach(() => {
    useWakWakStore.getState().reset();
  });

  it('startRun clampea el nivel al rango válido', () => {
    useWakWakStore.getState().startRun(99);
    expect(useWakWakStore.getState().runLevel).toBe(MAX_LEVEL);
    useWakWakStore.getState().startRun(-3);
    expect(useWakWakStore.getState().runLevel).toBe(1);
  });

  it('advanceLevel: conserva score, suma una vida (cap 5) y reinicia la partida', () => {
    const store = useWakWakStore.getState();
    store.startRun(1);
    // forzar estado ganado con score/vidas conocidos y cadena alta
    useWakWakStore.setState((s) => ({
      game: { ...s.game, status: 'won', score: 1234, lives: 3, chain: 2, bestChain: 2, powerUntil: 1234 },
    }));
    store.advanceLevel();
    const { game, runLevel } = useWakWakStore.getState();
    expect(runLevel).toBe(2);
    expect(game.level).toBe(2);
    expect(game.score).toBe(1234);
    expect(game.lives).toBe(4);
    expect(game.status).toBe('playing');
    expect(game.chain).toBe(0);
    expect(game.powerUntil).toBeNull();
    expect(game.eaten).toBe(0);
    expect(game.robot.cell).toBe(toIndex(15, 9));
  });

  it('advanceLevel: cap de vidas en 5', () => {
    const store = useWakWakStore.getState();
    store.startRun(4);
    useWakWakStore.setState((s) => ({ game: { ...s.game, status: 'won', lives: 5 } }));
    store.advanceLevel();
    expect(useWakWakStore.getState().game.lives).toBe(5);
  });

  it('advanceLevel no aplica fuera de un nivel ganado ni en el último nivel', () => {
    const store = useWakWakStore.getState();
    store.startRun(1);
    const before = useWakWakStore.getState().game;
    store.advanceLevel(); // status playing: no-op
    expect(useWakWakStore.getState().game).toBe(before);

    store.startRun(MAX_LEVEL);
    useWakWakStore.setState((s) => ({ game: { ...s.game, status: 'won' } }));
    store.advanceLevel();
    expect(useWakWakStore.getState().runLevel).toBe(MAX_LEVEL);
    expect(useWakWakStore.getState().game.status).toBe('won');
  });

  it('cada nivel de la run usa un stream RNG distinto (determinismo por nivel)', () => {
    const store = useWakWakStore.getState();
    store.startRun(1);
    const seed1 = useWakWakStore.getState().game.rng();
    store.startRun(1);
    useWakWakStore.setState((s) => ({ game: { ...s.game, status: 'won' } }));
    store.advanceLevel();
    const seed2 = useWakWakStore.getState().game.rng();
    // el nivel 2 deriva del MISMO seed base: repetible entre runs
    store.startRun(1);
    useWakWakStore.setState((s) => ({ game: { ...s.game, status: 'won' } }));
    store.advanceLevel();
    expect(useWakWakStore.getState().game.rng()).toBe(seed2);
    expect(seed2).not.toBe(seed1);
  });
});
