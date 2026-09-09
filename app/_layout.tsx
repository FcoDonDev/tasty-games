import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/core/ui/ThemeProvider';
import { disableWebTextSelection } from '@/core/ui/webNoSelect';
import { useAppStore } from '@/core/stores/useAppStore';
import { lockPortrait } from '@/core/orientation';

export default function RootLayout() {
  const hydrate = useAppStore((state) => state.hydrate);

  useEffect(() => {
    // Web: mata la selección de texto nativa del navegador (Safari/iOS dispara
    // "Look Up"/copiar-pegar al tocar cartas o textos de los juegos).
    disableWebTextSelection();
    void hydrate();
    // La app base (Home, ajustes) queda en portrait; los juegos con
    // supportsLandscape liberan la rotación en app/juego/[id].tsx.
    void lockPortrait();
  }, [hydrate]);

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <ThemeProvider>
          <View style={styles.flex}>
            <Stack
              screenOptions={{
                headerShown: false,
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="ajustes" />
              <Stack.Screen name="juego/[id]" />
            </Stack>
          </View>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
