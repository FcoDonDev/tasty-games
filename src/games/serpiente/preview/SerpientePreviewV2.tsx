import { StyleSheet, Text, View } from 'react-native';
import { useContainerSize } from '@/core/ui/useContainerSize';
import {
  GRID,
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
 * V2 · Neón synthwave (PLAN-SERPIENTE §8): glow cian/rosa sobre negro
 * profundo, grilla tenue, HUD flotante con texto neón + chip de especial.
 * Mock estático (el glow usa shadow*, costo moderado en nativo).
 */
const C = {
  bg: '#1A1A2E',
  grid: 'rgba(93,52,208,0.18)',
  snake: '#00FFFF',
  head: '#FF006E',
  food: '#FBBF24',
  special: '#5D34D0',
  text: '#FFFFFF',
  muted: '#A5B4FC',
} as const;

export function SerpientePreviewV2() {
  const { size, onLayout } = useContainerSize();
  const cell = size ? size.width / GRID : 0;

  return (
    <View accessibilityLabel="preview-serpiente-v2">
      <View style={styles.hud} accessibilityLabel="preview-v2-hud">
        <Text style={styles.score}>{MOCK_SCORE}</Text>
        <Text style={styles.scoreLabel}>PTS</Text>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{MOCK_SPECIAL_SECS}s</Text>
        </View>
      </View>
      <View onLayout={onLayout} style={styles.boardWrap}>
        {cell > 0 ? (
          <View
            style={[styles.board, { width: cell * GRID, height: cell * GRID }]}
            accessibilityLabel="preview-v2-tablero"
          >
            {MOCK_SNAKE.map((index, i) => {
              const head = i === 0;
              return (
                <View
                  key={`v2-snake-${index}`}
                  style={[
                    styles.cell,
                    {
                      left: colOfPreview(index) * cell + 0.5,
                      top: rowOfPreview(index) * cell + 0.5,
                      width: cell - 1,
                      height: cell - 1,
                      backgroundColor: head ? C.head : C.snake,
                      shadowColor: head ? C.head : C.snake,
                    },
                  ]}
                />
              );
            })}
            <View
              key="v2-food"
              style={[
                styles.cell,
                {
                  left: colOfPreview(MOCK_FOOD) * cell + 0.5,
                  top: rowOfPreview(MOCK_FOOD) * cell + 0.5,
                  width: cell - 1,
                  height: cell - 1,
                  backgroundColor: C.food,
                  shadowColor: C.food,
                },
              ]}
            />
            <View
              key="v2-special"
              style={[
                styles.cell,
                {
                  left: colOfPreview(MOCK_SPECIAL) * cell + 0.5,
                  top: rowOfPreview(MOCK_SPECIAL) * cell + 0.5,
                  width: cell - 1,
                  height: cell - 1,
                  backgroundColor: C.special,
                  shadowColor: C.special,
                },
              ]}
            />
            <Text
              style={[
                styles.popup,
                {
                  left: colOfPreview(MOCK_POPUP.cell) * cell,
                  top: rowOfPreview(MOCK_POPUP.cell) * cell - cell,
                  fontSize: Math.max(13, cell * 0.9),
                },
              ]}
            >
              {MOCK_POPUP.text}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.caption}>Slow-mo ×0.7 cerca del peligro · freeze 400 ms al morir (runtime)</Text>
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
    color: C.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 2,
    textShadowColor: C.snake,
    textShadowRadius: 12,
  },
  scoreLabel: {
    color: C.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 3,
  },
  chip: {
    backgroundColor: C.special,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    shadowColor: C.special,
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  chipText: {
    color: C.text,
    fontSize: 12,
    fontWeight: '800',
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
    backgroundColor: C.grid,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  popup: {
    position: 'absolute',
    color: C.food,
    fontWeight: '900',
    textShadowColor: C.food,
    textShadowRadius: 10,
  },
  caption: {
    color: C.muted,
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
});
