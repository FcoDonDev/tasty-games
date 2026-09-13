import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { GameScreenProps } from '@/core/types';
import { GameHeader } from '@/core/ui/GameHeader';
import { useSerpienteStore } from './engine/state';

/**
 * Shell mínimo (T2): header estándar + tablero placeholder + wiring del
 * store. T3 implementa sobre este archivo el renderer real (V2 Escamas),
 * HUD, overlays y settings. La definición vive en `index.ts`.
 */
export default function SerpienteScreen({ onExit, initialSeed }: GameScreenProps) {
  const score = useSerpienteStore((s) => s.game.score);
  const eaten = useSerpienteStore((s) => s.game.eaten);
  const startRun = useSerpienteStore((s) => s.startRun);
  const reset = useSerpienteStore((s) => s.reset);

  useEffect(() => {
    startRun(initialSeed);
  }, [startRun, initialSeed]);

  return (
    <View style={styles.screen}>
      <GameHeader
        gameId="serpiente"
        onExit={onExit}
        onRestart={() => reset(initialSeed)}
        center={
          <Text style={styles.center}>
            {'🐍'} {score} · {'⬢'} {eaten}
          </Text>
        }
      />
      <View style={styles.board} accessibilityLabel="tablero-serpiente">
        <Text style={styles.soon}>Serpiente — tablero en T3</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0B1F14',
  },
  center: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  board: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soon: {
    color: '#4ADE80',
    fontSize: 14,
    fontWeight: '700',
  },
});
