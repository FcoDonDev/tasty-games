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
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
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
  /** D21: dirección de la mirada (-1 izq, 1 der), solo monstruos. */
  lookX?: SharedValue<number>;
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
  /** D20 (fase 5): juice de muerte por monstruo. */
  flash: SharedValue<number>;
  squashX: SharedValue<number>;
  squashY: SharedValue<number>;
  /** 1 = ojos ✕ (KO). */
  ko: SharedValue<number>;
  /** Progreso del tumbo 0→1 (giro + caída + fade, D20). */
  dead: SharedValue<number>;
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
  lookX?: SharedValue<number>,
): void {
  useEffect(() => {
    slots[index] = lookX ? { x, y, opacity, lookX } : { x, y, opacity };
    return () => {
      slots[index] = null;
    };
  }, [slots, index, x, y, opacity, lookX]);
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
  /** D21: shared value de mirada a registrar en el slot (monstruos). */
  lookX?: SharedValue<number>;
  children?: ReactNode;
}

/** Nodo genérico del pool: registra sus shared values y dibuja su entidad. */
function SlotNode({ slots, index, scale, width, height, color, round, lookX, children }: SlotNodeProps) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const opacity = useSharedValue(0);
  useSlotRegistration(slots, index, x, y, opacity, lookX);
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

/**
 * Monstruos con personalidad (D21, 100% render — cero gameplay):
 *  - estático: blob ancho con púas, ojos que SIGUEN al Robo (`lookX`,
 *    seteado en renderFrame), ceño fruncido, bob de respiración.
 *  - móvil: cuerpo compacto con 2 alas batiendo (~140 ms, ref. Fandom
 *    "rapidly flapping wings"), ojos pequeños que siguen.
 * Ambos parpadean con fase determinista por índice (sin Math.random).
 * Los loops self-driving arrancan al montar y se cancelan al desmontar;
 * reduced motion: siluetas estáticas sin loops.
 */
const MonsterSlot = memo(function MonsterSlot({
  slots,
  index,
  entity,
  scale,
  reduced,
}: {
  slots: (Slot | null)[];
  index: number;
  entity: Monster | null;
  scale: number;
  reduced: boolean;
}) {
  const kind = entity?.kind ?? 'static';
  const mobile = kind === 'mobile';
  const color = MONSTER_COLOR[kind];
  // D21: la mirada es un solo SV compartido por el slot (registro) y los
  // ojos (render) — lo crea el componente, lo escribe renderFrame.
  const lookX = useSharedValue(0);

  // Animaciones self-driving (gated por reduced motion): respiración,
  // parpadeo (fase por índice) y aleteo del volador.
  const bob = useSharedValue(0);
  const lid = useSharedValue(0);
  const wing = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    bob.set(
      withRepeat(
        withSequence(
          withTiming(-1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        true,
      ),
    );
    // Parpadeo: ciclo largo con fase por índice (determinista, sin rng).
    lid.set(
      withRepeat(
        withSequence(
          withDelay(index * 260, withTiming(1, { duration: 80 })),
          withTiming(0, { duration: 120 }),
          withDelay(2200, withTiming(0, { duration: 1 })),
        ),
        -1,
      ),
    );
    wing.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: 140, easing: Easing.inOut(Easing.quad) }),
          withTiming(-1, { duration: 140, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        true,
      ),
    );
    return () => {
      cancelAnimation(bob);
      cancelAnimation(lid);
      cancelAnimation(wing);
    };
  }, [bob, lid, wing, reduced, index]);

  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value * 2 * scale }],
  }));
  const lidStyle = useAnimatedStyle(() => ({ opacity: lid.value }));
  const wingLeft = useAnimatedStyle(() => ({
    transform: [{ rotate: `${wing.value * 26}deg` }],
  }));
  const wingRight = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-wing.value * 26}deg` }],
  }));

  const s = scale;
  const bodyW = (mobile ? 24 : 30) * s;
  const bodyH = (mobile ? 22 : 24) * s;
  const eyeSize = (mobile ? 4 : 4.5) * s;

  return (
    <SlotNode
      slots={slots}
      index={index}
      scale={scale}
      width={26}
      height={26}
      color="transparent"
      lookX={lookX}
    >
      {/* Contenido animado: respiración + silueta por tipo. */}
      <Animated.View style={[styles.monsterInner, bobStyle]}>
        {!mobile
          ? // Púas del estático (triángulos border-trick, D13).
            [0, 1, 2].map((i) => (
              <View
                key={i}
                style={[
                  styles.spike,
                  {
                    left: (5 + i * 9) * s,
                    bottom: 23 * s,
                    borderLeftWidth: 4 * s,
                    borderRightWidth: 4 * s,
                    borderBottomWidth: 6 * s,
                    borderBottomColor: color,
                  },
                ]}
              />
            ))
          : null}
        {mobile ? (
          <>
            <Animated.View
              style={[styles.wing, wingLeft, { left: -7 * s, bottom: 12 * s, width: 8 * s, height: 5 * s, backgroundColor: color }]}
              pointerEvents="none"
            />
            <Animated.View
              style={[styles.wing, wingRight, { right: -7 * s, bottom: 12 * s, width: 8 * s, height: 5 * s, backgroundColor: color }]}
              pointerEvents="none"
            />
          </>
        ) : null}
        {/* Cuerpo: blob (ancho/roundeado si estático, compacto si móvil). */}
        <View
          style={{
            position: 'absolute',
            left: (13 * s - bodyW / 2) - (mobile ? 0 : 2 * s),
            bottom: mobile ? 0 : 1 * s,
            width: bodyW,
            height: bodyH,
            backgroundColor: color,
            borderRadius: mobile ? bodyW / 2 : bodyH * 0.45,
          }}
          pointerEvents="none"
        >
          {/* Ceño fruncido (estático): dos barritas oscuras sobre los ojos. */}
          {!mobile ? (
            <View style={[styles.browRow, { top: bodyH * 0.16 }]} pointerEvents="none">
              <View style={[styles.brow, { width: 7 * s, height: 2 * s, transform: [{ rotate: '10deg' }] }]} />
              <View style={[styles.brow, { width: 7 * s, height: 2 * s, transform: [{ rotate: '-10deg' }] }]} />
            </View>
          ) : null}
          {/* Ojos: siguen al Robo (lookX del slot, D21) + parpadeo. */}
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: bodyH * 0.32,
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 3.5 * s,
            }}
            pointerEvents="none"
          >
            <MonsterEye lookX={lookX} scale={scale} size={eyeSize} />
            <MonsterEye lookX={lookX} scale={scale} size={eyeSize} />
          </View>
          {/* Párpado: tapa los ojos en su fase del ciclo. */}
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: bodyW * 0.22,
                right: bodyW * 0.22,
                top: bodyH * 0.32,
                height: eyeSize + 2,
                borderRadius: 2,
                backgroundColor: color,
              },
              lidStyle,
            ]}
            pointerEvents="none"
          />
        </View>
      </Animated.View>
    </SlotNode>
  );
});

/** Ojo del monstruo: pupila blanca que se desplaza según `lookX` (D21). */
function MonsterEye({
  lookX,
  scale,
  size,
}: {
  lookX: SharedValue<number>;
  scale: number;
  size: number;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: lookX.value * 2.5 * scale }],
  }));
  return (
    <Animated.View style={style} pointerEvents="none">
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#FFFFFF' }} />
    </Animated.View>
  );
}

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
  const flash = useSharedValue(0);
  const squashX = useSharedValue(1);
  const squashY = useSharedValue(1);
  const ko = useSharedValue(0);
  const dead = useSharedValue(0);
  useEffect(() => {
    slot.current = { x, y, flip, opacity, hatOpacity, twinX, twinY, twinOpacity, flash, squashX, squashY, ko, dead };
    return () => {
      slot.current = null;
    };
  }, [slot, x, y, flip, opacity, hatOpacity, twinX, twinY, twinOpacity, flash, squashX, squashY, ko, dead]);

  // D22: hélice girando — rotación lineal continua en UI thread; el loop
  // corre SIEMPRE (nodo chico; la visibilidad la da hatOpacity). Cancel al
  // desmontar (riesgo §6: loops infinitos).
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.set(withRepeat(withTiming(360, { duration: 160, easing: Easing.linear }), -1));
    return () => {
      cancelAnimation(spin);
    };
  }, [spin]);

  const w = ROBO_W * scale;
  const h = ROBO_H * scale;
  const body = useAnimatedStyle(() => {
    const d = dead.value;
    // D20: squash del impacto + tumbo (giro y caída acelerada, easeIn) con
    // fade en la segunda mitad. La opacidad base la sigue escribiendo
    // renderFrame — el fade va multiplicado, nunca en el mismo SV.
    const fade = 1 - Math.max(0, (d - 0.5) / 0.5);
    return {
      transform: [
        { translateX: x.value },
        { translateY: y.value + d * d * (WORLD_H * scale + 60 * scale) },
        { scaleX: flip.value * squashX.value },
        { scaleY: squashY.value },
        { rotate: `${-540 * d}deg` },
      ],
      opacity: opacity.value * fade,
    };
  });
  const twin = useAnimatedStyle(() => ({
    transform: [{ translateX: twinX.value }, { translateY: twinY.value }, { scaleX: flip.value }],
    opacity: twinOpacity.value,
  }));
  // Propeller hat (D15): flotando sobre la cabeza, hereda la opacidad de su
  // copia (principal/twin) × hatOpacity — visible solo mientras dura el boost.
  const hat = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value + dead.value * dead.value * (WORLD_H * scale + 60 * scale) - h * 0.62 },
      { scaleX: flip.value },
      { rotate: `${-540 * dead.value}deg` },
    ],
    opacity: hatOpacity.value * opacity.value * (1 - Math.max(0, (dead.value - 0.5) / 0.5)),
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
      {/* Visor: pantalla oscura con ojos cian encendidos (o ✕ al morir, D20). */}
      <View style={styles.body}>
        <View style={[styles.visor, { width: w * 0.72, height: h * 0.5 }]}>
          <Animated.View style={[styles.visorEyes, { opacity: 1 - ko.value }]} pointerEvents="none">
            <View style={[styles.visorEye, { width: w * 0.16, height: h * 0.16 }]} />
            <View style={[styles.visorEye, { width: w * 0.16, height: h * 0.16 }]} />
          </Animated.View>
          <Animated.View style={[styles.visorEyes, styles.visorKo, { opacity: ko.value }]} pointerEvents="none">
            <View style={[styles.visorKoEye, { width: w * 0.18, height: Math.max(1.5, h * 0.05) }]} />
            <View style={[styles.visorKoEye, { width: Math.max(1.5, h * 0.05), height: w * 0.18 }]} />
            <View style={[styles.visorKoEye, { width: w * 0.18, height: Math.max(1.5, h * 0.05) }]} />
            <View style={[styles.visorKoEye, { width: Math.max(1.5, h * 0.05), height: w * 0.18 }]} />
          </Animated.View>
        </View>
      </View>
      {/* Flash blanco del impacto (D20): superpuesto al cuerpo completo. */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.flashLayer, { borderRadius: w * 0.2, opacity: flash.value }]} pointerEvents="none" />
    </>
  );

  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

  return (
    <>
      <Animated.View
        accessibilityLabel="robo-jump-robot"
        style={[styles.entity, body, { width: w, height: h, backgroundColor: '#B0BEC5', borderRadius: w * 0.2 }]}
      >
        {robotVisual}
      </Animated.View>
      <Animated.View style={[styles.entity, hat, { width: w, height: h }]} pointerEvents="none">
        <View style={styles.roboHat} pointerEvents="none">
          <Animated.View style={spinStyle}>
            <View style={[styles.hatBlade, { width: w * 0.95, height: Math.max(2, h * 0.14) }]} />
          </Animated.View>
          <View style={[styles.hatCap, { width: w * 0.55, height: h * 0.42 }]} />
        </View>
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
  reduced = false,
}: {
  slots: SlotGroups;
  platforms: (Platform | null)[];
  monsters: (Monster | null)[];
  bullets: (Bullet | null)[];
  scale: number;
  /** D21/D22: apaga los loops self-driving de monstruos (spin de hélice
   * siempre corre — invisible con hatOpacity 0 y no requiere gate). */
  reduced?: boolean;
}) {
  return (
    <>
      {Array.from({ length: PLATFORM_POOL }, (_, i) => (
        <PlatformSlot key={`p${i}`} slots={slots.platforms} index={i} entity={platforms[i] ?? null} scale={scale} />
      ))}
      {Array.from({ length: MONSTER_POOL }, (_, i) => (
        <MonsterSlot key={`m${i}`} slots={slots.monsters} index={i} entity={monsters[i] ?? null} scale={scale} reduced={reduced} />
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
  monsterInner: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  spike: {
    position: 'absolute',
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  wing: {
    position: 'absolute',
    borderRadius: 3,
  },
  browRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  brow: {
    backgroundColor: '#263238',
    borderRadius: 2,
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
  visorEyes: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  visorKo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 0,
  },
  visorEye: {
    backgroundColor: '#00E5FF',
    borderRadius: 99,
  },
  visorKoEye: {
    backgroundColor: '#00E5FF',
  },
  flashLayer: {
    backgroundColor: '#FFFFFF',
  },
});
