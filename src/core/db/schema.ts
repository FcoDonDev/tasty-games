export const DB_NAME = 'tasty-games.db';

/**
 * Versión del schema. Al cambiar el schema:
 * 1. Sumar SCHEMA_VERSION en 1.
 * 2. Agregar un array de statements en MIGRATIONS en la posición
 *    correspondiente (MIGRATIONS[0] lleva de 0 -> 1, etc.).
 * client.ts ejecuta las migraciones pendientes usando PRAGMA user_version.
 */
export const SCHEMA_VERSION = 1;

export const MIGRATIONS: string[][] = [
  [
    `CREATE TABLE IF NOT EXISTS game_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL,
      won INTEGER NOT NULL,
      score INTEGER,
      duration_ms INTEGER NOT NULL,
      finished_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_game_records_game_id ON game_records (game_id, score DESC)`,
  ],
];
