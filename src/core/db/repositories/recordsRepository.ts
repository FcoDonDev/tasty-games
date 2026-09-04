import type { GameResult } from '@/core/types';
import { getDb } from '../client';

interface GameRecordRow {
  game_id: string;
  won: number;
  score: number | null;
  duration_ms: number;
  finished_at: string;
}

function toResult(row: GameRecordRow): GameResult {
  return {
    gameId: row.game_id,
    won: row.won === 1,
    score: row.score ?? undefined,
    durationMs: row.duration_ms,
    finishedAt: row.finished_at,
  };
}

export const recordsRepository = {
  async save(result: GameResult): Promise<void> {
    getDb().runSync(
      `INSERT INTO game_records (game_id, won, score, duration_ms, finished_at)
       VALUES (?, ?, ?, ?, ?)`,
      [result.gameId, result.won ? 1 : 0, result.score ?? null, result.durationMs, result.finishedAt],
    );
  },

  async bestFor(gameId: string): Promise<GameResult | null> {
    const row = getDb().getFirstSync<GameRecordRow>(
      `SELECT game_id, won, score, duration_ms, finished_at
       FROM game_records
       WHERE game_id = ? AND won = 1
       ORDER BY score DESC, duration_ms ASC
       LIMIT 1`,
      [gameId],
    );
    return row ? toResult(row) : null;
  },

  async clearAll(): Promise<void> {
    getDb().runSync('DELETE FROM game_records');
  },

  async historyFor(gameId: string): Promise<GameResult[]> {
    const rows = getDb().getAllSync<GameRecordRow>(
      `SELECT game_id, won, score, duration_ms, finished_at
       FROM game_records
       WHERE game_id = ?
       ORDER BY finished_at DESC`,
      [gameId],
    );
    return rows.map(toResult);
  },
};
