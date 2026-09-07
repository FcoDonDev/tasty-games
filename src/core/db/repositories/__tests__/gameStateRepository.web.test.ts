import { gameStateRepository } from '@/core/db/repositories/gameStateRepository.web';

const storage = new Map<string, string>();
const localStorageStub = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
};

describe('gameStateRepository.web', () => {
  beforeEach(() => {
    storage.clear();
    (globalThis as { localStorage?: unknown }).localStorage = localStorageStub;
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('set/get: round-trip por gameId', async () => {
    await gameStateRepository.set('solitario', '{"version":1}');
    await gameStateRepository.set('memorice', '{"version":2}');
    expect(await gameStateRepository.get('solitario')).toBe('{"version":1}');
    expect(await gameStateRepository.get('memorice')).toBe('{"version":2}');
    expect(await gameStateRepository.get('damas')).toBeNull();
  });

  it('set sobrescribe el estado previo del mismo juego', async () => {
    await gameStateRepository.set('solitario', 'a');
    await gameStateRepository.set('solitario', 'b');
    expect(await gameStateRepository.get('solitario')).toBe('b');
  });

  it('clear elimina solo el juego indicado', async () => {
    await gameStateRepository.set('solitario', 'a');
    await gameStateRepository.set('memorice', 'b');

    await gameStateRepository.clear('solitario');

    expect(await gameStateRepository.get('solitario')).toBeNull();
    expect(await gameStateRepository.get('memorice')).toBe('b');
  });

  it('get sobre almacenamiento vacío devuelve null', async () => {
    expect(await gameStateRepository.get('solitario')).toBeNull();
  });

  it('opera sin localStorage (nativo, módulo cargado por error en web build)', async () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(await gameStateRepository.get('solitario')).toBeNull();
    await expect(gameStateRepository.clear('solitario')).resolves.toBeUndefined();
  });
});
