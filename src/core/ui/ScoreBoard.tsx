import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { recordsRepository } from '@/core/db/repositories/recordsRepository';
import type { GameResult } from '@/core/types';
import { useTheme } from './ThemeProvider';

interface ScoreBoardProps {
  gameId: string;
}

export function ScoreBoard({ gameId }: ScoreBoardProps) {
  const theme = useTheme();
  const [best, setBest] = useState<GameResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void recordsRepository.bestFor(gameId).then((result) => {
      if (!cancelled) {
        setBest(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textMuted }]}>Mejor puntaje</Text>
      <Text style={[styles.value, { color: theme.text }]}>
        {best?.score !== undefined ? `${best.score} pts` : 'Sin partidas ganadas'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  label: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  value: {
    fontSize: 16,
    fontWeight: '700',
  },
});
