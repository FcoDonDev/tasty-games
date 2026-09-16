/**
 * Capa de entidades animadas de Robo Jump (T6, D8/D13): pool FIJO de
 * nodos animados por shared values. El loop rAF de la pantalla escribe
 * posiciones cada frame leyendo `getGame()` — cero re-renders React por
 * frame; React solo re-renderiza cuando CAMBIA el set de entidades
 * (spawn/limpieza, ~1-2 Hz). API `.get()/.set()`-safe: los valores se
 * escriben solo desde handlers del loop, nunca durante render.
 *
 * Identidad visual (D13): sketch con Views — papel cuadriculado,
 * entidades dibujadas con shapes/text, paleta propia del juego.
 */

import { memo, useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { platformX, monsterX, type Bullet, type Monster, type Platform } from '../engine/rules';
import {
  ROBO_H,
  ROBO_W,
  MAX_BULLETS,
  MAX_MONSTERS,
  MONSTER_H,
  MONSTER_W,
  PLATFORM_H,
  PLATFORM_POOL,
  PLATFORM_W,
  WORLD_H,
  WORLD_W,
} from '../engine/tuning';

/** Capacidad de render derivada del tuning (candea tuning.test.ts, R0/R6). */
export { PLATFORM_POOL };
export const MONSTER_POOL = MAX_MONSTERS + 1;
export const BULLET_POOL = MAX_BULLETS;

export interface Slot {
  x: SharedValue<number>;
  y: SharedValue<number>;
  opacity: SharedValue<number>;
}

export interface RoboSlot {
  x: SharedValue<number>;
  y: SharedValue<number>;
  flip: SharedValue<number>;
  opacity: SharedValue<number>;
  /** D15: 1 con propeller activo (hatMs > 0), 0 si no. */
  hatOpacity: SharedValue<number>;
  twinX: SharedValue<number>;
  twinY: SharedValue<number>;
  twinOpacity: SharedValue<number>;
}

export interface SlotGroups {
  platforms: (Slot | null)[];
  monsters: (Slot | null)[];
  bullets: (Slot | null)[];
  robo: { current: RoboSlot | null };
}

/** Paleta sketch (D13): plataformas con la semántica de color del original. */
const PLATFORM_COLOR: Record<string, string> = {
  green: '#5DBB63',
  blue: '#42A5F5',
  brown: '#A1887F',
};
const MONSTER_COLOR = { static: '#EC407A', mobile: '#AB47BC' } as const;
const PAPER = '#FFFDF5';
const INK = '#3E3A2E';

function useSlotRegistration(
  slots: (Slot | null)[],
  index: number,
  x: SharedValue<number>,
  y: SharedValue<number>,
  opacity: SharedValue<number>,
): void {
  useEffect(() => {
    slots[index] = { x, y, opacity };
    return () => {
      slots[index] = null;
    };
  }, [slots, index, x, y, opacity]);
}

function useSlotStyle(x: SharedValue<number>, y: SharedValue<number>, opacity: SharedValue<number>) {
  return useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
    opacity: opacity.value,
  }));
}

interface SlotNodeProps {
  slots: (Slot | null)[];
  index: number;
  scale: number;
  width: number;
  height: number;
  color: string;
  round?: boolean;
  children?: ReactNode;
}

/** Nodo genérico del pool: registra sus shared values y dibuja su entidad. */
function SlotNode({ slots, index, scale, width, height, color, round, children }: SlotNodeProps) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const opacity = useSharedValue(0);
  useSlotRegistration(slots, index, x, y, opacity);
  const anim = useSlotStyle(x, y, opacity);
  return (
    <Animated.View
      style={[
        styles.entity,
        anim,
        {
          width: width * scale,
          height: height * scale,
          backgroundColor: color,
          borderRadius: round ? (width * scale) / 2 : height * scale / 3,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const PlatformSlot = memo(function PlatformSlot({
  slots,
  index,
  entity,
  scale,
}: {
  slots: (Slot | null)[];
  index: number;
  entity: Platform | null;
  scale: number;
}) {
  const kind = entity?.kind ?? 'green';
  const w = 64 * scale;
  const h = 12 * scale;
  return (
    <SlotNode
      slots={slots}
      index={index}
      scale={scale}
      width={64}
      height={12}
      color={PLATFORM_COLOR[kind]}
    >
      {entity?.spring ? (
        <View
          style={[styles.spring, { width: w * 0.45, height: h * 1.2, top: -h * 1.2 }]}
          pointerEvents="none"
        >
          <View style={[styles.springBar, { width: w * 0.45 }]} />
          <View style={[styles.springBar, { width: w * 0.45 }]} />
        </View>
      ) : null}
      {entity?.hat ? (
        // Sombrero propeller dibujado con Views (D13/ui-ux: sin emoji —
        // glifo de fuente inconsistente entre plataformas).
        <View
          style={[styles.hat, { top: -h * 2.2 }]}
          pointerEvents="none"
        >
          <View style={[styles.hatBlade, { width: w * 0.62, height: 2.5 * scale }]} />
          <View style={[styles.hatCap, { width: w * 0.4, height: h * 1.2 }]} />
        </View>
      ) : null}
    </SlotNode>
  );
});

const MonsterSlot = memo(function MonsterSlot({
  slots,
  index,
  entity,
  scale,
}: {
  slots: (Slot | null)[];
  index: number;
  entity: Monster | null;
  scale: number;
}) {
  const kind = entity?.kind ?? 'static';
  return (
    <SlotNode
      slots={slots}
      index={index}
      scale={scale}
      width={26}
      height={26}
      color={MONSTER_COLOR[kind]}
      round
    >
      <View style={styles.eyeRow} pointerEvents="none">
        <View style={styles.eye} />
        <View style={styles.eye} />
      </View>
    </SlotNode>
  );
});

const BulletSlot = memo(function BulletSlot({
  slots,
  index,
  entity,
  scale,
}: {
  slots: (Slot | null)[];
  index: number;
  entity: Bullet | null;
  scale: number;
}) {
  // "Nose ball" (D3): elipse horizontal — se lea como proyectil lanzado.
  return (
    <SlotNode
      slots={slots}
      index={index}
      scale={scale}
      width={8}
      height={5}
      color={INK}
      round
    />
  );
});

/**
 * Robo + copia de wrap: durante el cruce de borde se dibujan DOS copias
 * (riesgo §6 — sin "teletransporte" visual). `flip` invierte el cuerpo
 * según `facing`. Los ojos dejan claro hacia dónde mira.
 */
const RoboNode = memo(function RoboNode({
  slot,
  scale,
}: {
  slot: { current: RoboSlot | null };
  scale: number;
}) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const flip = useSharedValue(1);
  const opacity = useSharedValue(0);
  const hatOpacity = useSharedValue(0);
  const twinX = useSharedValue(0);
  const twinY = useSharedValue(0);
  const twinOpacity = useSharedValue(0);
  useEffect(() => {
    slot.current = { x, y, flip, opacity, hatOpacity, twinX, twinY, twinOpacity };
    return () => {
      slot.current = null;
    };
  }, [slot, x, y, flip, opacity, hatOpacity, twinX, twinY, twinOpacity]);

  const w = ROBO_W * scale;
  const h = ROBO_H * scale;
  const body = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scaleX: flip.value }],
    opacity: opacity.value,
  }));
  const twin = useAnimatedStyle(() => ({
    transform: [{ translateX: twinX.value }, { translateY: twinY.value }, { scaleX: flip.value }],
    opacity: twinOpacity.value,
  }));
  // Propeller hat (D15): flotando sobre la cabeza, hereda la opacidad de su
  // copia (principal/twin) × hatOpacity — visible solo mientras dura el boost.
  const hat = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value - h * 0.62 },
      { scaleX: flip.value },
    ],
    opacity: hatOpacity.value * opacity.value,
  }));
  const hatTwin = useAnimatedStyle(() => ({
    transform: [
      { translateX: twinX.value },
      { translateY: twinY.value - h * 0.62 },
      { scaleX: flip.value },
    ],
    opacity: hatOpacity.value * twinOpacity.value,
  }));

  const hatVisual = (
    <View style={styles.roboHat} pointerEvents="none">
      <View style={[styles.hatBlade, { width: w * 0.95, height: Math.max(2, h * 0.14) }]} />
      <View style={[styles.hatCap, { width: w * 0.55, height: h * 0.42 }]} />
    </View>
  );

  const robotVisual = (
    <>
      {/* Antena (identidad robo): punta encendida + varilla. */}
      <View style={[styles.antenna, { top: -h * 0.45 }]} pointerEvents="none">
        <View style={[styles.antennaTip, { width: w * 0.18, height: w * 0.18, borderRadius: w * 0.09 }]} />
        <View style={[styles.antennaRod, { width: Math.max(1.5, w * 0.07), height: h * 0.32 }]} />
      </View>
      {/* Visor: pantalla oscura con ojos cian encendidos. */}
      <View style={styles.body}>
        <View style={[styles.visor, { width: w * 0.72, height: h * 0.5 }]}>
          <View style={[styles.visorEye, { width: w * 0.16, height: h * 0.16 }]} />
          <View style={[styles.visorEye, { width: w * 0.16, height: h * 0.16 }]} />
        </View>
      </View>
    </>
  );

  return (
    <>
      <Animated.View
        accessibilityLabel="robo-jump-robot"
        style={[styles.entity, body, { width: w, height: h, backgroundColor: '#B0BEC5', borderRadius: w * 0.2 }]}
      >
        {robotVisual}
      </Animated.View>
      <Animated.View style={[styles.entity, hat, { width: w, height: h }]} pointerEvents="none">
        {hatVisual}
      </Animated.View>
      <Animated.View
        style={[
          styles.entity,
          twin,
          { width: w, height: h, backgroundColor: '#B0BEC5', borderRadius: w * 0.2 },
        ]}
        pointerEvents="none"
      >
        {robotVisual}
      </Animated.View>
      <Animated.View style={[styles.entity, hatTwin, { width: w, height: h }]} pointerEvents="none">
        {hatVisual}
      </Animated.View>
    </>
  );
});

export function Renderer({
  slots,
  platforms,
  monsters,
  bullets,
  scale,
}: {
  slots: SlotGroups;
  platforms: (Platform | null)[];
  monsters: (Monster | null)[];
  bullets: (Bullet | null)[];
  scale: number;
}) {
  return (
    <>
      {Array.from({ length: PLATFORM_POOL }, (_, i) => (
        <PlatformSlot key={`p${i}`} slots={slots.platforms} index={i} entity={platforms[i] ?? null} scale={scale} />
      ))}
      {Array.from({ length: MONSTER_POOL }, (_, i) => (
        <MonsterSlot key={`m${i}`} slots={slots.monsters} index={i} entity={monsters[i] ?? null} scale={scale} />
      ))}
      {Array.from({ length: BULLET_POOL }, (_, i) => (
        <BulletSlot key={`b${i}`} slots={slots.bullets} index={i} entity={bullets[i] ?? null} scale={scale} />
      ))}
      <RoboNode slot={slots.robo} scale={scale} />
    </>
  );
}

const styles = StyleSheet.create({
  entity: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  spring: {
    position: 'absolute',
    left: '28%',
    gap: 2,
    justifyContent: 'flex-end',
  },
  springBar: {
    height: 2,
    borderRadius: 1,
    backgroundColor: '#90A4AE',
  },
  eyeRow: {
    position: 'absolute',
    top: '22%',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  eye: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  hat: {
    position: 'absolute',
    left: '30%',
    alignItems: 'center',
  },
  hatBlade: {
    borderRadius: 2,
    backgroundColor: '#90A4AE',
  },
  hatCap: {
    backgroundColor: '#EC407A',
    borderTopLeftRadius: 99,
    borderTopRightRadius: 99,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  roboHat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  antenna: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  antennaRod: {
    backgroundColor: '#78909C',
    borderRadius: 2,
  },
  antennaTip: {
    backgroundColor: '#EF5350',
  },
  visor: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#263238',
    borderRadius: 3,
  },
  visorEye: {
    backgroundColor: '#00E5FF',
    borderRadius: 99,
  },
});
