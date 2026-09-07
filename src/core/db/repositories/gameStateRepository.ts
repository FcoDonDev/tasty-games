import { getDb } from '../client';

/** Estado en curso por juego: blob JSON (ver gameStateRepository.web para la contraparte). */
export const gameStateRepository = {
  async get(gameId: string): Promise<string | null> {
    const row = getDb().getFirstSync<{ state: string }>(
      'SELECT state FROM game_state WHERE game_id = ?',
      [gameId],
    );
    return row?.state ?? null;
  },

  async set(gameId: string, state: string): Promise<void> {
    getDb().runSync(
      'INSERT OR REPLACE INTO game_state (game_id, state) VALUES (?, ?)',
      [gameId, state],
    );
  },

  async clear(gameId: string): Promise<void> {
    getDb().runSync('DELETE FROM game_state WHERE game_id = ?', [gameId]);
  },
};
