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
import { DIR_DELTA, GRID_COLS, GRID_ROWS, colOf, rowOf, stepIndex, toIndex, type Direction } from '../engine/grid';
import { SPECIAL_TTL_MS } from '../engine/rules';
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
  // Damero: solo las celdas TINTADAS (200); las otras 200 transparentes que
  // solo consumían Views quedan fuera (P2/M4).
  for (let i = 0; i < GRID_COLS * GRID_ROWS; i++) {
    if ((rowOf(i) + colOf(i)) % 2 !== 0) continue;
    cells.push(
      <View
        key={`g-${i}`}
        style={{
          position: 'absolute',
          left: colOf(i) * cell,
          top: rowOf(i) * cell,
          width: cell,
          height: cell,
          backgroundColor: 'rgba(255,255,255,0.022)',
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
  /** D4: identificador en `testID` (selectores E2E), NO en a11y — el lector
   * de pantalla no necesita 100 avisos del cuerpo. */
  testId: string;
  /** D20: slide interpolado hacia el upstream (px por unidad de progreso).
   * 0 para los segmentos estáticos. */
  mDeltaX: number;
  mDeltaY: number;
  /** Progreso del paso en curso 0..1 (escrito desde el loop rAF). */
  progress?: SharedValue<number>;
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
  testId,
  mDeltaX,
  mDeltaY,
  progress,
  children,
}: SegmentProps) {
  perfRenderCount('serpiente', 'renderFreq:segmento');
  const style = useAnimatedStyle(() => {
    const off = Math.sin(phase.value - anchor * 0.5) * amp;
    const p = progress ? progress.value : 0;
    return {
      transform: [
        { translateX: px * off + mDeltaX * p },
        { translateY: py * off + mDeltaY * p },
      ],
    };
  });
  return (
    <Animated.View
      testID={testId}
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
  progress,
  dirNext,
  wrap,
  foodCell,
  specialCell,
}: {
  snake: number[];
  cell: number;
  phase: SharedValue<number>;
  /** D20: progreso del paso en curso (puede ser undefined en tests). */
  progress?: SharedValue<number>;
  /** Dirección del próximo paso (queued[0] manda, igual que el engine). */
  dirNext: Direction;
  wrap: boolean;
  foodCell: number;
  specialCell: number | null;
}) {
  const n = snake.length;
  const centers = snake.map((s) => ({ x: (colOf(s) + 0.5) * cell, y: (rowOf(s) + 0.5) * cell }));
  const centerOf = (c: number): { x: number; y: number } => ({
    x: (colOf(c) + 0.5) * cell,
    y: (rowOf(c) + 0.5) * cell,
  });
  /**
   * D20: delta px de slide entre celdas ADYACENTES del cuerpo. Al cruzar el
   * borde (wrap) el delta col/row salta a ±(N-1): se normaliza a ±1 para que
   * el slide visual cruce el borde y no recorra el tablero.
   */
  const deltaPx = (from: number, to: number): { x: number; y: number } => {
    let dc = colOf(to) - colOf(from);
    let dr = rowOf(to) - rowOf(from);
    if (dc > 1) dc -= GRID_COLS;
    else if (dc < -1) dc += GRID_COLS;
    if (dr > 1) dr -= GRID_ROWS;
    else if (dr < -1) dr += GRID_ROWS;
    return { x: dc * cell, y: dr * cell };
  };
  const ZERO = { x: 0, y: 0 };
  // D20: destino del próximo paso. stepIndex < 0 = muro (sin wrap): la cabeza
  // NO se interpola ese intervalo (descansa en su celda hasta morir).
  const target = stepIndex(snake[0], dirNext, wrap);
  const targetC = target >= 0 ? centerOf(target) : null;
  // ¿El paso EN CURSO come? (predecible: el target es la comida/especial) —
  // si come, la cola NO se retrae en este intervalo (stepOnce conserva cola).
  const eats =
    target >= 0 && (target === foodCell || (specialCell !== null && target === specialCell));

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

  // D19: cuerpo continuo como SlitherBody (preview) — segmento PUNTO MEDIO
  // por par contiguo (posición/tamaño promedio, amp 0.12·cell). Taper por
  // rol (§9.2) se mantiene. D20: cada nodo (segmento O mid) se desliza hacia
  // su upstream por `progress` — el cuerpo entero fluye con la cabeza.
  const roleSize = (i: number): number =>
    cell * (i === 0 ? HEAD_SIZE : i === n - 1 ? TAIL_SIZE : BODY_SIZE);
  const nodes: ReactNode[] = [];
  snake.forEach((s, i) => {
    const size = roleSize(i);
    const p = perpOf(i);
    // Slide del segmento: cabeza → target; cuerpo → su upstream (celda i-1).
    // Cola estática si este paso come (no se libera). Upstream estable por
    // identidad de celda → memo: solo cabeza/cuello/cola re-renderizan/tick.
    let mD;
    if (i === 0) {
      mD = targetC ? deltaPx(s, target) : ZERO;
    } else if (i === n - 1 && eats) {
      mD = ZERO;
    } else {
      mD = deltaPx(s, snake[i - 1]);
    }
    nodes.push(
      <SnakeSegment
        key={`seg-${s}`}
        phase={phase}
        anchor={s}
        cx={centers[i].x}
        cy={centers[i].y}
        px={p.x}
        py={p.y}
        size={size}
        color={i === 0 ? HEAD : BODY}
        pattern={i !== 0 && i !== n - 1}
        amp={(i === 0 ? 0.04 : 0.1) * cell}
        testId={`serpiente-seg-${s}`}
        mDeltaX={mD.x}
        mDeltaY={mD.y}
        progress={progress}
      >
        {i === 0 ? (
          <View accessibilityLabel="serpiente-cabeza" style={{ flex: 1 }}>
            {eyes}
          </View>
        ) : null}
      </SnakeSegment>,
    );
    if (i > 0) {
      const prev = snake[i - 1];
      const cur = { x: (centers[i].x + centers[i - 1].x) / 2, y: (centers[i].y + centers[i - 1].y) / 2 };
      // Slide del mid: hacia el midpoint upstream (para i-1==0 el upstream
      // virtual es el target: la cabellera se mantiene pegada a la cabeza).
      const upA = centers[i - 1];
      const upB = i - 1 === 0 ? (targetC ?? centers[0]) : centers[i - 2];
      const mSlide =
        i === n - 1 && eats ? ZERO : { x: (upA.x + upB.x) / 2 - cur.x, y: (upA.y + upB.y) / 2 - cur.y };
      nodes.push(
        <SnakeSegment
          key={`mid-${prev}-${s}`}
          phase={phase}
          anchor={(prev + s) / 2}
          cx={cur.x}
          cy={cur.y}
          px={p.x}
          py={p.y}
          size={((size + roleSize(i - 1)) / 2) * 0.98}
          color={BODY}
          pattern={false}
          amp={0.12 * cell}
          testId={`serpiente-mid-${prev}-${s}`}
          mDeltaX={mSlide.x}
          mDeltaY={mSlide.y}
          progress={progress}
        />,
      );
    }
  });
  return <>{nodes}</>;
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
          // D19: glow focalizado de la comida (como PulsingFood en la preview)
          shadowColor: FOOD,
          shadowOpacity: 0.9,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    />
  );
});

/**
 * Ángulos de rotación del arco restante del especial (D18): receta de dos
 * mitades con clip + rotación (Views puros, sin SVG/Skia — ADR 0001).
 * `right` dibuja el tramo [0°..180°] desde las 12 (horario) cubriendo
 * `min(f, .5)·360`; `left` cubre el resto (f > .5). Puro para unit tests.
 */
export function arcAngles(ttlMs: number, ttlTotal: number = SPECIAL_TTL_MS): {
  right: number;
  left: number;
} {
  const f = Math.max(0, Math.min(1, ttlMs / ttlTotal));
  const angRight = Math.max(0, Math.min(180, f * 360));
  const angLeft = Math.max(0, Math.min(180, f * 360 - 180));
  return { right: 45 + 180 - angRight, left: -225 + angLeft };
}

function SpecialRing({ cell, at }: { cell: number; at: number }) {
  // D18: el anillo se CONSUME con el ttl (arco restante). Slice por ttlMs:
  // re-render por paso (~140-70 ms), no por frame.
  const ttlMs = useSerpienteStore((s) => s.game.special?.ttlMs ?? null);
  if (ttlMs === null) return null;
  const secs = Math.max(0, Math.ceil(ttlMs / 1000));
  const { right, left } = arcAngles(ttlMs);
  const ring = cell * 1.22;
  const w = 3;
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
      {/* pista */}
      <View
        style={{
          position: 'absolute',
          width: ring,
          height: ring,
          borderRadius: ring / 2,
          borderWidth: w,
          borderColor: 'rgba(139,92,246,0.25)',
        }}
      />
      {/* arco restante: media derecha (12→6 horario) + media izquierda */}
      <View style={{ position: 'absolute', left: ring / 2, top: 0, width: ring / 2, height: ring, overflow: 'hidden' }}>
        <View
          style={{
            width: ring,
            height: ring,
            borderRadius: ring / 2,
            borderWidth: w,
            borderColor: SPECIAL,
            borderLeftColor: 'transparent',
            borderBottomColor: 'transparent',
            transform: [{ rotate: `${right}deg` }],
          }}
        />
      </View>
      <View style={{ position: 'absolute', left: 0, top: 0, width: ring / 2, height: ring, overflow: 'hidden' }}>
        <View
          style={{
            width: ring,
            height: ring,
            borderRadius: ring / 2,
            borderWidth: w,
            borderColor: SPECIAL,
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
          backgroundColor: SPECIAL,
          // D19: glow focalizado del especial (como PulsingFood en la preview)
          shadowColor: SPECIAL,
          shadowOpacity: 0.9,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
      {/* anuncio a11y: el arco no es texto; el lector sigue oyendo los segundos */}
      <View accessibilityLabel={`serpiente-especial-${secs}s`} style={{ width: 0, height: 0 }} />
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

export function Board({
  cellSize,
  stepProgress,
}: {
  cellSize: number;
  /** D20: progreso del paso en curso; opcional (tests/jest usan 0). */
  stepProgress?: SharedValue<number>;
}) {
  perfRenderCount('serpiente', 'renderFreq:board');
  const snake = useSerpienteStore((s) => s.game.snake);
  const dir = useSerpienteStore((s) => s.game.dir);
  const queuedFirst = useSerpienteStore((s) => s.game.queued[0] ?? null);
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
      <SnakeLayer
        snake={snake}
        cell={cellSize}
        phase={phase}
        progress={stepProgress}
        dirNext={queuedFirst ?? dir}
        wrap={wrap}
        foodCell={food}
        specialCell={specialCell}
      />
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
