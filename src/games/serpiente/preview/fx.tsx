import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { colOfPreview, rowOfPreview } from './mock';

/**
 * Piezas compartidas de las previews (PLAN-SERPIENTE §8, iteración 2).
 * Dev-only: animación ambiental en loop para ver el movimiento sin engine.
 * El juego real implementará lo mismo en `renderer/` con Reanimated en
 * UI-thread; `reduced motion` = solo fades.
 */

export interface SlitherPalette {
  body: string;
  head: string;
  eyeWhite: string;
  pupil: string;
  /** Textura por segmento: V2 escamas / V3 vientre. */
  pattern?: string;
  patternKind?: 'scales' | 'belly';
  /** Glow focalizado (cabeza), nunca en todo el cuerpo. */
  headGlow?: string;
}

interface XY {
  x: number;
  y: number;
}

function centersOf(snake: number[], cell: number): XY[] {
  return snake.map((index) => ({
    x: (colOfPreview(index) + 0.5) * cell,
    y: (rowOfPreview(index) + 0.5) * cell,
  }));
}

/** Grosor con taper: cabeza ancha → cola fina (cuerpo continuo). */
function thickness(index: number, count: number, cell: number): number {
  if (count <= 1) return cell;
  return cell * (1.06 - 0.42 * (index / (count - 1)));
}

function Segment({
  phase,
  index,
  cx,
  cy,
  px,
  py,
  size,
  color,
  amp,
  glow,
  label,
  children,
}: {
  phase: SharedValue<number>;
  index: number;
  cx: number;
  cy: number;
  px: number;
  py: number;
  size: number;
  color: string;
  amp: number;
  glow?: string;
  label: string;
  children?: ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const off = Math.sin(phase.value - index * 0.55) * amp;
    return { transform: [{ translateX: px * off }, { translateY: py * off }] };
  });
  return (
    <Animated.View
      accessibilityLabel={label}
      style={[
        {
          position: 'absolute',
          left: cx - size / 2,
          top: cy - size / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          shadowColor: glow,
          shadowOpacity: glow ? 0.9 : 0,
          shadowRadius: glow ? 8 : 0,
          shadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Cuerpo continuo (D13): círculos solapados + taper + puntos medios que
 * garantizan continuidad + ondulación lateral viajera. Cabeza con ojos
 * direccionales (aceptado).
 */
export function SlitherBody({
  snake,
  cell,
  palette,
  label,
}: {
  snake: number[];
  cell: number;
  palette: SlitherPalette;
  label: string;
}) {
  const phase = useSharedValue(0);
  useEffect(() => {
    phase.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 1800, easing: Easing.linear }),
      -1,
      false,
    );
  }, [phase]);

  const n = snake.length;
  const centers = centersOf(snake, cell);
  const perpOf = (i: number): XY => {
    const a = centers[Math.max(0, i - 1)];
    const b = centers[Math.min(n - 1, i + 1)];
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: -dy / len, y: dx / len };
  };

  const h0 = centers[0];
  const h1 = centers[1] ?? h0;
  const hLen = Math.hypot(h0.x - h1.x, h0.y - h1.y) || 1;
  const dir = { x: (h0.x - h1.x) / hLen, y: (h0.y - h1.y) / hLen };
  const hd = thickness(0, n, cell);
  const eyeR = hd * 0.15;
  const pupilR = hd * 0.07;
  const eyes = [-1, 1].map((side) => {
    const ex = hd / 2 + dir.x * hd * 0.24 + -dir.y * side * hd * 0.26 - eyeR;
    const ey = hd / 2 + dir.y * hd * 0.24 + dir.x * side * hd * 0.26 - eyeR;
    return (
      <View
        key={`eye-${side}`}
        style={{
          position: 'absolute',
          left: ex,
          top: ey,
          width: eyeR * 2,
          height: eyeR * 2,
          borderRadius: eyeR,
          backgroundColor: palette.eyeWhite,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: pupilR * 2,
            height: pupilR * 2,
            borderRadius: pupilR,
            backgroundColor: palette.pupil,
            marginLeft: dir.x * hd * 0.05,
            marginTop: dir.y * hd * 0.05,
          }}
        />
      </View>
    );
  });

  const nodes: ReactNode[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const c = centers[i];
    const p = perpOf(i);
    const size = thickness(i, n, cell);
    const head = i === 0;
    nodes.push(
      <Segment
        key={`${label}-seg-${i}`}
        phase={phase}
        index={i}
        cx={c.x}
        cy={c.y}
        px={p.x}
        py={p.y}
        size={size}
        color={head ? palette.head : palette.body}
        amp={(head ? 0.04 : 0.12) * cell}
        glow={head ? palette.headGlow : undefined}
        label={`${label}-seg-${i}`}
      >
        {head ? (
          eyes
        ) : palette.pattern && palette.patternKind === 'scales' ? (
          <View
            style={{
              position: 'absolute',
              left: size * 0.24,
              top: size * 0.24,
              width: size * 0.52,
              height: size * 0.52,
              borderRadius: size * 0.26,
              backgroundColor: palette.pattern,
            }}
          />
        ) : palette.pattern && palette.patternKind === 'belly' ? (
          <View
            style={{
              position: 'absolute',
              left: size * 0.19,
              top: size * 0.52,
              width: size * 0.62,
              height: size * 0.36,
              borderRadius: size * 0.18,
              backgroundColor: palette.pattern,
            }}
          />
        ) : null}
      </Segment>,
    );
    if (i > 0) {
      const m = { x: (c.x + centers[i - 1].x) / 2, y: (c.y + centers[i - 1].y) / 2 };
      const mSize = ((size + thickness(i - 1, n, cell)) / 2) * 0.98;
      nodes.push(
        <Segment
          key={`${label}-mid-${i}`}
          phase={phase}
          index={i - 0.5}
          cx={m.x}
          cy={m.y}
          px={p.x}
          py={p.y}
          size={mSize}
          color={palette.body}
          amp={0.12 * cell}
          label={`${label}-mid-${i}`}
        />,
      );
    }
  }
  return <>{nodes}</>;
}

/** Comida con pulso de anticipación (loop). */
export function PulsingFood({
  cell,
  at,
  color,
  glow,
  label,
}: {
  cell: number;
  at: number;
  color: string;
  glow: string;
  label: string;
}) {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = withRepeat(
      withTiming(1.18, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const d = cell * 0.72;
  return (
    <Animated.View
      accessibilityLabel={label}
      style={[
        {
          position: 'absolute',
          left: (colOfPreview(at) + 0.5) * cell - d / 2,
          top: (rowOfPreview(at) + 0.5) * cell - d / 2,
          width: d,
          height: d,
          borderRadius: d / 2,
          backgroundColor: color,
          shadowColor: glow,
          shadowOpacity: 0.9,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    />
  );
}

/** Popup `+10` flotando (aceptado): deriva vertical suave en loop. */
export function BobbingPopup({
  cell,
  at,
  text,
  color,
  label,
}: {
  cell: number;
  at: number;
  text: string;
  color: string;
  label: string;
}) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(withTiming(-cell * 0.35, { duration: 750 }), -1, true);
  }, [y, cell]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.Text
      accessibilityLabel={label}
      style={[
        {
          position: 'absolute',
          left: (colOfPreview(at) + 0.5) * cell - cell,
          top: (rowOfPreview(at) + 0.5) * cell - cell * 1.2,
          width: cell * 2,
          textAlign: 'center',
          color,
          fontWeight: '900',
          fontSize: Math.max(13, cell * 0.9),
          textShadowColor: '#000000',
          textShadowRadius: 4,
        },
        style,
      ]}
    >
      {text}
    </Animated.Text>
  );
}

/**
 * Especial con countdown ring (D16). D18: el anillo se CONSUME como arco
 * de progreso (misma receta de dos mitades + rotación que el renderer real
 * en `components/Board.tsx::arcAngles`); sin texto visible.
 */
export function SpecialRing({
  cell,
  at,
  color,
  secs,
  label,
}: {
  cell: number;
  at: number;
  color: string;
  secs: number;
  label: string;
}) {
  const ttlMs = secs * 1000;
  const f = Math.max(0, Math.min(1, ttlMs / (8 * 1000)));
  const angRight = Math.max(0, Math.min(180, f * 360));
  const angLeft = Math.max(0, Math.min(180, f * 360 - 180));
  const right = 45 + 180 - angRight;
  const left = -225 + angLeft;
  const s = cell * 1.22;
  const w = 3;
  const d = cell * 0.6;
  return (
    <View
      accessibilityLabel={label}
      style={{
        position: 'absolute',
        left: (colOfPreview(at) + 0.5) * cell - s / 2,
        top: (rowOfPreview(at) + 0.5) * cell - s / 2,
        width: s,
        height: s,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          width: s,
          height: s,
          borderRadius: s / 2,
          borderWidth: w,
          borderColor: 'rgba(139,92,246,0.25)',
        }}
      />
      <View style={{ position: 'absolute', left: s / 2, top: 0, width: s / 2, height: s, overflow: 'hidden' }}>
        <View
          style={{
            width: s,
            height: s,
            borderRadius: s / 2,
            borderWidth: w,
            borderColor: color,
            borderLeftColor: 'transparent',
            borderBottomColor: 'transparent',
            transform: [{ rotate: `${right}deg` }],
          }}
        />
      </View>
      <View style={{ position: 'absolute', left: 0, top: 0, width: s / 2, height: s, overflow: 'hidden' }}>
        <View
          style={{
            width: s,
            height: s,
            borderRadius: s / 2,
            borderWidth: w,
            borderColor: color,
            borderRightColor: 'transparent',
            borderBottomColor: 'transparent',
            transform: [{ rotate: `${left}deg` }],
          }}
        />
      </View>
      <View
        style={{
          width: d,
          height: d,
          borderRadius: d / 2,
          backgroundColor: color,
          shadowColor: color,
          shadowOpacity: 0.9,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
    </View>
  );
}

/** HUD B2 flotante + chip (D14): score grande + chip countdown especial. */
export function FloatingHud({
  score,
  secs,
  chipColor,
  label,
}: {
  score: number;
  secs: number;
  chipColor: string;
  label: string;
}) {
  return (
    <View accessibilityLabel={label} style={styles.hud}>
      <Text style={styles.score}>{score}</Text>
      <Text style={styles.pts}>PTS</Text>
      <View style={[styles.chip, { backgroundColor: chipColor }]}>
        <Text style={styles.chipText}>{secs}s</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hud: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  score: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  pts: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 3,
  },
  chip: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
