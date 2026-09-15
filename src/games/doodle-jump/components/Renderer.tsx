/**
 * Capa de entidades animadas de Doodle Jump (T6, D8/D13): pool FIJO de
 * nodos animados por shared values. El loop rAF de la pantalla escribe
 * posiciones cada frame leyendo `getGame()` — cero re-renders React por
 * frame; React solo re-renderiza cuando CAMBIA el set de entidades
 * (spawn/limpieza, ~1-2 Hz). API `.get()/.set()`-safe: los valores se
 * escriben solo desde handlers del loop, nunca durante render.
 *
 * Identidad visual (D13): doodle sketch con Views — papel cuadriculado,
 * entidades dibujadas con shapes/text, paleta propia del juego.
 */

import { memo, useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { platformX, monsterX, type Bullet, type Monster, type Platform } from '../engine/rules';
import {
  DOODLER_H,
  DOODLER_W,
  MONSTER_H,
  MONSTER_W,
  PLATFORM_H,
  PLATFORM_W,
  WORLD_H,
  WORLD_W,
} from '../engine/tuning';

export const PLATFORM_POOL = 22;
export const MONSTER_POOL = 4;
export const BULLET_POOL = 3;

export interface Slot {
  x: SharedValue<number>;
  y: SharedValue<number>;
  opacity: SharedValue<number>;
}

export interface DoodlerSlot {
  x: SharedValue<number>;
  y: SharedValue<number>;
  flip: SharedValue<number>;
  opacity: SharedValue<number>;
  twinX: SharedValue<number>;
  twinY: SharedValue<number>;
  twinOpacity: SharedValue<number>;
}

export interface SlotGroups {
  platforms: (Slot | null)[];
  monsters: (Slot | null)[];
  bullets: (Slot | null)[];
  doodler: { current: DoodlerSlot | null };
}

/** Paleta doodle (D13): plataformas con la semántica de color del original. */
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
          style={[styles.spring, { width: w * 0.45, height: h * 1.3, top: -h * 1.3 }]}
          pointerEvents="none"
        >
          <View style={[styles.springBar, { width: w * 0.45 }]} />
          <View style={[styles.springBar, { width: w * 0.45 }]} />
        </View>
      ) : null}
      {entity?.hat ? <Text style={[styles.hat, { fontSize: h * 2.2, top: -h * 2.4 }]}>🧢</Text> : null}
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
  return (
    <SlotNode
      slots={slots}
      index={index}
      scale={scale}
      width={6}
      height={6}
      color={INK}
      round
    />
  );
});

/**
 * Doodler + copia de wrap: durante el cruce de borde se dibujan DOS copias
 * (riesgo §6 — sin "teletransporte" visual). `flip` invierte el cuerpo
 * según `facing`. Los ojos dejan claro hacia dónde mira.
 */
const DoodlerNode = memo(function DoodlerNode({
  slot,
  scale,
}: {
  slot: { current: DoodlerSlot | null };
  scale: number;
}) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const flip = useSharedValue(1);
  const opacity = useSharedValue(0);
  const twinX = useSharedValue(0);
  const twinY = useSharedValue(0);
  const twinOpacity = useSharedValue(0);
  useEffect(() => {
    slot.current = { x, y, flip, opacity, twinX, twinY, twinOpacity };
    return () => {
      slot.current = null;
    };
  }, [slot, x, y, flip, opacity, twinX, twinY, twinOpacity]);

  const w = DOODLER_W * scale;
  const h = DOODLER_H * scale;
  const body = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scaleX: flip.value }],
    opacity: opacity.value,
  }));
  const twin = useAnimatedStyle(() => ({
    transform: [{ translateX: twinX.value }, { translateY: twinY.value }, { scaleX: flip.value }],
    opacity: twinOpacity.value,
  }));

  return (
    <>
      <Animated.View
        accessibilityLabel="doodle-jump-doodler"
        style={[styles.entity, body, { width: w, height: h, backgroundColor: '#7CB342', borderRadius: w * 0.4 }]}
      >
        <View style={styles.body}>
          <View style={[styles.eyePair, { width: w * 0.62, height: h * 0.42 }]}>
            <View style={[styles.doodlerEye, { width: w * 0.22, height: h * 0.3 }]}>
              <View style={[styles.pupil, { width: w * 0.1, height: h * 0.14 }]} />
            </View>
            <View style={[styles.doodlerEye, { width: w * 0.22, height: h * 0.3 }]}>
              <View style={[styles.pupil, { width: w * 0.1, height: h * 0.14 }]} />
            </View>
          </View>
        </View>
      </Animated.View>
      <Animated.View
        style={[
          styles.entity,
          twin,
          { width: w, height: h, backgroundColor: '#7CB342', borderRadius: w * 0.4 },
        ]}
        pointerEvents="none"
      >
        <View style={styles.body}>
          <View style={[styles.eyePair, { width: w * 0.62, height: h * 0.42 }]}>
            <View style={[styles.doodlerEye, { width: w * 0.22, height: h * 0.3 }]}>
              <View style={[styles.pupil, { width: w * 0.1, height: h * 0.14 }]} />
            </View>
            <View style={[styles.doodlerEye, { width: w * 0.22, height: h * 0.3 }]}>
              <View style={[styles.pupil, { width: w * 0.1, height: h * 0.14 }]} />
            </View>
          </View>
        </View>
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
      <DoodlerNode slot={slots.doodler} scale={scale} />
    </>
  );
}

/** Escala del mundo: `min(cw / WORLD_W, ch / WORLD_H)` (D5) — la calcula la pantalla. */
export function computeScale(width: number, height: number): number {
  return Math.max(0, Math.min(width / WORLD_W, height / WORLD_H));
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
  hat: {
    position: 'absolute',
    left: '20%',
  },
  eyeRow: {
    position: 'absolute',
    top: '22%',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: '18%',
  },
  eye: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyePair: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  doodlerEye: {
    backgroundColor: '#FFFFFF',
    borderRadius: 99,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pupil: {
    backgroundColor: '#263238',
    borderRadius: 99,
  },
});
