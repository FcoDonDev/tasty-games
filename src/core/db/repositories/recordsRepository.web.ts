import type { GameResult } from '@/core/types';

const STORAGE_KEY = 'game_records';

interface StoredRecord {
  gameId: string;
  won: boolean;
  score?: number;
  durationMs: number;
  finishedAt: string;
}

function readAll(): StoredRecord[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as StoredRecord[]) : [];
}

function writeAll(records: StoredRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export const recordsRepository = {
  async save(result: GameResult): Promise<void> {
    const records = readAll();
    records.push({
      gameId: result.gameId,
      won: result.won,
      score: result.score,
      durationMs: result.durationMs,
      finishedAt: result.finishedAt,
    });
    writeAll(records);
  },

  async bestFor(gameId: string): Promise<GameResult | null> {
    const best = readAll()
      .filter((r) => r.gameId === gameId && r.won)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.durationMs - b.durationMs)[0];
    return best ?? null;
  },

  async historyFor(gameId: string): Promise<GameResult[]> {
    return readAll()
      .filter((r) => r.gameId === gameId)
      .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  },
};
