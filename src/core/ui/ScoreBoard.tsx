import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { recordsRepository } from '@/core/db/repositories/recordsRepository';
import type { GameResult } from '@/core/types';
import { useTheme } from './ThemeProvider';

interface ScoreBoardProps {
  gameId: string;
  /** Variante de una línea para GameCard */
  compact?: boolean;
}

export function ScoreBoard({ gameId, compact = false }: ScoreBoardProps) {
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

  if (compact) {
    return (
      <View style={styles.compactRow}>
        <Text style={[styles.label, styles.labelCompact, { color: theme.textMuted }]}>Mejor</Text>
        <Text
          accessibilityLabel={`record-${gameId}`}
          style={[styles.value, styles.valueCompact, { color: theme.text }]}
        >
          {best?.score !== undefined ? `${best.score} pts` : '—'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textMuted }]}>Mejor puntaje</Text>
      <Text
        accessibilityLabel={`record-${gameId}`}
        style={[styles.value, { color: theme.text }]}
      >
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
  compactRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  labelCompact: {
    fontSize: 11,
  },
  valueCompact: {
    fontSize: 13,
  },
});
