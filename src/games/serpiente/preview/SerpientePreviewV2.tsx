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
} from './mock';
import { BobbingPopup, FloatingHud, PulsingFood, SlitherBody, SpecialRing } from './fx';

/**
 * V2 · Escamas arcade (iteración 2): cuerpo continuo verde clásico con
 * textura de escamas, sin glow (lo más barato), HUD B2 flotante + chip,
 * ring en el especial. Ojos direccionales + `+10`.
 */
export function SerpientePreviewV2() {
  const { size, onLayout } = useContainerSize();
  const cell = size ? size.width / GRID : 0;

  return (
    <View accessibilityLabel="preview-serpiente-v2">
      <FloatingHud
        label="preview-v2-hud"
        score={MOCK_SCORE}
        secs={MOCK_SPECIAL_SECS}
        chipColor="#8B5CF6"
      />
      <View onLayout={onLayout} style={styles.boardWrap}>
        {cell > 0 ? (
          <View
            style={[styles.board, { width: cell * GRID, height: cell * GRID }]}
            accessibilityLabel="preview-v2-tablero"
          >
            <SlitherBody
              label="v2"
              snake={MOCK_SNAKE}
              cell={cell}
              palette={{
                body: '#22C55E',
                head: '#4ADE80',
                eyeWhite: '#FFFFFF',
                pupil: '#052E16',
                pattern: '#15803D',
                patternKind: 'scales',
              }}
            />
            <PulsingFood label="v2-food" cell={cell} at={MOCK_FOOD} color="#FBBF24" glow="#FBBF24" />
            <SpecialRing
              label="v2-special"
              cell={cell}
              at={MOCK_SPECIAL}
              color="#8B5CF6"
              secs={MOCK_SPECIAL_SECS}
            />
            <BobbingPopup
              label="v2-popup"
              cell={cell}
              at={MOCK_POPUP.cell}
              text={MOCK_POPUP.text}
              color="#FBBF24"
            />
          </View>
        ) : null}
      </View>
      <Text style={styles.caption}>
        Cero glow, solo Views opacas · runtime: squash, hit-stop especial, vignette, flash causa
        (sin slow-mo)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  boardWrap: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  board: {
    backgroundColor: '#0B1F14',
  },
  caption: {
    color: '#86EFAC',
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
});
