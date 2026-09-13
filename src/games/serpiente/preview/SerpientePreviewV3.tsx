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
 * V3 · Tinta colección (iteración 2): cuerpo continuo menta con vientre
 * claro sobre tarjeta `#0B1220` con borde (coherente con la colección),
 * HUD B2 flotante + chip, ring en el especial. Ojos direccionales + `+10`.
 */
export function SerpientePreviewV3() {
  const { size, onLayout } = useContainerSize();
  const cell = size ? size.width / GRID : 0;

  return (
    <View accessibilityLabel="preview-serpiente-v3">
      <FloatingHud
        label="preview-v3-hud"
        score={MOCK_SCORE}
        secs={MOCK_SPECIAL_SECS}
        chipColor="#8B5CF6"
      />
      <View onLayout={onLayout} style={styles.boardWrap}>
        {cell > 0 ? (
          <View
            style={[styles.card, { width: cell * GRID + 16, height: cell * GRID + 16 }]}
            accessibilityLabel="preview-v3-tablero"
          >
            <View style={[styles.board, { width: cell * GRID, height: cell * GRID }]}>
              <SlitherBody
                label="v3"
                snake={MOCK_SNAKE}
                cell={cell}
                palette={{
                  body: '#2DD4BF',
                  head: '#99F6E4',
                  eyeWhite: '#0B1220',
                  pupil: '#0B1220',
                  pattern: '#99F6E4',
                  patternKind: 'belly',
                }}
              />
              <PulsingFood label="v3-food" cell={cell} at={MOCK_FOOD} color="#FBBF24" glow="#FBBF24" />
              <SpecialRing
                label="v3-special"
                cell={cell}
                at={MOCK_SPECIAL}
                color="#A78BFA"
                secs={MOCK_SPECIAL_SECS}
              />
              <BobbingPopup
                label="v3-popup"
                cell={cell}
                at={MOCK_POPUP.cell}
                text={MOCK_POPUP.text}
                color="#FBBF24"
              />
            </View>
          </View>
        ) : null}
      </View>
      <Text style={styles.caption}>
        Tarjeta con borde estilo colección · runtime: squash, hit-stop especial, vignette, flash
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
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#141D33',
    borderWidth: 1,
    borderColor: '#33415C',
    borderRadius: 16,
  },
  board: {
    backgroundColor: '#0B1220',
  },
  caption: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
});
