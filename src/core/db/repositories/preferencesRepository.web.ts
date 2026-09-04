const STORAGE_KEY = 'preferences';

function readAll(): Record<string, string> {
  if (typeof localStorage === 'undefined') {
    return {};
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Record<string, string>) : {};
}

export const preferencesRepository = {
  async get(key: string): Promise<string | null> {
    const preferences = readAll();
    return preferences[key] ?? null;
  },

  async set(key: string, value: string): Promise<void> {
    const preferences = readAll();
    preferences[key] = value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  },
};
