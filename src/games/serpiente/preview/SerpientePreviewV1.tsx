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
 * V1 · Víbora neón (iteración 2): cuerpo continuo verde neón, cabeza rosa
 * con glow focalizado (el glow total se descartó por costo GPU), HUD B2
 * flotante + chip, ring en el especial. Ojos direccionales + `+10`.
 */
export function SerpientePreviewV1() {
  const { size, onLayout } = useContainerSize();
  const cell = size ? size.width / GRID : 0;

  return (
    <View accessibilityLabel="preview-serpiente-v1">
      <FloatingHud
        label="preview-v1-hud"
        score={MOCK_SCORE}
        secs={MOCK_SPECIAL_SECS}
        chipColor="#8B5CF6"
      />
      <View onLayout={onLayout} style={styles.boardWrap}>
        {cell > 0 ? (
          <View
            style={[styles.board, { width: cell * GRID, height: cell * GRID }]}
            accessibilityLabel="preview-v1-tablero"
          >
            <SlitherBody
              label="v1"
              snake={MOCK_SNAKE}
              cell={cell}
              palette={{
                body: '#00E5A0',
                head: '#FF006E',
                eyeWhite: '#FFFFFF',
                pupil: '#1A1A2E',
                headGlow: '#FF006E',
              }}
            />
            <PulsingFood label="v1-food" cell={cell} at={MOCK_FOOD} color="#FBBF24" glow="#FBBF24" />
            <SpecialRing
              label="v1-special"
              cell={cell}
              at={MOCK_SPECIAL}
              color="#8B5CF6"
              secs={MOCK_SPECIAL_SECS}
            />
            <BobbingPopup
              label="v1-popup"
              cell={cell}
              at={MOCK_POPUP.cell}
              text={MOCK_POPUP.text}
              color="#FBBF24"
            />
          </View>
        ) : null}
      </View>
      <Text style={styles.caption}>
        Ondulación + pulso + popup en loop · runtime: squash, hit-stop especial, vignette, flash
        causa (sin slow-mo)
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
    backgroundColor: '#1A1A2E',
  },
  caption: {
    color: '#A5B4FC',
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
});
