import { memo, useEffect } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { perfRenderCount } from '@/core/perf';
import { DIR_DELTA, GRID_COLS, GRID_ROWS, colOf, rowOf, toIndex, type Direction } from '../engine/grid';
import { useSerpienteStore } from '../engine/state';

/**
 * Tablero V2 Escamas (T3, §9.2): capa estática memo + segmentos memo con
 * props primitivas (nunca objetos inline — romperían el memo).
 *
 * Taper por rol (decisión §9.2 con el presupuesto en mano): grosor uniforme
 * en el cuerpo + cabeza destacada + cola fina. Un taper por índice correría
 * los tamaños de TODO el cuerpo en cada tick; así solo cabeza/cola (+ la que
 * cambia de rol) re-renderizan por tick.
 *
 * Tema convergido de la preview V2 Escamas (T5, D17): la galería en
 * `preview/` queda viva para futuros ajustes.
 */

export const BOARD_BG = '#0B1F14';
const BODY = '#22C55E';
const SCALE = '#15803D';
const HEAD = '#4ADE80';
const EYE_WHITE = '#FFFFFF';
const PUPIL = '#052E16';
const FOOD = '#FBBF24';
const SPECIAL = '#8B5CF6';
const DANGER = 'rgba(239,68,68,0.9)';

const HEAD_SIZE = 1.12;
const BODY_SIZE = 1.0;
const TAIL_SIZE = 0.72;

const BoardGrid = memo(function BoardGrid({ cell }: { cell: number }) {
  const cells: ReactNode[] = [];
  for (let i = 0; i < GRID_COLS * GRID_ROWS; i++) {
    const checker = (rowOf(i) + colOf(i)) % 2 === 0;
    cells.push(
      <View
        key={`g-${i}`}
        style={{
          position: 'absolute',
          left: colOf(i) * cell,
          top: rowOf(i) * cell,
          width: cell,
          height: cell,
          backgroundColor: checker ? 'rgba(255,255,255,0.022)' : 'transparent',
        }}
      />,
    );
  }
  return <>{cells}</>;
});

interface SegmentProps {
  phase: SharedValue<number>;
  /** Celda: identidad estable para la fase de la onda (no el índice). */
  anchor: number;
  cx: number;
  cy: number;
  /** Perpendicular unitaria del tramo (props primitivas). */
  px: number;
  py: number;
  size: number;
  color: string;
  pattern: boolean;
  amp: number;
  label: string;
  children?: ReactNode;
}

const SnakeSegment = memo(function SnakeSegment({
  phase,
  anchor,
  cx,
  cy,
  px,
  py,
  size,
  color,
  pattern,
  amp,
  label,
  children,
}: SegmentProps) {
  perfRenderCount('serpiente', 'renderFreq:segmento');
  const style = useAnimatedStyle(() => {
    const off = Math.sin(phase.value - anchor * 0.5) * amp;
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
        },
        style,
      ]}
    >
      {pattern ? (
        <View
          style={{
            position: 'absolute',
            left: size * 0.24,
            top: size * 0.24,
            width: size * 0.52,
            height: size * 0.52,
            borderRadius: size * 0.26,
            backgroundColor: SCALE,
          }}
        />
      ) : null}
      {children}
    </Animated.View>
  );
});

function SnakeLayer({
  snake,
  cell,
  phase,
}: {
  snake: number[];
  cell: number;
  phase: SharedValue<number>;
}) {
  const n = snake.length;
  const centers = snake.map((s) => ({ x: (colOf(s) + 0.5) * cell, y: (rowOf(s) + 0.5) * cell }));
  const perpOf = (i: number): { x: number; y: number } => {
    const a = centers[Math.max(0, i - 1)];
    const b = centers[Math.min(n - 1, i + 1)];
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: -dy / len, y: dx / len };
  };
  // Dirección de la cabeza para los ojos (aceptado: iris blanco + pupila).
  const h0 = centers[0];
  const h1 = centers[1] ?? h0;
  const hLen = Math.hypot(h0.x - h1.x, h0.y - h1.y) || 1;
  const dir = { x: (h0.x - h1.x) / hLen, y: (h0.y - h1.y) / hLen };
  const headSize = cell * HEAD_SIZE;
  const eyeR = headSize * 0.15;
  const pupilR = headSize * 0.07;
  const eyes = [-1, 1].map((side) => {
    const ex = headSize / 2 + dir.x * headSize * 0.24 + -dir.y * side * headSize * 0.26 - eyeR;
    const ey = headSize / 2 + dir.y * headSize * 0.24 + dir.x * side * headSize * 0.26 - eyeR;
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
          backgroundColor: EYE_WHITE,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: pupilR * 2,
            height: pupilR * 2,
            borderRadius: pupilR,
            backgroundColor: PUPIL,
            marginLeft: dir.x * headSize * 0.05,
            marginTop: dir.y * headSize * 0.05,
          }}
        />
      </View>
    );
  });

  return (
    <>
      {snake.map((s, i) => {
        const head = i === 0;
        const tail = i === n - 1;
        const size = cell * (head ? HEAD_SIZE : tail ? TAIL_SIZE : BODY_SIZE);
        const p = perpOf(i);
        return (
          <SnakeSegment
            key={`seg-${s}`}
            phase={phase}
            anchor={s}
            cx={centers[i].x}
            cy={centers[i].y}
            px={p.x}
            py={p.y}
            size={size}
            color={head ? HEAD : BODY}
            pattern={!head && !tail}
            amp={(head ? 0.04 : 0.1) * cell}
            label={`serpiente-seg-${s}`}
          >
            {head ? (
              <View accessibilityLabel="serpiente-cabeza" style={{ flex: 1 }}>
                {eyes}
              </View>
            ) : null}
          </SnakeSegment>
        );
      })}
    </>
  );
}

const FoodDot = memo(function FoodDot({ food, cell }: { food: number; cell: number }) {
  const reduced = useReducedMotion();
  const s = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    s.value = withRepeat(
      withTiming(1.18, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [s, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const d = cell * 0.72;
  return (
    <Animated.View
      accessibilityLabel="serpiente-comida"
      style={[
        {
          position: 'absolute',
          left: (colOf(food) + 0.5) * cell - d / 2,
          top: (rowOf(food) + 0.5) * cell - d / 2,
          width: d,
          height: d,
          borderRadius: d / 2,
          backgroundColor: FOOD,
        },
        style,
      ]}
    />
  );
});

function SpecialRing({ cell, at }: { cell: number; at: number }) {
  // Slice derivado en segundos: re-render 1 vez/s, no por tick.
  const secs = useSerpienteStore((s) =>
    s.game.special ? Math.max(0, Math.ceil(s.game.special.ttlMs / 1000)) : null,
  );
  if (secs === null) return null;
  const ring = cell * 1.22;
  const d = cell * 0.6;
  return (
    <View
      accessibilityLabel="serpiente-especial"
      style={{
        position: 'absolute',
        left: (colOf(at) + 0.5) * cell - ring / 2,
        top: (rowOf(at) + 0.5) * cell - ring / 2,
        width: ring,
        height: ring,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          width: ring,
          height: ring,
          borderRadius: ring / 2,
          borderWidth: 3,
          borderColor: SPECIAL,
        }}
      />
      <View style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: SPECIAL }} />
      <View accessibilityLabel={`serpiente-especial-${secs}s`}>
        <Animated.Text style={{ position: 'absolute', top: ring - 4, color: SPECIAL, fontSize: 11, fontWeight: '800' }}>
          {secs}s
        </Animated.Text>
      </View>
    </View>
  );
}

/** Peligro a ≤2 celdas (solo `wrap=false`): vignette estática, sin slow-mo (D15). */
function threatAhead(snake: number[], dir: Direction, wrap: boolean): boolean {
  if (snake.length === 0) return false;
  const { dr, dc } = DIR_DELTA[dir];
  let r = rowOf(snake[0]);
  let c = colOf(snake[0]);
  const body = new Set(snake.slice(0, -1));
  for (let i = 1; i <= 2; i++) {
    r += dr;
    c += dc;
    if (!wrap && (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS)) return true;
    const rr = wrap ? (r + GRID_ROWS) % GRID_ROWS : r;
    const cc = wrap ? (c + GRID_COLS) % GRID_COLS : c;
    if (body.has(toIndex(rr, cc))) return true;
  }
  return false;
}

export function Board({ cellSize }: { cellSize: number }) {
  perfRenderCount('serpiente', 'renderFreq:board');
  const snake = useSerpienteStore((s) => s.game.snake);
  const dir = useSerpienteStore((s) => s.game.dir);
  const wrap = useSerpienteStore((s) => s.game.wrap);
  const status = useSerpienteStore((s) => s.game.status);
  const food = useSerpienteStore((s) => s.game.food);
  const specialCell = useSerpienteStore((s) => s.game.special?.cell ?? null);
  const reduced = useReducedMotion();
  // `slither` en UI-thread (D13/C): cero re-renders JS por la ondulación.
  const phase = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    phase.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 1800, easing: Easing.linear }),
      -1,
      false,
    );
  }, [phase, reduced]);

  const danger = status === 'playing' && !wrap && threatAhead(snake, dir, wrap);
  const size = cellSize * GRID_COLS;

  return (
    <View
      style={{ width: size, height: size, backgroundColor: BOARD_BG }}
      accessibilityLabel="tablero-serpiente"
    >
      <BoardGrid cell={cellSize} />
      <SnakeLayer snake={snake} cell={cellSize} phase={phase} />
      <FoodDot food={food} cell={cellSize} />
      {specialCell !== null ? <SpecialRing cell={cellSize} at={specialCell} /> : null}
      {danger ? (
        <View
          accessibilityLabel="serpiente-peligro"
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: size,
            height: size,
            borderWidth: 3,
            borderColor: DANGER,
          }}
        />
      ) : null}
    </View>
  );
}
