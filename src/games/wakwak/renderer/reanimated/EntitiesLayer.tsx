import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { Direction } from '../../engine/maze';
import type { WorldSnapshot } from '../types';

/**
 * Entidades móviles del motor A (ADR 0010): un Animated.View por entidad, con
 * shared values escritas por `present()` desde el loop rAF. Cero setState por
 * frame — React solo entera a la capa estática (MazeLayer) de cambios discretos.
 *
 * Game feel (PLAN-WAK-WAK-V2 §D6 + PLAN-WAK-POLISH F3): lo IDLE (bobbing del
 * robot, wobble de los drones) corre como loops `withRepeat` del UI thread;
 * el translate (pose) lo escribe `present()` por frame. Efectos one-shot (pop,
 * shake) llegan por `onEvent` desde los eventos discretos del tick.
 *
 * Personalidad (PLAN-WAK-POLISH F3, sin ojos que sigan dirección — resguardo
 * legal): cada drone tiene accesorio propio sobre el vértice superior
 * (Cazador=antena spike, Emboscador=platillo radar, Caprichoso=hélice,
 * Tímido=domo), LED con patrón geométrico distinto (barra/anillo/cuadrado/
 * línea) y wobble con frecuencia/amplitud propias. El robot rota hacia su
 * dirección (conTiming 90° solo al CAMBIAR, guard lastDir — nunca por frame)
 * y su luz de antena cambia al modo powered.
 *
 * Siluetas propias: robot = cuadrado redondeado (aspiradora); drones = rombos
 * con LED central — no círculo con boca en V ni campanas con ojos perseguidores.
 * En modo power todos se apagan y el robot se enciende.
 */

export const ROBOT_COLOR = '#34D399';
export const POWERED_ROBOT_COLOR = '#E0F2FE';
const POWERED_DRONE_COLOR = '#475569';
const HURT_COLOR = '#FB7185';
const DARK = '#0B1220';
const DRONE_COLORS = ['#F97316', '#A78BFA', '#38BDF8', '#FB7185'] as const;

/** Wobble y tamaño por personalidad (±10% máx en scale: hitbox percibida). */
const DRONE_TUNE = [
  { wobbleMs: 150, wobbleDeg: 4, scale: 0.64 }, // 0 Cazador: tenso y firme
  { wobbleMs: 240, wobbleDeg: 6, scale: 0.6 }, // 1 Emboscador: escaneo pausado
  { wobbleMs: 120, wobbleDeg: 9, scale: 0.58 }, // 2 Caprichoso: errático
  { wobbleMs: 320, wobbleDeg: 3, scale: 0.66 }, // 3 Tímido: lento y grande
] as const;

/** Umbral de `powerFraction` bajo el que los drones parpadean (~2s de power). */
const BLINK_FRACTION = 0.33;

/** Ángulo de heading del robot: la franja (frente) apunta hacia `dir`. */
function headingAngle(dir: Direction): number {
  return dir === 'left' ? 90 : dir === 'right' ? -90 : dir === 'up' ? 180 : 0;
}

export interface EntityFrame {
  x: number;
  y: number;
  powered: boolean;
  hidden?: boolean;
  /** ¿la entidad avanza? (gate del bobbing/wobble) */
  moving?: boolean;
  /** fracción restante del power (para el parpadeo de los drones) */
  powerFraction?: number;
  /** dirección vigente: rota al robot (guard por cambio); drones la ignoran */
  dir?: Direction | null;
}

export interface EntityHandle {
  present(frame: EntityFrame): void;
  /** One-shot: drone comido (encoge y se desvanece antes del hidden). */
  pop(): void;
  /** One-shot: robot atrapado (shake + flash rojo). */
  shake(): void;
  /** One-shot: nivel/run ganada (pulso de celebración). */
  winPulse(): void;
  /** One-shot: run perdida (flash rojo sostenido breve). */
  loseFlash(): void;
}

export type EntityEvent =
  | { kind: 'droneEaten'; id: number }
  | { kind: 'robotCaught' }
  | { kind: 'levelWin' }
  | { kind: 'runLost' };

interface EntityProps {
  cellSize: number;
  color: string;
  hiddenColor?: string;
  borderRadius: number;
  scale: number;
  rotated?: boolean;
  /** personalidad del drone (0..3): accesorio, LED y wobble propios */
  variant?: number;
  /** selector estable para E2E (Playwright/Maestro) */
  accessibilityLabel?: string;
}

/** Accesorio del drone sobre el vértice superior del rombo (silueta oscura). */
function DroneAccessory({ variant, size }: { variant: number; size: number }) {
  switch (variant) {
    case 0: // Cazador: antena spike
      return (
        <View
          style={{
            width: size * 0.07,
            height: size * 0.24,
            borderRadius: size * 0.035,
            backgroundColor: DARK,
          }}
        />
      );
    case 1: // Emboscador: platillo radar
      return (
        <View
          style={{
            width: size * 0.28,
            height: size * 0.14,
            borderTopLeftRadius: size * 0.14,
            borderTopRightRadius: size * 0.14,
            backgroundColor: DARK,
          }}
        />
      );
    case 2: // Caprichoso: hélice (barra de dos palas)
      return (
        <View
          style={{
            width: size * 0.36,
            height: size * 0.07,
            borderRadius: size * 0.035,
            backgroundColor: DARK,
          }}
        />
      );
    default: // Tímido: domo
      return (
        <View
          style={{
            width: size * 0.3,
            height: size * 0.15,
            borderTopLeftRadius: size * 0.15,
            borderTopRightRadius: size * 0.15,
            backgroundColor: DARK,
            opacity: 0.85,
          }}
        />
      );
  }
}

/** LED central del drone: patrón geométrico por personalidad (no son "ojos"). */
function DroneLed({ variant, size }: { variant: number; size: number }) {
  switch (variant) {
    case 0: // barra vertical
      return (
        <View
          style={{
            width: size * 0.1,
            height: size * 0.3,
            borderRadius: size * 0.05,
            backgroundColor: DARK,
          }}
        />
      );
    case 1: // anillo
      return (
        <View
          style={{
            width: size * 0.3,
            height: size * 0.3,
            borderRadius: size * 0.15,
            borderWidth: Math.max(2, size * 0.07),
            borderColor: DARK,
          }}
        />
      );
    case 2: // cuadrado
      return (
        <View
          style={{
            width: size * 0.26,
            height: size * 0.26,
            borderRadius: 2,
            backgroundColor: DARK,
          }}
        />
      );
    default: // línea horizontal
      return (
        <View
          style={{
            width: size * 0.3,
            height: size * 0.1,
            borderRadius: size * 0.05,
            backgroundColor: DARK,
          }}
        />
      );
  }
}

/** Animated.View imperativa: pinta la pose que llega por `present`. */
const EntityImpl = forwardRef<EntityHandle, EntityProps>(function EntityImpl(
  { cellSize, color, hiddenColor, borderRadius, scale, rotated, variant = 0, accessibilityLabel },
  ref,
) {
  const reduced = useReducedMotion();
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const opacity = useSharedValue(1);
  const powered = useSharedValue(0);
  const moving = useSharedValue(0);
  const blink = useSharedValue(1); // 1 = visible; oscila 0.3↔1 con power por expirar
  const popT = useSharedValue(0); // 1 → 0: encoge y desvanece (drone comido)
  const shakeX = useSharedValue(0); // one-shot shake del robot
  const hurt = useSharedValue(0); // 1 → 0: flash rojo
  const idle = useSharedValue(0); // loop continuo 0↔1 (bob/wobble)
  const heading = useSharedValue(0); // rotación del robot hacia dir (grados)
  const lastDir = useRef<Direction | null>(null);
  const blinking = useRef(false);
  const size = cellSize * scale;
  const wobble = DRONE_TUNE[variant] ?? DRONE_TUNE[0];

  // Lo idle es un loop del UI thread: corre aunque el JS thread tenga stalls.
  // Reduced motion: amplitud 0 (solo quedan opacity/color).
  useEffect(() => {
    if (reduced) {
      idle.set(0);
      return;
    }
    idle.set(0);
    idle.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: rotated ? wobble.wobbleMs : 160, easing: Easing.linear }),
          withTiming(0, { duration: rotated ? wobble.wobbleMs : 160, easing: Easing.linear }),
        ),
        -1,
        false,
      ),
    );
    return () => {
      idle.set(0);
    };
  }, [reduced, rotated, wobble.wobbleMs, idle]);

  useImperativeHandle(ref, () => ({
    present(frame) {
      tx.set(frame.x * cellSize - size / 2);
      ty.set(frame.y * cellSize - size / 2);
      opacity.set(frame.hidden ? 0 : 1);
      moving.set(frame.moving ? 1 : 0);
      powered.set(frame.powered ? 1 : 0);
      // heading del robot: solo al CAMBIAR la dirección (guard; nunca por frame)
      if (!rotated && frame.dir && frame.dir !== lastDir.current) {
        lastDir.current = frame.dir;
        const target = headingAngle(frame.dir);
        if (reduced) heading.set(target);
        else heading.set(withTiming(target, { duration: 120 }));
      }
      // parpadeo de fin de power (drones): opacity 0.3↔1, sin tocar transforms
      const shouldBlink: boolean =
        rotated === true && frame.powered === true && (frame.powerFraction ?? 1) < BLINK_FRACTION;
      if (shouldBlink !== blinking.current) {
        blinking.current = shouldBlink;
        blink.set(
          shouldBlink
            ? withRepeat(withSequence(withTiming(0.3, { duration: 110 }), withTiming(1, { duration: 110 })), -1, false)
            : 1,
        );
      }
    },
    pop() {
      popT.set(1);
      popT.set(withTiming(0, { duration: 180, easing: Easing.bezier(0.23, 1, 0.32, 1) }));
    },
    shake() {
      if (reduced) {
        hurt.set(1);
        hurt.set(withTiming(0, { duration: 300 }));
        return;
      }
      shakeX.set(
        withSequence(
          withTiming(-cellSize * 0.18, { duration: 40 }),
          withTiming(cellSize * 0.18, { duration: 40 }),
          withTiming(0, { duration: 80 }),
        ),
      );
      hurt.set(1);
      hurt.set(withTiming(0, { duration: 300 }));
    },
    winPulse() {
      if (reduced) return; // opacity ya lo cuenta la secuencia del overlay
      popT.set(1);
      popT.set(withTiming(0, { duration: 500, easing: Easing.bezier(0.23, 1, 0.32, 1) }));
    },
    loseFlash() {
      hurt.set(1);
      hurt.set(withTiming(0, { duration: 700 }));
    },
  }));

  const lightStyle = useAnimatedStyle(() => ({
    // luz de antena del robot: tenue normal, dorada en modo powered
    backgroundColor: interpolateColor(powered.get(), [0, 1], ['#334155', '#FDE047']),
  }));

  const animatedStyle = useAnimatedStyle(() => {
    const hiddenOpacity = opacity.get();
    // el pop mantiene visible al drone un instante después del `hidden`
    const visibleOpacity = Math.max(hiddenOpacity, popT.get());
    const baseColor = hiddenColor
      ? interpolateColor(powered.get(), [0, 1], [color, hiddenColor])
      : color;
    const finalColor = interpolateColor(hurt.get(), [0, 1], [baseColor, HURT_COLOR]);
    // bob del robot al avanzar; wobble propio de cada drone (loops UI thread)
    const bob = idle.get() * moving.get() * cellSize * 0.05;
    const rotation = rotated
      ? `${45 + idle.get() * wobble.wobbleDeg}deg`
      : `${heading.get()}deg`;
    const popScale = 1 - 0.5 * popT.get();
    const robotPop = rotated ? 1 : 1 + 0.3 * popT.get();
    return {
      transform: [
        { translateX: tx.get() + shakeX.get() },
        { translateY: ty.get() - bob },
        { rotate: rotation },
        { scale: popScale * robotPop },
      ],
      opacity: visibleOpacity * blink.get(),
      backgroundColor: finalColor,
    };
  });

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
      {rotated ? (
        <>
          {/* accesorio sobre el vértice superior: wrapper contra-rotado −45°
              (la esquina sup-izq local es el vértice visual del rombo) y con
              centro sobre la diagonal que apunta straight-up en pantalla */}
          <View
            style={{
              position: 'absolute',
              left: -size * 0.46,
              top: -size * 0.46,
              width: size * 0.36,
              height: size * 0.36,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ rotate: '-45deg' }],
            }}
          >
            <DroneAccessory variant={variant} size={size} />
          </View>
          <View style={ledWrap}>
            <DroneLed variant={variant} size={size} />
          </View>
        </>
      ) : (
        <>
          {/* luz de antena del robot (beacon): dorada en modo powered */}
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: size * 0.42,
                top: size * 0.07,
                width: size * 0.16,
                height: size * 0.16,
                borderRadius: size * 0.08,
              },
              lightStyle,
            ]}
          />
          {/* franja del robot aspiradora (cepillo frontal) */}
          <View
            style={{
              position: 'absolute',
              left: size * 0.18,
              top: size * 0.7,
              width: size * 0.64,
              height: size * 0.14,
              borderRadius: size * 0.07,
              backgroundColor: DARK,
            }}
          />
        </>
      )}
    </Animated.View>
  );
});

const ledWrap = {
  position: 'absolute' as const,
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

export interface EntitiesHandle {
  present(snapshot: WorldSnapshot): void;
  onEvent(event: EntityEvent): void;
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
          moving: snapshot.robot.dir !== null,
          dir: snapshot.robot.dir,
        });
        snapshot.drones.forEach((drone, i) => {
          droneRefs[i].current?.present({
            x: drone.x,
            y: drone.y,
            powered: drone.powered,
            hidden: drone.mode === 'eaten',
            moving: (drone.mode === 'roaming' || drone.mode === 'exiting') && drone.dir !== null,
            powerFraction: snapshot.powerFraction,
          });
        });
      },
      onEvent(event) {
        if (event.kind === 'droneEaten') {
          droneRefs[event.id]?.current?.pop();
          robotRef.current?.pop(); // pulso del robot al barer (combo)
        } else if (event.kind === 'robotCaught') {
          robotRef.current?.shake();
        } else if (event.kind === 'levelWin') {
          robotRef.current?.winPulse();
        } else {
          robotRef.current?.loseFlash();
        }
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
            scale={DRONE_TUNE[i].scale}
            rotated
            variant={i}
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
