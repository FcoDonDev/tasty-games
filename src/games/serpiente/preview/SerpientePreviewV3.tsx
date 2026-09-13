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
 * V3 · Plano colección (PLAN-SERPIENTE §8): cápsulas redondeadas y tarjeta
 * con borde, coherente con el look tech de la colección (`#0B1220`,
 * `#33415C`). HUD fila estilo `Hud`, chip violeta de especial. Mock estático.
 */
const C = {
  board: '#0B1220',
  card: '#141D33',
  edge: '#33415C',
  snake: '#22C55E',
  head: '#4ADE80',
  dark: '#0B1220',
  food: '#FBBF24',
  special: '#A78BFA',
  text: '#E2E8F0',
  muted: '#94A3B8',
} as const;

export function SerpientePreviewV3() {
  const { size, onLayout } = useContainerSize();
  const cell = size ? size.width / GRID : 0;

  return (
    <View accessibilityLabel="preview-serpiente-v3">
      <View style={styles.hud} accessibilityLabel="preview-v3-hud">
        <Text style={styles.score}>{MOCK_SCORE} pts</Text>
        <View style={styles.chip}>
          <Text style={styles.chipText}>{MOCK_SPECIAL_SECS}s especial</Text>
        </View>
        <Text style={styles.score}>LONG {MOCK_SNAKE.length}</Text>
      </View>
      <View onLayout={onLayout} style={styles.boardWrap}>
        {cell > 0 ? (
          <View
            style={[styles.card, { width: cell * GRID + 16, height: cell * GRID + 16 }]}
            accessibilityLabel="preview-v3-tablero"
          >
            <View style={[styles.board, { width: cell * GRID, height: cell * GRID }]}>
              {MOCK_SNAKE.map((index, i) => {
                const head = i === 0;
                return (
                  <View
                    key={`v3-snake-${index}`}
                    style={[
                      styles.dot,
                      {
                        left: colOfPreview(index) * cell + 1,
                        top: rowOfPreview(index) * cell + 1,
                        width: cell - 2,
                        height: cell - 2,
                        borderRadius: (cell - 2) / 2,
                        backgroundColor: head ? C.head : C.snake,
                      },
                    ]}
                  >
                    {head ? (
                      <View style={styles.eyesRow}>
                        <View style={[styles.eye, { width: cell * 0.14, height: cell * 0.14 }]} />
                        <View style={[styles.eye, { width: cell * 0.14, height: cell * 0.14 }]} />
                      </View>
                    ) : null}
                  </View>
                );
              })}
              <View
                key="v3-food"
                style={[
                  styles.dot,
                  {
                    left: colOfPreview(MOCK_FOOD) * cell + 1,
                    top: rowOfPreview(MOCK_FOOD) * cell + 1,
                    width: cell - 2,
                    height: cell - 2,
                    borderRadius: (cell - 2) / 2,
                    backgroundColor: C.food,
                  },
                ]}
              />
              <View
                key="v3-special"
                style={[
                  styles.dot,
                  {
                    left: colOfPreview(MOCK_SPECIAL) * cell + 1,
                    top: rowOfPreview(MOCK_SPECIAL) * cell + 1,
                    width: cell - 2,
                    height: cell - 2,
                    borderRadius: (cell - 2) / 2,
                    backgroundColor: C.special,
                  },
                ]}
              />
              <Text
                style={[
                  styles.popup,
                  {
                    left: colOfPreview(MOCK_POPUP.cell) * cell,
                    top: rowOfPreview(MOCK_POPUP.cell) * cell - cell,
                    fontSize: Math.max(12, cell * 0.85),
                  },
                ]}
              >
                {MOCK_POPUP.text}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
      <Text style={styles.caption}>Hit-stop 60 ms + blip cada 5 comidas (runtime)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hud: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 8,
  },
  score: {
    color: C.muted,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  chip: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.edge,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    color: C.special,
    fontSize: 12,
    fontWeight: '800',
  },
  boardWrap: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.edge,
    borderRadius: 16,
  },
  board: {
    backgroundColor: C.board,
  },
  dot: {
    position: 'absolute',
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
    borderRadius: 999,
    backgroundColor: C.dark,
  },
  popup: {
    position: 'absolute',
    color: C.food,
    fontWeight: '900',
    textShadowColor: C.board,
    textShadowRadius: 4,
  },
  caption: {
    color: C.muted,
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
});
