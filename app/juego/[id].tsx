import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGameById } from '@/core/game-registry';
import { recordsRepository } from '@/core/db/repositories/recordsRepository';
import { HelpModal } from '@/core/ui/HelpModal';
import { ScoreBoard } from '@/core/ui/ScoreBoard';
import { useTheme } from '@/core/ui/ThemeProvider';
import type { GameResult } from '@/core/types';

export default function GameScreen() {
  const { id, seed } = useLocalSearchParams<{ id: string; seed?: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const game = getGameById(id);
  // El seed solo llega al juego en builds E2E (EXPO_PUBLIC_E2E=1): en producción
  // nunca existe un canal para alterar el reparto.
  const initialSeed = process.env.EXPO_PUBLIC_E2E === '1' ? seed : undefined;
  const [showHelp, setShowHelp] = useState(false);

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
      <View style={[styles.chromeBar, { paddingTop: insets.top + 4 }]}>
        <Text style={[styles.chromeTitle, { color: theme.textMuted }]}>{game.name}</Text>
        <View style={styles.chromeRight}>
          <ScoreBoard gameId={game.id} compact />
          {game.rules ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`ayuda-contenedor-${game.id}`}
              accessibilityHint="Muestra las reglas del juego"
              onPress={() => setShowHelp(true)}
              style={[styles.chromeHelp, { borderColor: theme.surfaceBorder }]}
            >
              <Text style={[styles.chromeHelpText, { color: theme.textMuted }]}>?</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <View style={styles.gameArea}>
        <GameComponent onExit={() => router.back()} onGameEnd={handleGameEnd} initialSeed={initialSeed} />
      </View>
      {game.rules ? (
        <HelpModal gameId={game.id} rules={game.rules} visible={showHelp} onClose={() => setShowHelp(false)} />
      ) : null}
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
  chromeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  chromeTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chromeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  chromeHelp: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  chromeHelpText: {
    fontSize: 14,
    fontWeight: '700',
  },
  gameArea: {
    flex: 1,
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
