/**
 * Sistema de partículas de Robo Jump (PLAN fase 5, D19): pool FIJO de
 * nodos que corren UN tween UI-thread por emisión y quedan libres —
 * cero re-renders React, cero trabajo por frame en el engine (juice
 * 100% cosmético, criterio §5.10).
 *
 * - `burst(x, y, style)`: explosión radial (pickups, kill, disparo,
 *   muerte) — ángulos deterministas por contador (sin Math.random).
 * - `emit(x, y)`: estela del turbo — UNA partícula que cae mientras el
 *   Robo sube (emisión round-robin desde `renderFrame`, ~50 ms).
 *
 * Ambas reciben coordenadas del MUNDO (los eventos D18 llevan la
 * posición exacta; el burst del disparo sale de la nariz del Robo) y
 * escalan al contenedor real con `scaleRef`. Reduced motion: no-op.
 */

import { memo, useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { PARTICLE_POOL, TRAIL_POOL } from '../engine/tuning';

/** Paleta de modos (D19): 0 spring, 1 hat/turbo, 2 kill, 3 hat-kill, 4 muerte. */
const MODES = ['#42A5F5', '#AB47BC', '#EC407A', '#FDD835', '#EF5350'];

export interface BurstStyle {
  /** Índice en MODES. */
  mode: number;
  count: number;
  /** Radio del estallido en unidades del mundo. */
  radius: number;
  /** Sesgo hacia arriba en unidades del mundo. */
  rise: number;
  /** Aceleración de caída en u/s² al cuadrado normalizado (arc del tween). */
  gravity?: number;
  /** Duración base del tween en ms. */
  duration?: number;
  /** Tamaño base en unidades del mundo. */
  size?: number;
}

interface ParticleHandle {
  k: SharedValue<number>;
  ox: SharedValue<number>;
  oy: SharedValue<number>;
  dx: SharedValue<number>;
  dy: SharedValue<number>;
  gy: SharedValue<number>;
  c: SharedValue<number>;
  size: SharedValue<number>;
  /** Reserva JS del slot hasta esta marca de tiempo (ms). */
  freeAt: number;
}

/** Emisión disparada: setea los SV del slot y lanza UN tween de progreso. */
function fire(
  handle: ParticleHandle,
  now: number,
  px: number,
  py: number,
  dx: number,
  dy: number,
  gy: number,
  mode: number,
  size: number,
  duration: number,
): void {
  handle.ox.set(px);
  handle.oy.set(py);
  handle.dx.set(dx);
  handle.dy.set(dy);
  handle.gy.set(gy);
  handle.c.set(mode);
  handle.size.set(size);
  handle.k.set(0);
  handle.k.set(withTiming(1, { duration, easing: Easing.out(Easing.quad) }));
  handle.freeAt = now + duration;
}

const ParticleSlot = memo(function ParticleSlot({
  index,
  registry,
}: {
  index: number;
  registry: RefObject<(ParticleHandle | null)[]>;
}) {
  const k = useSharedValue(1); // 1 = apagado (opacity 0)
  const ox = useSharedValue(0);
  const oy = useSharedValue(0);
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  const gy = useSharedValue(0);
  const c = useSharedValue(0);
  const size = useSharedValue(6);
  useEffect(() => {
    const handle: ParticleHandle = { k, ox, oy, dx, dy, gy, c, size, freeAt: 0 };
    if (!registry.current) return;
    registry.current[index] = handle;
    return () => {
      if (registry.current) registry.current[index] = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => {
    const t = k.value;
    return {
      opacity: 1 - t,
      transform: [
        { translateX: ox.value + dx.value * t },
        { translateY: oy.value + dy.value * t + gy.value * t * t },
        { scale: size.value * (1 - 0.6 * t) },
      ],
      backgroundColor: interpolateColor(c.value, [0, 1, 2, 3, 4], MODES),
    };
  });
  // Nodo de 1×1 escalado por `scale`: el radio y el tamaño viven en el
  // transform (width/height fijos → borderRadius proporcional gratis).
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.particle, style]}
    />
  );
});

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  particle: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    borderRadius: 0.5,
  },
});

export interface ParticleFx {
  /** Estallido radial en (x, y) del mundo. */
  burst: (x: number, y: number, style: BurstStyle) => void;
  /** Una partícula de estela en (x, y) del mundo (turbo). */
  emit: (x: number, y: number) => void;
  /** Nodos del pool (montar una vez dentro del papel). */
  node: React.ReactNode;
}

/**
 * Pool completo: `PARTICLE_POOL` slots para bursts + `TRAIL_POOL`
 * reservados para la estela (emit solo toca el rango final).
 */
export function useParticleFx(scaleRef: RefObject<number>): ParticleFx {
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const counter = useRef(0);
  const registry = useRef<(ParticleHandle | null)[]>([]);

  const burst = useCallback(
    (x: number, y: number, style: BurstStyle) => {
      if (reducedRef.current) return;
      const s = scaleRef.current ?? 0;
      if (s <= 0 || !registry.current) return;
      const now = performance.now();
      const count = Math.min(style.count, PARTICLE_POOL);
      let placed = 0;
      for (let i = 0; i < PARTICLE_POOL && placed < count; i++) {
        const handle = registry.current[i];
        if (!handle || now < handle.freeAt) continue;
        const idx = counter.current++;
        // Ángulo determinista: reparto radial + salto áureo por emisión.
        const angle = (placed / count) * Math.PI * 2 + idx * 0.618;
        const jitter = 0.75 + (idx % 5) * 0.125;
        const radius = style.radius * s * jitter;
        fire(
          handle,
          now,
          x * s,
          y * s,
          Math.cos(angle) * radius,
          Math.sin(angle) * radius * 0.8 - style.rise * s,
          (style.gravity ?? 260) * s,
          style.mode,
          (style.size ?? 7) * s * (0.8 + (idx % 3) * 0.15),
          (style.duration ?? 460) + (idx % 4) * 70,
        );
        placed++;
      }
    },
    [scaleRef],
  );

  const emit = useCallback(
    (x: number, y: number) => {
      if (reducedRef.current) return;
      const s = scaleRef.current ?? 0;
      if (s <= 0 || !registry.current) return;
      const now = performance.now();
      for (let i = PARTICLE_POOL; i < PARTICLE_POOL + TRAIL_POOL; i++) {
        const handle = registry.current[i];
        if (!handle || now < handle.freeAt) continue;
        const idx = counter.current++;
        const lateral = ((idx % 2) * 2 - 1) * (2 + (idx % 3));
        // La partícula queda ABAJO mientras el Robo sube: deriva lateral
        // mínima + caída (arco pequeño), vida corta.
        fire(
          handle,
          now,
          x * s,
          y * s,
          lateral * s,
          6 * s,
          180 * s,
          1,
          5 * s,
          420 + (idx % 3) * 60,
        );
        return;
      }
    },
    [scaleRef],
  );

  const node = useMemo(
    () => (
      <View pointerEvents="none" style={styles.layer}>
        {Array.from({ length: PARTICLE_POOL + TRAIL_POOL }, (_, i) => (
          <ParticleSlot key={i} index={i} registry={registry} />
        ))}
      </View>
    ),
    [],
  );

  return { burst, emit, node };
}

export { PARTICLE_POOL, TRAIL_POOL };
