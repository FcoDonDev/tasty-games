import { StyleSheet, Text } from 'react-native';
import Animated, { FadeIn, useReducedMotion, ZoomIn } from 'react-native-reanimated';
import { overlayExit } from '@/core/ui/overlayAnimation';

/**
 * Interstitial de nivel (PLAN-WAK-WAK-V2 §D8): banner "NIVEL N" de ~1.5s
 * mientras la pantalla programa el `advanceLevel`; la simulación sigue
 * congelada (status 'won') y arranca sola al terminar — ritmo arcade, sin
 * botón. Reduced motion: fade puro.
 */
export function LevelInterstitial({ level }: { level: number }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View
      entering={reduced ? FadeIn.duration(200) : ZoomIn.duration(220)}
      exiting={overlayExit()}
      style={styles.banner}
      accessibilityRole="alert"
      accessibilityLabel={`wakwak-interstitial-nivel-${level}`}
      pointerEvents="none"
    >
      <Text style={styles.label}>Nivel superado</Text>
      <Text style={styles.title}>NIVEL {level}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '35%',
    alignItems: 'center',
    zIndex: 40,
  },
  label: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    color: '#4ADE80',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 3,
    textShadowColor: '#0B1220',
    textShadowRadius: 8,
  },
});
