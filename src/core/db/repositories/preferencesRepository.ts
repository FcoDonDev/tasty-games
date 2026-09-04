import { getDb } from '../client';

export const preferencesRepository = {
  async get(key: string): Promise<string | null> {
    const row = getDb().getFirstSync<{ value: string }>(
      'SELECT value FROM preferences WHERE key = ?',
      [key],
    );
    return row?.value ?? null;
  },

  async set(key: string, value: string): Promise<void> {
    getDb().runSync(
      'INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)',
      [key, value],
    );
  },
};
