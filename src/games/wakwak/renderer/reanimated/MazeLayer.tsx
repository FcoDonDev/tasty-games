import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { perfRenderCount } from '@/core/perf';
import { MAZE, MAZE_COLS, MAZE_ROWS, colOf, rowOf, toIndex, type MazeData } from '../../engine/maze';
import { BONUS_CELL } from '../../engine/rules';

/**
 * Capa estática del laberinto (motor A: Views nativos, ADR 0010).
 *
 * F4 (PLAN-WAK-POLISH): los muros se fusionan en RECTÁNGULOS máximos (merge
 * greedy: extiende a la derecha y luego hacia abajo mientras la franja completa
 * sea muro) — ~180 Views por celda → ~45 Views por bloque, y el look pasa de
 * grilla por celda a segmentos continuos con borde neón. Sin glow: las Views
 * nativas no tienen box-shadow multiplataforma — el neón es fill oscuro +
 * edge 1px brillante (hallazgo 7 del PLAN).
 *
 * Perf: la subcapa estática (muros + corral) es un componente memo con deps
 * [cellSize] — cada pickup invalida MazeLayer (identidad de `batteries`) pero
 * React hace bail-out del subtree estático (hallazgo 10: antes re-dif ~380
 * Views por batería comida). Baterías/súper/chip re-renderizan solo con
 * cambios discretos.
 *
 * Paleta tech/neón propia (resguardo legal PLAN-WAK-WAK §2): fondo oscuro,
 * muros gris-azulado — nada de azul/rosa del clásico.
 */

const COLORS = {
  wall: '#1E2A44',
  wallEdge: '#44557A',
  battery: '#FBBF24',
  super: '#FDE047',
  bonus: '#4ADE80',
  corral: '#172033',
} as const;

interface WallRect {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Fusión greedy de celdas-muro en rectángulos máximos (por franjas). */
function mergeWalls(maze: MazeData, cellSize: number): WallRect[] {
  const isWall = (row: number, col: number): boolean =>
    row >= 0 && row < MAZE_ROWS && col >= 0 && col < MAZE_COLS &&
    maze.grid[toIndex(row, col)] === 'wall';
  const used = new Set<number>();
  const rects: WallRect[] = [];
  for (let row = 0; row < MAZE_ROWS; row++) {
    for (let col = 0; col < MAZE_COLS; col++) {
      const index = toIndex(row, col);
      if (!isWall(row, col) || used.has(index)) continue;
      let width = 1;
      while (isWall(row, col + width) && !used.has(toIndex(row, col + width))) width++;
      let height = 1;
      extend: while (isWall(row + height, col)) {
        for (let c = col; c < col + width; c++) {
          if (!isWall(row + height, c) || used.has(toIndex(row + height, c))) break extend;
        }
        height++;
      }
      for (let r = row; r < row + height; r++) {
        for (let c = col; c < col + width; c++) used.add(toIndex(r, c));
      }
      rects.push({
        key: `w-${index}`,
        left: col * cellSize,
        top: row * cellSize,
        width: width * cellSize,
        height: height * cellSize,
      });
    }
  }
  return rects;
}

/**
 * Subcapa estática de un laberinto (muros fusionados + fondo del corral).
 * Exportada también para el preview (`preview/`), que renderiza layouts
 * candidatos con el MISMO look sin tocar el MAZE del juego.
 */
export const MazeStaticLayer = memo(function MazeStaticLayer({
  maze,
  cellSize,
}: {
  maze: MazeData;
  cellSize: number;
}) {
  const rects = useMemo(() => mergeWalls(maze, cellSize), [maze, cellSize]);
  return (
    <>
      {rects.map((rect) => (
        <View
          key={rect.key}
          style={{
            position: 'absolute',
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            backgroundColor: COLORS.wall,
            borderWidth: 1,
            borderColor: COLORS.wallEdge,
            borderRadius: 3,
          }}
        />
      ))}
      {/* corral: fondo diferenciado bajo las entidades */}
      {maze.corralCells.map((cell) => (
        <View
          key={`c-${cell}`}
          style={{
            position: 'absolute',
            left: colOf(cell) * cellSize,
            top: rowOf(cell) * cellSize,
            width: cellSize,
            height: cellSize,
            backgroundColor: COLORS.corral,
          }}
        />
      ))}
    </>
  );
});

export interface MazeLayerProps {
  cellSize: number;
  /** celdas con batería restante */
  batteries: number[];
  /** celdas con súper batería restante */
  supers: number[];
  /** chip dorado visible */
  bonusActive: boolean;
}

interface EdibleDotProps {
  x: number;
  y: number;
  size: number;
  borderRadius: number;
  color: string;
  testID: string;
}

/**
 * Dot comestible de una celda (I-WW-1, PLAN-PERFORMANCE §11): `memo` con
 * props primitivas para que el bail-out funcione — por pickup solo las
 * celdas cambiadas re-renderizan, en vez de recrear ~399 Views + estilos.
 * Sin objetos inline en props (derrotarían al memo).
 */
const EdibleDot = memo(function EdibleDot({ x, y, size, borderRadius, color, testID }: EdibleDotProps) {
  return (
    <View
      testID={testID}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius,
        backgroundColor: color,
      }}
    />
  );
});

function MazeLayerImpl({ cellSize, batteries, supers, bonusActive }: MazeLayerProps) {
  // D-WW0: frecuencia de renders del laberinto (debería ser solo pickups +
  // cambios de layout). Prefijo `renderFreq:` para no confundir con `render.board`
  // (duración, solo profiling). No-op con el gate apagado.
  perfRenderCount('wakwak', 'renderFreq:maze');
  const batterySet = useMemo(() => new Set(batteries), [batteries]);
  const superSet = useMemo(() => new Set(supers), [supers]);

  const dotSize = Math.max(3, Math.round(cellSize * 0.28));
  const superSize = Math.round(cellSize * 0.55);
  const bonusSize = Math.round(cellSize * 0.6);

  const edibles: React.ReactNode[] = [];
  for (let index = 0; index < MAZE_COLS * MAZE_ROWS; index++) {
    if (batterySet.has(index)) {
      edibles.push(
        <EdibleDot
          key={`b-${index}`}
          testID={`wakwak-dot-${index}`}
          x={colOf(index) * cellSize + (cellSize - dotSize) / 2}
          y={rowOf(index) * cellSize + (cellSize - dotSize) / 2}
          size={dotSize}
          borderRadius={1.5}
          color={COLORS.battery}
        />,
      );
    } else if (superSet.has(index)) {
      edibles.push(
        <EdibleDot
          key={`s-${index}`}
          testID={`wakwak-dot-${index}`}
          x={colOf(index) * cellSize + (cellSize - superSize) / 2}
          y={rowOf(index) * cellSize + (cellSize - superSize) / 2}
          size={superSize}
          borderRadius={3}
          color={COLORS.super}
        />,
      );
    }
  }

  return (
    <View style={{ width: MAZE_COLS * cellSize, height: MAZE_ROWS * cellSize }}>
      <MazeStaticLayer maze={MAZE} cellSize={cellSize} />
      {edibles}
      {bonusActive ? (
        <View
          testID="wakwak-bonus"
          style={{
            position: 'absolute',
            left: colOf(BONUS_CELL) * cellSize + (cellSize - bonusSize) / 2,
            top: rowOf(BONUS_CELL) * cellSize + (cellSize - bonusSize) / 2,
            width: bonusSize,
            height: bonusSize,
            borderRadius: 4,
            backgroundColor: COLORS.bonus,
          }}
        />
      ) : null}
    </View>
  );
}

export const MazeLayer = memo(MazeLayerImpl);
