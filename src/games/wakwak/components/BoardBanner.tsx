import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  ZoomIn,
  useAnimatedStyle,
  useReducedMotion,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useWakWakStore } from '../engine/state';

/**
 * Mensajes de combo y súper carga flotando SOBRE el tablero (PLAN-WAK-POLISH
 * F1): sustituye la línea de 13px de la fila superior del HUD, que no se
 * apreciaba. El combo entra con pop (spring) y se re-monta por eslabón
 * (`key={chain}`, mismo patrón que usaba el Hud); la SÚPER CARGA muestra una
 * barra de tiempo restante alimentada por `powerFraction` vía shared value
 * escrita desde el loop rAF (cero setState por frame, hallazgo 8 del PLAN).
 * Reduced motion: FadeIn/FadeOut opacity-only en los banners (la barra queda:
 * es información funcional, no decoración).
 */

const BANNER_TRACK_WIDTH = 118;

/** Pop de entrada del combo; lazy porque ZoomIn no existe al importar en jest. */
let popEnter: ReturnType<typeof ZoomIn.springify> | undefined;
function popEntering() {
  popEnter ??= ZoomIn.springify().damping(13).stiffness(240);
  return popEnter;
}

interface BoardBannerProps {
  /** fracción restante del modo power (0..1), escrita por frame desde el loop */
  powerFraction: SharedValue<number>;
}

export function BoardBanner({ powerFraction }: BoardBannerProps) {
  const chain = useWakWakStore((s) => s.game.chain);
  const powered = useWakWakStore((s) => s.game.powerUntil !== null);
  const reduced = useReducedMotion();

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.max(0, Math.min(1, powerFraction.value)) }],
  }));

  // El pulso del power es opacity-only (compatible con reduced motion).
  // El banner solo está montado mientras `powered` (render condicional).
  const pulseStyle = useAnimatedStyle(() => {
    if (reduced) return { opacity: 1 };
    return {
      opacity: withRepeat(
        withSequence(withTiming(0.75, { duration: 420 }), withTiming(1, { duration: 420 })),
        -1,
        false,
      ),
    };
  });

  return (
    <View style={styles.container} pointerEvents="none">
      {powered ? (
        <Animated.View
          key="power"
          entering={reduced ? FadeIn.duration(120) : popEntering()}
          exiting={FadeOut.duration(150)}
          style={[styles.banner, styles.powerBanner, pulseStyle]}
        >
          <Text style={styles.powerText}>⚡ SÚPER CARGA</Text>
          <View style={styles.barTrack}>
            <Animated.View style={[styles.barFill, barStyle]} />
          </View>
        </Animated.View>
      ) : null}
      {chain >= 2 ? (
        <Animated.View
          key={`combo-${chain}`}
          entering={reduced ? FadeIn.duration(120) : popEntering()}
          style={[styles.banner, styles.comboBanner]}
        >
          <Text style={styles.comboText} accessibilityLabel="wakwak-combo">
            ⚡ COMBO ×{chain}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '6%',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 4,
    zIndex: 20,
  },
  banner: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 12,
    backgroundColor: '#0B1220D9',
  },
  powerBanner: {
    borderColor: '#4ADE80',
  },
  comboBanner: {
    borderColor: '#FDE047',
  },
  powerText: {
    color: '#4ADE80',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },
  barTrack: {
    width: BANNER_TRACK_WIDTH,
    height: 4,
    marginTop: 4,
    borderRadius: 2,
    backgroundColor: '#1E2A44',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#4ADE80',
  },
  comboText: {
    color: '#FDE047',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 1,
    textShadowColor: '#0B1220',
    textShadowRadius: 4,
  },
});
