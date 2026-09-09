import { StyleSheet, Text, View } from 'react-native';
import { useWakWakStore } from '../engine/state';

/** HUD discreto: score, nivel y vidas. El combo y la SÚPER CARGA se muestran
 * SOBRE el tablero (components/BoardBanner.tsx) — la línea superior no se
 * apreciaba (PLAN-WAK-POLISH F1). Selectores zustand estrechos: re-renderiza
 * solo cuando cambia el valor, no por frame. */
export function Hud() {
  const score = useWakWakStore((s) => s.game.score);
  const lives = useWakWakStore((s) => s.game.lives);
  const level = useWakWakStore((s) => s.game.level);

  return (
    <View style={styles.row}>
      <Text style={styles.value} accessibilityLabel="marcador-puntos">
        {score} pts
      </Text>
      <Text style={styles.level} accessibilityLabel="wakwak-nivel">
        NVL {level}
      </Text>
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
  level: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  value: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
