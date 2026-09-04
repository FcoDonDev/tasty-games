import * as SQLite from 'expo-sqlite';
import { DB_NAME, MIGRATIONS, SCHEMA_VERSION } from './schema';

let instance: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!instance) {
    instance = SQLite.openDatabaseSync(DB_NAME);
    migrate(instance);
  }
  return instance;
}

function migrate(db: SQLite.SQLiteDatabase): void {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  for (let version = current; version < SCHEMA_VERSION; version++) {
    for (const statement of MIGRATIONS[version] ?? []) {
      db.execSync(statement);
    }
  }

  if (current < SCHEMA_VERSION) {
    db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
}
