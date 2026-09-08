import { TICK_MS } from '../engine/rules';
import { toIndex } from '../engine/maze';
import { useWakWakStore } from '../engine/state';

describe('state: store zustand', () => {
  beforeEach(() => {
    useWakWakStore.getState().reset();
  });

  it('reset sin seed: partida normal completa', () => {
    const { game } = useWakWakStore.getState();
    expect(game.status).toBe('playing');
    expect(game.totalEdibles).toBeGreaterThan(100);
    expect(game.seedLabel).toBe('default');
  });

  it('reset con seed sentinela aplica la configuración', () => {
    useWakWakStore.getState().reset('test-win');
    const { game } = useWakWakStore.getState();
    expect(game.seedLabel).toBe('__test_win__');
    expect(game.supers).toHaveLength(0);
    expect(game.totalEdibles).toBeLessThan(100);
  });

  it('tick avanza la simulación y devuelve eventos', () => {
    useWakWakStore.getState().setDirection('left');
    const events: string[] = [];
    for (let i = 0; i < 40; i++) {
      events.push(...useWakWakStore.getState().tick(TICK_MS * 2));
    }
    const { game } = useWakWakStore.getState();
    expect(game.elapsedMs).toBeGreaterThan(0);
    expect(game.score).toBeGreaterThan(0);
    expect(events).toContain('battery');
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

  it('setDirection sobre el spawn con muro arriba queda encolada', () => {
    useWakWakStore.getState().setDirection('up');
    const { game } = useWakWakStore.getState();
    expect(game.robot.dir).toBeNull();
    expect(game.robot.queued).toBe('up');
  });

  it('el robot del store arranca en el spawn y los drones en el corral', () => {
    const { game } = useWakWakStore.getState();
    expect(game.robot.cell).toBe(toIndex(15, 9));
    expect(game.drones).toHaveLength(4);
  });
});
