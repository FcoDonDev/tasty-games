import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useWakWakStore } from '../engine/state';

/** HUD discreto: score, nivel, vidas, modo súper carga y combo activo.
 * Selectores zustand estrechos: re-renderiza solo cuando cambia el valor,
 * no por frame. El combo entra con FadeIn (opacity-only: compatible con
 * reduced motion) y se re-monta por eslabón (`key={chain}`). */
export function Hud() {
  const score = useWakWakStore((s) => s.game.score);
  const lives = useWakWakStore((s) => s.game.lives);
  const level = useWakWakStore((s) => s.game.level);
  const powered = useWakWakStore((s) => s.game.powerUntil !== null);
  const chain = useWakWakStore((s) => s.game.chain);

  return (
    <View style={styles.row}>
      <Text style={styles.value} accessibilityLabel="marcador-puntos">
        {score} pts
      </Text>
      <View style={styles.center}>
        <Text style={styles.level} accessibilityLabel="wakwak-nivel">
          NVL {level}
        </Text>
        {chain >= 2 ? (
          <Animated.View key={`combo-${chain}`} entering={FadeIn.duration(120)}>
            <Text style={styles.combo} accessibilityLabel="wakwak-combo">
              ⚡ COMBO ×{chain}
            </Text>
          </Animated.View>
        ) : null}
        {powered ? <Text style={styles.power}>⚡ SÚPER CARGA</Text> : null}
      </View>
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
  center: {
    alignItems: 'center',
    gap: 1,
  },
  level: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  power: {
    color: '#4ADE80',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  combo: {
    color: '#FDE047',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  value: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
