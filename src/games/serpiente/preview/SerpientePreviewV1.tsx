import { StyleSheet, Text, View } from 'react-native';
import { useContainerSize } from '@/core/ui/useContainerSize';
import {
  GRID,
  MOCK_EATEN,
  MOCK_FOOD,
  MOCK_POPUP,
  MOCK_SCORE,
  MOCK_SNAKE,
  MOCK_SPECIAL,
  MOCK_SPECIAL_SECS,
  colOfPreview,
  rowOfPreview,
} from './mock';

/**
 * V1 · Pixel 8-bit (PLAN-SERPIENTE §8): bloques cuadrados con borde pixel,
 * ojos direccionales en la cabeza, HUD chunky monoespaciado. Mock estático.
 */
const C = {
  bg: '#0F172A',
  grid: 'rgba(255,255,255,0.05)',
  snake: '#22C55E',
  snakeEdge: '#14532B',
  head: '#4ADE80',
  eye: '#FFFFFF',
  food: '#FBBF24',
  special: '#F472B6',
  text: '#FFFFFF',
  muted: '#94A3B8',
} as const;

export function SerpientePreviewV1() {
  const { size, onLayout } = useContainerSize();
  const cell = size ? size.width / GRID : 0;

  return (
    <View accessibilityLabel="preview-serpiente-v1">
      <View style={styles.hud} accessibilityLabel="preview-v1-hud">
        <Text style={styles.hudText}>SCORE {MOCK_SCORE}</Text>
        <Text style={styles.hudText}>LEN {MOCK_SNAKE.length}</Text>
        <Text style={[styles.hudText, styles.special]}>ESP {MOCK_SPECIAL_SECS}s</Text>
      </View>
      <View onLayout={onLayout} style={styles.boardWrap}>
        {cell > 0 ? (
          <View
            style={[styles.board, { width: cell * GRID, height: cell * GRID }]}
            accessibilityLabel="preview-v1-tablero"
          >
            {MOCK_SNAKE.map((index, i) => {
              const head = i === 0;
              return (
                <View
                  key={`v1-snake-${index}`}
                  style={[
                    styles.cell,
                    {
                      left: colOfPreview(index) * cell + 1,
                      top: rowOfPreview(index) * cell + 1,
                      width: cell - 2,
                      height: cell - 2,
                      backgroundColor: head ? C.head : C.snake,
                      borderColor: C.snakeEdge,
                    },
                  ]}
                >
                  {head ? (
                    <View style={styles.eyesRow}>
                      <View style={[styles.eye, { width: cell * 0.16, height: cell * 0.16 }]} />
                      <View style={[styles.eye, { width: cell * 0.16, height: cell * 0.16 }]} />
                    </View>
                  ) : null}
                </View>
              );
            })}
            <View
              key="v1-food"
              style={[
                styles.cell,
                {
                  left: colOfPreview(MOCK_FOOD) * cell + 1,
                  top: rowOfPreview(MOCK_FOOD) * cell + 1,
                  width: cell - 2,
                  height: cell - 2,
                  backgroundColor: C.food,
                },
              ]}
            />
            <View
              key="v1-special"
              style={[
                styles.cell,
                {
                  left: colOfPreview(MOCK_SPECIAL) * cell + 1,
                  top: rowOfPreview(MOCK_SPECIAL) * cell + 1,
                  width: cell - 2,
                  height: cell - 2,
                  backgroundColor: C.special,
                },
              ]}
            />
            <Text
              style={[
                styles.popup,
                {
                  left: colOfPreview(MOCK_POPUP.cell) * cell,
                  top: rowOfPreview(MOCK_POPUP.cell) * cell - cell * 0.9,
                  fontSize: Math.max(12, cell * 0.8),
                },
              ]}
            >
              {MOCK_POPUP.text}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.caption}>
        Comidas: {MOCK_EATEN} · paso ~140 ms · muerte: freeze + shake (runtime)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hud: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.bg,
    borderWidth: 3,
    borderColor: C.snake,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  hudText: {
    color: C.text,
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  special: {
    color: C.special,
  },
  boardWrap: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  board: {
    backgroundColor: C.bg,
  },
  cell: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  eyesRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    paddingRight: 2,
  },
  eye: {
    backgroundColor: C.eye,
  },
  popup: {
    position: 'absolute',
    color: C.food,
    fontFamily: 'monospace',
    fontWeight: '900',
    textShadowColor: '#000000',
    textShadowRadius: 3,
  },
  caption: {
    color: C.muted,
    fontFamily: 'monospace',
    fontSize: 11,
    marginTop: 8,
  },
});
