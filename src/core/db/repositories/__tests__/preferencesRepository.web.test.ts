import { preferencesRepository } from '@/core/db/repositories/preferencesRepository.web';

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

describe('preferencesRepository.web', () => {
  beforeEach(() => {
    storage.clear();
    (globalThis as { localStorage?: unknown }).localStorage = localStorageStub;
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('set/get: round-trip por clave (claves reales del solitario)', async () => {
    await preferencesRepository.set('solitario.drawMode', '3');
    await preferencesRepository.set('solitario.undo', '1');
    await preferencesRepository.set('solitario.contentScale', '1.2');
    expect(await preferencesRepository.get('solitario.drawMode')).toBe('3');
    expect(await preferencesRepository.get('solitario.undo')).toBe('1');
    expect(await preferencesRepository.get('solitario.contentScale')).toBe('1.2');
    expect(await preferencesRepository.get('solitario.no-existe')).toBeNull();
  });

  it('set sobrescribe el valor previo de la misma clave', async () => {
    await preferencesRepository.set('solitario.contentScale', '0.85');
    await preferencesRepository.set('solitario.contentScale', '1');
    expect(await preferencesRepository.get('solitario.contentScale')).toBe('1');
  });

  it('las claves viven en un namespace común sin cruzarse', async () => {
    await preferencesRepository.set('solitario.drawMode', '1');
    await preferencesRepository.set('memorice.durationMs', '150');
    expect(await preferencesRepository.get('solitario.drawMode')).toBe('1');
    expect(await preferencesRepository.get('memorice.durationMs')).toBe('150');
    expect(await preferencesRepository.get('memorice.drawMode')).toBeNull();
  });

  it('get sobre almacenamiento vacío devuelve null', async () => {
    expect(await preferencesRepository.get('solitario.contentScale')).toBeNull();
  });

  it('opera sin localStorage (nativo, módulo cargado por error en web build)', async () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(await preferencesRepository.get('solitario.contentScale')).toBeNull();
    await expect(preferencesRepository.set('solitario.contentScale', '1')).resolves.toBeUndefined();
  });
});
