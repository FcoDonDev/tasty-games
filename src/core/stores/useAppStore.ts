import { create } from 'zustand';
import { preferencesRepository } from '@/core/db/repositories/preferencesRepository';

const DARK_MODE_KEY = 'dark_mode';
const SOUND_KEY = 'sound_enabled';

interface AppState {
  darkMode: boolean;
  soundOn: boolean;
  hydrated: boolean;
  toggleDarkMode: () => void;
  toggleSound: () => void;
  hydrate: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  darkMode: false,
  soundOn: true,
  hydrated: false,
  toggleDarkMode: () =>
    set((state) => {
      const next = !state.darkMode;
      void preferencesRepository.set(DARK_MODE_KEY, next ? '1' : '0');
      return { darkMode: next };
    }),
  toggleSound: () =>
    set((state) => {
      const next = !state.soundOn;
      void preferencesRepository.set(SOUND_KEY, next ? '1' : '0');
      return { soundOn: next };
    }),
  hydrate: async () => {
    const [darkRaw, soundRaw] = await Promise.all([
      preferencesRepository.get(DARK_MODE_KEY),
      preferencesRepository.get(SOUND_KEY),
    ]);
    set({ darkMode: darkRaw === '1', soundOn: soundRaw !== '0', hydrated: true });
  },
}));
