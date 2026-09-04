import { create } from 'zustand';
import { preferencesRepository } from '@/core/db/repositories/preferencesRepository';

const DARK_MODE_KEY = 'dark_mode';

interface AppState {
  darkMode: boolean;
  hydrated: boolean;
  toggleDarkMode: () => void;
  hydrate: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  darkMode: false,
  hydrated: false,
  toggleDarkMode: () =>
    set((state) => {
      const next = !state.darkMode;
      void preferencesRepository.set(DARK_MODE_KEY, next ? '1' : '0');
      return { darkMode: next };
    }),
  hydrate: async () => {
    const value = await preferencesRepository.get(DARK_MODE_KEY);
    set({ darkMode: value === '1', hydrated: true });
  },
}));
