import type { GameResult } from '@/core/types';
import { recordsRepository } from '@/core/db/repositories/recordsRepository.web';

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

function result(gameId: string, score: number, won = true): GameResult {
  return {
    gameId,
    won,
    score,
    durationMs: 1000,
    finishedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('recordsRepository.web', () => {
  beforeEach(() => {
    storage.clear();
    (globalThis as { localStorage?: unknown }).localStorage = localStorageStub;
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('save + bestFor: devuelve el récord ganador con mayor score', async () => {
    await recordsRepository.save(result('memorice', 80));
    await recordsRepository.save(result('memorice', 95));
    await recordsRepository.save(result('memorice', 10, false)); // derrota: no compite
    const best = await recordsRepository.bestFor('memorice');
    expect(best?.score).toBe(95);
    expect(await recordsRepository.bestFor('solitario')).toBeNull();
  });

  it('clearAll elimina todos los récords', async () => {
    await recordsRepository.save(result('memorice', 80));
    await recordsRepository.save(result('solitario', 300));
    expect(await recordsRepository.bestFor('memorice')).not.toBeNull();

    await recordsRepository.clearAll();

    expect(await recordsRepository.bestFor('memorice')).toBeNull();
    expect(await recordsRepository.bestFor('solitario')).toBeNull();
    expect(localStorage.getItem('game_records')).toBeNull();
  });

  it('clearAll sobre almacenamiento vacío no falla', async () => {
    await expect(recordsRepository.clearAll()).resolves.toBeUndefined();
  });

  it('opera sin localStorage (nativo, módulo cargado por error en web build)', async () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    await expect(recordsRepository.clearAll()).resolves.toBeUndefined();
    expect(await recordsRepository.bestFor('memorice')).toBeNull();
  });
});
