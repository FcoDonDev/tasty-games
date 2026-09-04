import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useAppStore } from '@/core/stores/useAppStore';
import { darkTheme, lightTheme, type Theme } from './theme';

const ThemeContext = createContext<Theme>(lightTheme);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const darkMode = useAppStore((state) => state.darkMode);
  const hydrate = useAppStore((state) => state.hydrate);
  const theme = darkMode ? darkTheme : lightTheme;

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <ThemeContext.Provider value={theme}>
      <StatusBar style={darkMode ? 'light' : 'dark'} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
