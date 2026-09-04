import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getGameById } from '@/core/game-registry';
import { recordsRepository } from '@/core/db/repositories/recordsRepository';
import { useTheme } from '@/core/ui/ThemeProvider';
import type { GameResult } from '@/core/types';

export default function GameScreen() {
  const { id, seed } = useLocalSearchParams<{ id: string; seed?: string }>();
  const theme = useTheme();
  const game = getGameById(id);
  // El seed solo llega al juego en builds E2E (EXPO_PUBLIC_E2E=1): en producción
  // nunca existe un canal para alterar el reparto.
  const initialSeed = process.env.EXPO_PUBLIC_E2E === '1' ? seed : undefined;

  const handleGameEnd = useCallback(
    async (result: GameResult) => {
      await recordsRepository.save(result);
    },
    [],
  );

  if (!game) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <Text style={[styles.title, { color: theme.text }]}>Juego no encontrado</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver al inicio"
          onPress={() => router.back()}
          style={[styles.button, { backgroundColor: theme.primary }]}
        >
          <Text style={[styles.buttonText, { color: theme.primaryText }]}>Volver</Text>
        </Pressable>
      </View>
    );
  }

  const GameComponent = game.Component;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <GameComponent onExit={() => router.back()} onGameEnd={handleGameEnd} initialSeed={initialSeed} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
