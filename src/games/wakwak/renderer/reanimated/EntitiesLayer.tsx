import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import type { WorldSnapshot } from '../types';

/**
 * Entidades móviles del motor A (ADR 0010): un Animated.View por entidad, con
 * shared values escritas por `present()` desde el loop rAF. Cero setState por
 * frame — React solo entera a la capa estática (MazeLayer) de cambios discretos.
 *
 * Siluetas propias (resguardo legal PLAN-WAK-WAK §2): robot = cuadrado
 * redondeado (aspiradora); drones = rombos con LED central — no círculo con
 * boca en V ni campanas con ojos perseguidores. Cada drone tiene color propio
 * según su personalidad; en modo power todos se apagan y el robot se enciende.
 */

export const ROBOT_COLOR = '#34D399';
export const POWERED_ROBOT_COLOR = '#E0F2FE';
const POWERED_DRONE_COLOR = '#475569';
export const DRONE_COLORS = ['#F97316', '#A78BFA', '#38BDF8', '#FB7185'] as const;

export interface EntityFrame {
  x: number;
  y: number;
  powered: boolean;
  hidden?: boolean;
}

export interface EntityHandle {
  present(frame: EntityFrame): void;
}

interface EntityProps {
  cellSize: number;
  color: string;
  hiddenColor?: string;
  borderRadius: number;
  scale: number;
  rotated?: boolean;
  /** selector estable para E2E (Playwright/Maestro) */
  accessibilityLabel?: string;
}

/** Animated.View imperativa: pinta la pose que llega por `present`. */
const EntityImpl = forwardRef<EntityHandle, EntityProps>(function EntityImpl(
  { cellSize, color, hiddenColor, borderRadius, scale, rotated, accessibilityLabel },
  ref,
) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const opacity = useSharedValue(1);
  const powered = useSharedValue(0);
  const size = cellSize * scale;

  useImperativeHandle(ref, () => ({
    present(frame) {
      tx.set(frame.x * cellSize - size / 2);
      ty.set(frame.y * cellSize - size / 2);
      opacity.set(frame.hidden ? 0 : 1);
      powered.set(frame.powered ? 1 : 0);
    },
  }));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.get() },
      { translateY: ty.get() },
      ...(rotated ? [{ rotate: '45deg' }] : []),
    ],
    opacity: opacity.get(),
    backgroundColor: hiddenColor
      ? interpolateColor(powered.get(), [0, 1], [color, hiddenColor])
      : color,
  }));

  return (
    <Animated.View
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: size,
          height: size,
          borderRadius,
        },
        animatedStyle,
      ]}
    >
      {/* LED central del drone (fijo, sin seguir dirección: no son "ojos") */}
      {rotated ? (
        <View
          style={{
            position: 'absolute',
            left: size * 0.32,
            top: size * 0.32,
            width: size * 0.36,
            height: size * 0.36,
            borderRadius: size * 0.18,
            backgroundColor: '#0B1220',
          }}
        />
      ) : (
        // franja del robot aspiradora (cepillo frontal)
        <View
          style={{
            position: 'absolute',
            left: size * 0.18,
            top: size * 0.7,
            width: size * 0.64,
            height: size * 0.14,
            borderRadius: size * 0.07,
            backgroundColor: '#0B1220',
          }}
        />
      )}
    </Animated.View>
  );
});

export interface EntitiesHandle {
  present(snapshot: WorldSnapshot): void;
}

export interface EntitiesLayerProps {
  cellSize: number;
}

/**
 * Las 5 entidades con hooks estables (un componente por entidad, sin hooks en
 * loops). `present` escribe todas las shared values en un solo pase.
 */
export const EntitiesLayer = forwardRef<EntitiesHandle, EntitiesLayerProps>(
  function EntitiesLayer({ cellSize }, ref) {
    const robotRef = useRef<EntityHandle | null>(null);
    const droneRefs = [
      useRef<EntityHandle | null>(null),
      useRef<EntityHandle | null>(null),
      useRef<EntityHandle | null>(null),
      useRef<EntityHandle | null>(null),
    ];

    useImperativeHandle(ref, () => ({
      present(snapshot) {
        robotRef.current?.present({
          x: snapshot.robot.x,
          y: snapshot.robot.y,
          powered: snapshot.robot.powered,
        });
        snapshot.drones.forEach((drone, i) => {
          droneRefs[i].current?.present({
            x: drone.x,
            y: drone.y,
            powered: drone.powered,
            hidden: drone.mode === 'eaten',
          });
        });
      },
    }));

    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {DRONE_COLORS.map((color, i) => (
          <EntityImpl
            key={`drone-${i}`}
            ref={droneRefs[i]}
            cellSize={cellSize}
            color={color}
            hiddenColor={POWERED_DRONE_COLOR}
            borderRadius={cellSize * 0.12}
            scale={0.62}
            rotated
            accessibilityLabel={`wakwak-drone-${i}`}
          />
        ))}
        <EntityImpl
          ref={robotRef}
          cellSize={cellSize}
          color={ROBOT_COLOR}
          hiddenColor={POWERED_ROBOT_COLOR}
          borderRadius={cellSize * 0.24}
          scale={0.78}
          accessibilityLabel="wakwak-robot"
        />
      </View>
    );
  },
);
