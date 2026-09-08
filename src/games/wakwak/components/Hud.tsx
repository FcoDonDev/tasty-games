import { StyleSheet, Text, View } from 'react-native';
import { useWakWakStore } from '../engine/state';

/** HUD discreto: score, vidas y modo súper carga. Selectores zustand estrechos:
 * re-renderiza solo cuando cambia el valor, no por frame. */
export function Hud() {
  const score = useWakWakStore((s) => s.game.score);
  const lives = useWakWakStore((s) => s.game.lives);
  const powered = useWakWakStore((s) => s.game.powerUntil !== null);

  return (
    <View style={styles.row}>
      <Text style={styles.value} accessibilityLabel="marcador-puntos">
        {score} pts
      </Text>
      {powered ? <Text style={styles.power}>⚡ SÚPER CARGA</Text> : null}
      <Text style={styles.value} accessibilityLabel="vidas-restantes">
        {'🔋'.repeat(Math.max(0, lives))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  value: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  power: {
    color: '#4ADE80',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
