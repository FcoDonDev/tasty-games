import { StyleSheet, Text, View } from 'react-native';
import { useSerpienteStore } from '../engine/state';

/**
 * HUD B2 flotante + chip (D14): score grande centrado + chip violeta con la
 * cuenta regresiva del especial (o la longitud si no hay especial).
 * Suscrito a slices primitivos, no al `game` completo (§9.2).
 */
export function Hud() {
  const score = useSerpienteStore((s) => s.game.score);
  const secs = useSerpienteStore((s) =>
    s.game.special ? Math.max(0, Math.ceil(s.game.special.ttlMs / 1000)) : null,
  );
  const len = useSerpienteStore((s) => s.game.snake.length);

  return (
    <View style={styles.hud} accessibilityLabel="hud-serpiente">
      <Text style={styles.score} accessibilityLabel="hud-puntos">
        {score}
      </Text>
      <Text style={styles.pts}>PTS</Text>
      <View style={styles.chip} accessibilityLabel={secs !== null ? `hud-especial-${secs}s` : 'hud-longitud'}>
        <Text style={styles.chipText}>{secs !== null ? `${secs}s` : `⬢ ${len}`}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hud: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  score: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  pts: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 3,
  },
  chip: {
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
