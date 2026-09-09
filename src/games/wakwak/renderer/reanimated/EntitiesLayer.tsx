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
 * Personalidad (PLAN-WAK-POLISH F3, diseño APROBADO con el usuario en
 * /wakwak-preview — propuesta borrame convertida en componentes): cada drone
 * es un cuerpo CUADRADO redondeado con banda de luz superior, capucha con
 * ranura, asas laterales oscuras y visor negro con expresión FIJA propia
 * (Cazador=cejas enojadas, Emboscador=ojo-lente, Caprichoso=ojo lateral,
 * Tímido=sonrisa cerrada + marcas de susto). Los ojos NO siguen la dirección
 * (resguardo legal). El robot es la aspiradora (círculo top-down con placa,
 * botón-beacon, banda frontal con ojitos) y rota hacia su dirección
 * (withTiming 120° solo al CAMBIAR, guard lastDir — nunca por frame).
 *
 * Power (lenguaje del juego): los drones se APAGAN (cuerpo slate + detalles
 * oscuros) y parpadean al expirar; el robot se ENCIENDE (cuerpo dorado como
 * las súper baterías + botón brillante).
 */

export const ROBOT_COLOR = '#E7ECF2'; // aspiradora aprobada (borrame)
export const POWERED_ROBOT_COLOR = '#FDE047'; // encendido: dorado súper
const POWERED_DRONE_COLOR = '#475569'; // apagados en modo power
const POWERED_DRONE_DARK = '#334155'; // capucha/asas de drones apagados
const HURT_COLOR = '#FB7185';
const DARK = '#0B1220'; // visor + banda frontal
const DRONE_COLORS = ['#F97316', '#A78BFA', '#38BDF8', '#FB7185'] as const;
const DRONE_DARKS = ['#9A3412', '#6D28D9', '#0369A1', '#BE123C'] as const;

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

/** Expresión fija del drone dentro del visor (los ojos NO siguen dirección). */
function DroneFace({ variant, size }: { variant: number; size: number }) {
  const s = size;
  switch (variant) {
    case 0: // Cazador: dos cejas enojadas (barras blancas en V invertida)
      return (
        <View style={{ flexDirection: 'row', gap: s * 0.055 }}>
          <View style={{ width: s * 0.15, height: s * 0.07, borderRadius: s * 0.035, backgroundColor: '#F8FAFC', transform: [{ rotate: '22deg' }] }} />
          <View style={{ width: s * 0.15, height: s * 0.07, borderRadius: s * 0.035, backgroundColor: '#F8FAFC', transform: [{ rotate: '-22deg' }] }} />
        </View>
      );
    case 1: // Emboscador: ojo-lente grande (blanco + pupila + brillo central)
      return (
        <View style={{ width: s * 0.17, height: s * 0.17, borderRadius: s * 0.085, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.095, height: s * 0.095, borderRadius: s * 0.047, backgroundColor: DARK, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: s * 0.03, height: s * 0.03, borderRadius: s * 0.015, backgroundColor: '#F8FAFC' }} />
          </View>
        </View>
      );
    case 2: // Caprichoso: ojo único mirando de costado (iris + pupila excéntricos)
      return (
        <View style={{ width: s * 0.2, height: s * 0.14, borderRadius: s * 0.07, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.1, height: s * 0.1, borderRadius: s * 0.05, backgroundColor: DRONE_COLORS[2], alignItems: 'center', justifyContent: 'center', transform: [{ translateX: s * 0.03 }] }}>
            <View style={{ width: s * 0.05, height: s * 0.05, borderRadius: s * 0.025, backgroundColor: DARK, transform: [{ translateX: s * 0.016 }] }} />
          </View>
        </View>
      );
    default: // Tímido: sonrisa cerrada (semicírculo blanco) — ojos apretados
      return (
        <View style={{ width: s * 0.2, height: s * 0.1, borderBottomLeftRadius: s * 0.1, borderBottomRightRadius: s * 0.1, backgroundColor: '#F8FAFC' }} />
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
    // botón-beacon del robot: tenue normal, dorado en modo powered
    backgroundColor: interpolateColor(powered.get(), [0, 1], ['#334155', '#FDE047']),
  }));

  // CUERPO: color personalidad → powered (robot encendido / drones apagados)
  // → hurt (flash rosa). El robot SIEMPRE tiene hiddenColor; drones también.
  const bodyColor = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      hurt.get(),
      [0, 1],
      [interpolateColor(powered.get(), [0, 1], [color, hiddenColor ?? color]), HURT_COLOR],
    ),
  }));

  // Capucha/asas del drone: variante oscura → apagado (no flashean con hurt,
  // precedente de los accesorios).
  const shadeColor = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(powered.get(), [0, 1], [DRONE_DARKS[variant], POWERED_DRONE_DARK]),
    borderBottomColor: interpolateColor(powered.get(), [0, 1], [DRONE_DARKS[variant], POWERED_DRONE_DARK]),
  }));

  const animatedStyle = useAnimatedStyle(() => {
    const hiddenOpacity = opacity.get();
    // el pop mantiene visible al drone un instante después del `hidden`
    const visibleOpacity = Math.max(hiddenOpacity, popT.get());
    // bob del robot al avanzar; wobble propio de cada drone (loops UI thread)
    const bob = idle.get() * moving.get() * cellSize * 0.05;
    // drones: wobble alrededor de 0 (cuerpo cuadrado, sin base 45° del rombo)
    const rotation = rotated
      ? `${idle.get() * wobble.wobbleDeg}deg`
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
        },
        animatedStyle,
      ]}
    >
      {rotated ? (
        <>
          {/* capucha con ranura, apoyada en el borde del cuerpo */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: (size - size * 0.34) / 2,
              width: size * 0.34,
              height: size * 0.16,
              alignItems: 'center',
            }}
          >
            <Animated.View
              style={[
                {
                  width: 0,
                  height: 0,
                  borderLeftWidth: size * 0.17,
                  borderRightWidth: size * 0.17,
                  borderBottomWidth: size * 0.15,
                  borderLeftColor: 'transparent',
                  borderRightColor: 'transparent',
                },
                shadeColor,
              ]}
            />
            <View
              style={{
                position: 'absolute',
                top: size * 0.05,
                width: size * 0.04,
                height: size * 0.07,
                borderRadius: size * 0.02,
                backgroundColor: DARK,
                opacity: 0.55,
              }}
            />
          </View>
          {/* asas laterales (a la altura media del cuerpo) */}
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: -size * 0.055,
                top: size * 0.41,
                width: size * 0.14,
                height: size * 0.2,
                borderRadius: size * 0.06,
              },
              shadeColor,
            ]}
          />
          <Animated.View
            style={[
              {
                position: 'absolute',
                right: -size * 0.055,
                top: size * 0.41,
                width: size * 0.14,
                height: size * 0.2,
                borderRadius: size * 0.06,
              },
              shadeColor,
            ]}
          />
          {/* cuerpo cuadrado redondeado: banda de luz + visor con expresión */}
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: size * 0.16,
                left: (size - size * 0.96) / 2,
                width: size * 0.96,
                height: size * 0.7,
                borderRadius: size * 0.15,
                overflow: 'hidden',
              },
              bodyColor,
            ]}
          >
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: size * 0.24,
                backgroundColor: 'rgba(255,255,255,0.32)',
                borderBottomLeftRadius: size * 0.12,
                borderBottomRightRadius: size * 0.12,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: (size * 0.96 - size * 0.68) / 2,
                top: size * 0.32,
                width: size * 0.68,
                height: size * 0.26,
                borderRadius: size * 0.13,
                backgroundColor: DARK,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <DroneFace variant={variant} size={size} />
            </View>
          </Animated.View>
          {/* Tímido: marcas de susto arriba a la derecha (fuera del cuerpo) */}
          {variant === 3 ? (
            <View style={{ position: 'absolute', right: -size * 0.02, top: size * 0.04, width: size * 0.2, height: size * 0.14 }}>
              <View style={{ position: 'absolute', right: size * 0.06, top: 0, width: size * 0.11, height: size * 0.03, borderRadius: size * 0.015, backgroundColor: '#FDA4AF', transform: [{ rotate: '-38deg' }] }} />
              <View style={{ position: 'absolute', right: 0, top: size * 0.055, width: size * 0.09, height: size * 0.03, borderRadius: size * 0.015, backgroundColor: '#FDA4AF', transform: [{ rotate: '-72deg' }] }} />
            </View>
          ) : null}
        </>
      ) : (
        <>
          {/* cuerpo: círculo top-down de la aspiradora (recorta la banda) */}
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: 0,
                top: 0,
                width: size,
                height: size,
                borderRadius,
                overflow: 'hidden',
              },
              bodyColor,
            ]}
          >
            {/* placa superior */}
            <View
              style={{
                position: 'absolute',
                left: size * 0.09,
                top: size * 0.09,
                width: size * 0.82,
                height: size * 0.82,
                borderRadius: size * 0.41,
                backgroundColor: 'rgba(255,255,255,0.5)',
              }}
            />
            {/* botón-beacon: dorado en modo powered */}
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: size * 0.43,
                  top: size * 0.43,
                  width: size * 0.14,
                  height: size * 0.14,
                  borderRadius: size * 0.07,
                },
                lightStyle,
              ]}
            />
            {/* puerto lateral */}
            <View
              style={{
                position: 'absolute',
                left: size * 0.012,
                top: size * 0.46,
                width: size * 0.028,
                height: size * 0.07,
                borderRadius: size * 0.014,
                backgroundColor: 'rgba(0,0,0,0.25)',
              }}
            />
            {/* banda frontal con ojitos (el frente local es ABAJO) */}
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: size * 0.21,
                backgroundColor: '#141E2E',
              }}
            />
            <View style={{ position: 'absolute', bottom: size * 0.06, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: size * 0.06 }}>
              <View style={{ width: size * 0.07, height: size * 0.07, borderRadius: size * 0.035, backgroundColor: '#F8FAFC' }} />
              <View style={{ width: size * 0.07, height: size * 0.07, borderRadius: size * 0.035, backgroundColor: '#F8FAFC' }} />
            </View>
          </Animated.View>
        </>
      )}
    </Animated.View>
  );
});

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
          borderRadius={cellSize * 0.39} // círculo de la aspiradora (0.78/2)
          scale={0.78}
          accessibilityLabel="wakwak-robot"
        />
      </View>
    );
  },
);
