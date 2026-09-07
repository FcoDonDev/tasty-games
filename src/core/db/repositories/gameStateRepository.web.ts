/** Estado en curso por juego: blob JSON en localStorage (par web de gameStateRepository.ts). */
const STORAGE_KEY = 'game_state';

function readAll(): Record<string, string> {
  if (typeof localStorage === 'undefined') {
    return {};
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Record<string, string>) : {};
}

export const gameStateRepository = {
  async get(gameId: string): Promise<string | null> {
    return readAll()[gameId] ?? null;
  },

  async set(gameId: string, state: string): Promise<void> {
    const all = readAll();
    all[gameId] = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  },

  async clear(gameId: string): Promise<void> {
    if (typeof localStorage === 'undefined') {
      return;
    }
    const all = readAll();
    delete all[gameId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  },
};
