import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { MAZE, MAZE_COLS, MAZE_ROWS, colOf, rowOf, toIndex } from '../../engine/maze';
import { BONUS_CELL } from '../../engine/rules';

/**
 * Capa estática del laberinto (motor A: Views nativos, ADR 0010).
 * Muros: Views absolutos memoizados por celda. Baterías/súper/chip: Views que
 * re-renderizan solo con cambios discretos (pickup), nunca por frame.
 * Paleta tech/neón propia (resguardo legal PLAN-WAK-WAK §2): fondo oscuro,
 * muros gris-azulado — nada de azul/rosa del clásico.
 */

const COLORS = {
  wall: '#1E2A44',
  wallEdge: '#33415C',
  battery: '#FBBF24',
  super: '#FDE047',
  bonus: '#4ADE80',
  corral: '#172033',
} as const;

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
  const walls = useMemo(() => {
    const cells: Array<{ key: number; left: number; top: number }> = [];
    for (let row = 0; row < MAZE_ROWS; row++) {
      for (let col = 0; col < MAZE_COLS; col++) {
        if (MAZE.grid[toIndex(row, col)] === 'wall') {
          cells.push({ key: toIndex(row, col), left: col * cellSize, top: row * cellSize });
        }
      }
    }
    return cells;
  }, [cellSize]);

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
      {walls.map((wall) => (
        <View
          key={wall.key}
          style={{
            position: 'absolute',
            left: wall.left,
            top: wall.top,
            width: cellSize,
            height: cellSize,
            backgroundColor: COLORS.wall,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: COLORS.wallEdge,
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
