import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { MAZE, MAZE_COLS, MAZE_ROWS, colOf, rowOf, toIndex } from '../../engine/maze';
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
function mergeWalls(cellSize: number): WallRect[] {
  const isWall = (row: number, col: number): boolean =>
    row >= 0 && row < MAZE_ROWS && col >= 0 && col < MAZE_COLS &&
    MAZE.grid[toIndex(row, col)] === 'wall';
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

/** Subcapa estática: muros fusionados + fondo del corral. deps [cellSize]. */
const StaticLayer = memo(function StaticLayer({ cellSize }: { cellSize: number }) {
  const rects = useMemo(() => mergeWalls(cellSize), [cellSize]);
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
      {MAZE.corralCells.map((cell) => (
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

function MazeLayerImpl({ cellSize, batteries, supers, bonusActive }: MazeLayerProps) {
  const batterySet = useMemo(() => new Set(batteries), [batteries]);
  const superSet = useMemo(() => new Set(supers), [supers]);

  const dotSize = Math.max(3, Math.round(cellSize * 0.28));
  const superSize = Math.round(cellSize * 0.55);
  const bonusSize = Math.round(cellSize * 0.6);

  const edibles: React.ReactNode[] = [];
  for (let index = 0; index < MAZE_COLS * MAZE_ROWS; index++) {
    if (batterySet.has(index)) {
      edibles.push(
        <View
          key={`b-${index}`}
          style={{
            position: 'absolute',
            left: colOf(index) * cellSize + (cellSize - dotSize) / 2,
            top: rowOf(index) * cellSize + (cellSize - dotSize) / 2,
            width: dotSize,
            height: dotSize,
            borderRadius: 1.5,
            backgroundColor: COLORS.battery,
          }}
        />,
      );
    } else if (superSet.has(index)) {
      edibles.push(
        <View
          key={`s-${index}`}
          style={{
            position: 'absolute',
            left: colOf(index) * cellSize + (cellSize - superSize) / 2,
            top: rowOf(index) * cellSize + (cellSize - superSize) / 2,
            width: superSize,
            height: superSize,
            borderRadius: 3,
            backgroundColor: COLORS.super,
          }}
        />,
      );
    }
  }

  return (
    <View style={{ width: MAZE_COLS * cellSize, height: MAZE_ROWS * cellSize }}>
      <StaticLayer cellSize={cellSize} />
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
