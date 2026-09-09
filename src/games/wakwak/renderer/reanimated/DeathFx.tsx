import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * Mini-clip de destrucción del robot (PLAN-WAK-POLISH F5): dim + zoom del
 * tablero (el transform vive en el CONTENEDOR del tablero, en WakWakScreen;
 * acá van el dim, la onda expansiva y las partículas) centrado en el SITIO DE
 * LA COLISIÓN — el engine resetea posiciones al regresar, por eso el evento
 * `caught` lleva la posición y present queda congelado durante el clip
 * (hallazgos 1 y 2 del PLAN). Todo corre en el UI thread; el desmonte lo hace
 * WakWakScreen al terminar el freeze (feel.ts: DEATH_FREEZE_MS). Reduced
 * motion: solo dim breve (sin zoom, sin partículas).
 */

const PARTICLES = 10;
const PARTICLES_FINAL = 14;

interface DeathFxProps {
  /** sitio de la colisión, en unidades de celda (del evento `caught`) */
  x: number;
  y: number;
  cellSize: number;
  /** derrota definitiva: más partículas, dim y zoom más intensos */
  final: boolean;
  /** zoom del tablero: 0 = sin zoom (reduced motion); lo anima el clip */
  zoom: SharedValue<number>;
}

/** Partícula del burst: dirección determinista por índice (sin rng). */
function Particle({
  index,
  total,
  px,
  py,
  size,
}: {
  index: number;
  total: number;
  px: number;
  py: number;
  size: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(0);
    t.set(withDelay(
      (index % 3) * 30,
      withTiming(1, { duration: 520 + (index % 4) * 60, easing: Easing.out(Easing.quad) }),
    ));
  }, [t]);
  const angle = (index / total) * Math.PI * 2 + 0.35;
  const distance = size * (1.3 + (index % 3) * 0.4);
  const style = useAnimatedStyle(() => {
    const k = t.get();
    return {
      transform: [
        { translateX: px + Math.cos(angle) * distance * k },
        { translateY: py + Math.sin(angle) * distance * k },
        { scale: 1 - 0.8 * k },
      ],
      opacity: 1 - k,
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: size,
          height: size,
          borderRadius: size * 0.3,
          backgroundColor: index % 2 === 0 ? '#F97316' : '#FBBF24',
        },
        style,
      ]}
    />
  );
}

export function DeathFx({ x, y, cellSize, final, zoom }: DeathFxProps) {
  const reduced = useReducedMotion();
  const dim = useSharedValue(0);
  const ring = useSharedValue(0);

  const px = x * cellSize;
  const py = y * cellSize;

  useEffect(() => {
    // zoom del tablero (transform vive en el contenedor, hallazgo 2)
    if (!reduced) {
      zoom.set(0);
      zoom.set(withTiming(final ? 1.8 : 1.6, { duration: 180, easing: Easing.out(Easing.quad) }));
    }
    dim.set(0);
    dim.set(
      withSequence(
        withTiming(reduced ? 0.45 : 0.6, { duration: reduced ? 120 : 160 }),
        withTiming(reduced ? 0.45 : 0.6, { duration: final ? 500 : 300 }),
        withTiming(0, { duration: 200 }),
      ),
    );
    ring.set(0);
    ring.set(
      withTiming(1, { duration: 480, easing: Easing.out(Easing.quad) }),
    );
  }, [reduced, final, zoom, dim, ring]);

  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.get() }));
  const ringStyle = useAnimatedStyle(() => {
    const k = ring.get();
    return {
      transform: [{ scale: 0.3 + 2 * k }],
      opacity: (1 - k) * 0.9,
    };
  });

  const count = final ? PARTICLES_FINAL : PARTICLES;
  const particleKeys = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);
  const particleSize = Math.max(6, Math.round(cellSize * 0.3));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]} />
      {!reduced ? (
        <>
          <Animated.View
            style={[
              styles.ring,
              {
                left: px - cellSize * 1.25,
                top: py - cellSize * 1.25,
                width: cellSize * 2.5,
                height: cellSize * 2.5,
                borderRadius: cellSize * 1.25,
              },
              ringStyle,
            ]}
          />
          {particleKeys.map((i) => (
            <Particle key={i} index={i} total={count} px={px} py={py} size={particleSize} />
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dim: {
    backgroundColor: '#0B1220',
  },
  ring: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#FDE047',
  },
});
