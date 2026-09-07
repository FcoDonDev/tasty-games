import { MIGRATIONS, SCHEMA_VERSION } from '../schema';

describe('schema — migración v2', () => {
  it('sumó la versión y agregó la migración de game_state', () => {
    expect(SCHEMA_VERSION).toBe(2);
    expect(MIGRATIONS).toHaveLength(2);
    const v2 = MIGRATIONS[1].join(' ');
    expect(v2).toContain('CREATE TABLE IF NOT EXISTS game_state');
    expect(v2).toContain('game_id TEXT PRIMARY KEY');
  });

  it('el DDL de v1 no fue editado (no menciona game_state)', () => {
    const v1 = MIGRATIONS[0].join(' ');
    expect(v1).toContain('game_records');
    expect(v1).toContain('preferences');
    expect(v1).not.toContain('game_state');
  });
});
