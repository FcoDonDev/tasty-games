import { initialBoard, parseSetupSeed, TEST_CAPTURE_SEED, TEST_WIN_SEED } from '../engine/board';
import { useDamasStore } from '../engine/state';

describe('state: damas', () => {
  beforeEach(() => {
    useDamasStore.getState().reset();
  });

  it('estado inicial: reparto estándar, turno del jugador 1', () => {
    const s = useDamasStore.getState();
    expect(s.board).toEqual(initialBoard());
    expect(s.turn).toBe(1);
    expect(s.moves).toBe(0);
    expect(s.startedAt).toBeNull();
    expect(s.finishedAt).toBeNull();
    expect(s.winner).toBeNull();
  });

  it('reset con seed sentinel carga tableros de test', () => {
    useDamasStore.getState().reset(parseSetupSeed('test-capture'));
    expect(useDamasStore.getState().board[42]?.id).toBe('1-a');

    useDamasStore.getState().reset(TEST_WIN_SEED);
    expect(useDamasStore.getState().board[35]?.player).toBe(2);
  });

  it('applyMove legal: mueve, quita la capturada y alterna el turno', () => {
    useDamasStore.getState().reset(TEST_CAPTURE_SEED);
    const moved = useDamasStore.getState().applyMove({ from: 42, path: [28], captured: [35] });
    expect(moved).toBe(true);
    const s = useDamasStore.getState();
    expect(s.board[28]?.id).toBe('1-a');
    expect(s.board[42]).toBeNull();
    expect(s.board[35]).toBeNull();
    expect(s.turn).toBe(2);
    expect(s.moves).toBe(1);
    expect(s.startedAt).not.toBeNull();
    expect(s.finishedAt).toBeNull();
  });

  it('applyMove rechaza movimiento silencioso cuando la captura es obligatoria', () => {
    useDamasStore.getState().reset(TEST_CAPTURE_SEED);
    const before = useDamasStore.getState();
    const moved = useDamasStore.getState().applyMove({ from: 44, path: [37], captured: [] });
    expect(moved).toBe(false);
    const after = useDamasStore.getState();
    expect(after.board).toEqual(before.board);
    expect(after.moves).toBe(0);
    expect(after.turn).toBe(1);
  });

  it('applyMove rechaza ficha del bando contrario o casilla vacía', () => {
    useDamasStore.getState().reset(TEST_CAPTURE_SEED);
    expect(useDamasStore.getState().applyMove({ from: 24, path: [33], captured: [] })).toBe(false);
    expect(useDamasStore.getState().applyMove({ from: 51, path: [42], captured: [] })).toBe(false);
  });

  it('declara ganador cuando el rival se queda sin fichas', () => {
    useDamasStore.getState().reset(TEST_WIN_SEED);
    const moved = useDamasStore.getState().applyMove({ from: 42, path: [28], captured: [35] });
    expect(moved).toBe(true);
    const s = useDamasStore.getState();
    expect(s.finishedAt).not.toBeNull();
    expect(s.winner).toBe(1);
    expect(s.moves).toBe(1);
  });

  it('no acepta movimientos tras terminar la partida', () => {
    useDamasStore.getState().reset(TEST_WIN_SEED);
    useDamasStore.getState().applyMove({ from: 42, path: [28], captured: [35] });
    const before = useDamasStore.getState();
    expect(useDamasStore.getState().applyMove({ from: 28, path: [19], captured: [] })).toBe(false);
    expect(useDamasStore.getState().board).toEqual(before.board);
  });

  it('reset limpia el fin de partida', () => {
    useDamasStore.getState().reset(TEST_WIN_SEED);
    useDamasStore.getState().applyMove({ from: 42, path: [28], captured: [35] });
    useDamasStore.getState().reset();
    const s = useDamasStore.getState();
    expect(s.finishedAt).toBeNull();
    expect(s.winner).toBeNull();
    expect(s.turn).toBe(1);
    expect(s.board).toEqual(initialBoard());
  });
});
