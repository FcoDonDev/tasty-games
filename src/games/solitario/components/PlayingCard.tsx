import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { cardLabel, isRedSuit, rankLabel, type Card } from '../engine/deck';

/** Duración del flip en dos fases 0°→90°→0° (state indication, ver plan D5). */
const FLIP_DURATION_MS = 250;

interface PlayingCardProps {
  card: Card;
  width: number;
  height: number;
  /**
   * Escala del contenido dibujado dentro de la carta (setting "Tamaño del
   * contenido"). Define una caja de contenido (width/height * scale) de la que
   * derivan TODOS los tamaños y offsets del dibujo; la geometría del View
   * (width/height) no cambia, así el drag/hit-testing queda intacto.
   * Default 1 = Normal (render idéntico a la base D6).
   */
  scale?: number;
}

// Distribución de pips como un naipe estándar: coordenadas (x, y) en fracciones
// del área útil de la carta. Los pips con y > 0.5 se rotan 180° (mitad inferior).
const PIP_LAYOUTS: Record<number, Array<[number, number]>> = {
  2: [
    [0.5, 0.18],
    [0.5, 0.82],
  ],
  3: [
    [0.5, 0.18],
    [0.5, 0.5],
    [0.5, 0.82],
  ],
  4: [
    [0.32, 0.18],
    [0.68, 0.18],
    [0.32, 0.82],
    [0.68, 0.82],
  ],
  5: [
    [0.32, 0.18],
    [0.68, 0.18],
    [0.5, 0.5],
    [0.32, 0.82],
    [0.68, 0.82],
  ],
  6: [
    [0.32, 0.18],
    [0.68, 0.18],
    [0.32, 0.5],
    [0.68, 0.5],
    [0.32, 0.82],
    [0.68, 0.82],
  ],
  7: [
    [0.32, 0.18],
    [0.68, 0.18],
    [0.32, 0.5],
    [0.68, 0.5],
    [0.32, 0.82],
    [0.68, 0.82],
    [0.5, 0.34],
  ],
  8: [
    [0.32, 0.18],
    [0.68, 0.18],
    [0.32, 0.5],
    [0.68, 0.5],
    [0.32, 0.82],
    [0.68, 0.82],
    [0.5, 0.34],
    [0.5, 0.66],
  ],
  9: [
    [0.32, 0.16],
    [0.68, 0.16],
    [0.32, 0.38],
    [0.68, 0.38],
    [0.5, 0.5],
    [0.32, 0.62],
    [0.68, 0.62],
    [0.32, 0.84],
    [0.68, 0.84],
  ],
  10: [
    [0.32, 0.16],
    [0.68, 0.16],
    [0.5, 0.27],
    [0.32, 0.38],
    [0.68, 0.38],
    [0.32, 0.62],
    [0.68, 0.62],
    [0.5, 0.73],
    [0.32, 0.84],
    [0.68, 0.84],
  ],
};

const COURT_ICONS: Record<number, string> = { 11: '🤴', 12: '👸', 13: '👑' };

// memo: las 52 cartas re-renderizan ante cada commit del store si no se
// memoiza (props estables: card por referencia, width/height/scale numéricos).
export const PlayingCard = memo(function PlayingCard({ card, width, height, scale = 1 }: PlayingCardProps) {
  // Flip en dos fases 0°→90°→0° (patrón memorice; evita el espejo rotateY en
  // web). El progreso arranca en el estado actual de faceUp y el primer run
  // del effect no anima: una carta que ya nace boca arriba (deal, restore,
  // seed E2E) no voltea al montar; solo las transiciones posteriores.
  const progress = useSharedValue(card.faceUp ? 1 : 0);
  const [showFace, setShowFace] = useState(card.faceUp);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    progress.set(
      withTiming(card.faceUp ? 1 : 0, { duration: FLIP_DURATION_MS, reduceMotion: ReduceMotion.System }),
    );
  }, [card.faceUp, progress]);

  // Intercambio de contenido en el cruce por 90° (canto de la carta)
  useAnimatedReaction(
    () => progress.get() >= 0.5,
    (next, previous) => {
      if (next !== previous) {
        scheduleOnRN(setShowFace, next);
      }
    },
    [],
  );

  const angle = useDerivedValue(() =>
    progress.get() <= 0.5 ? progress.get() * 180 : (1 - progress.get()) * 180,
  );
  const flipStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 800 }, { rotateY: `${angle.value}deg` }],
  }));

  // Caja de contenido (D8): escala solo el dibujo, centrada sobre la carta.
  // Con scale=1 la caja coincide con la carta (dx/dy = 0) y el render es el
  // histórico.
  const contentWidth = width * scale;
  const contentHeight = height * scale;
  const dx = (width - contentWidth) / 2;
  const dy = (height - contentHeight) / 2;

  // Base D6: esquinas 0.22/0.18 (antes 0.17/0.14)
  const indexFontSize = Math.round(contentWidth * 0.22);
  const indexSuitSize = Math.round(contentWidth * 0.18);

  if (!showFace) {
    return (
      <Animated.View
        style={[
          styles.card,
          styles.back,
          { width, height, borderRadius: Math.round(width * 0.1) },
          flipStyle,
        ]}
      >
        <Text style={[styles.backMark, { fontSize: indexSuitSize }]}>{'♠'}</Text>
      </Animated.View>
    );
  }

  const isRed = isRedSuit(card.suit);
  const color = isRed ? styles.red : styles.black;
  const suitSymbol = cardLabel(card).slice(-1);
  const pipPositions = PIP_LAYOUTS[card.rank] ?? [];
  const pipFontSize = card.rank <= 3 ? contentWidth * 0.2 : card.rank <= 6 ? contentWidth * 0.17 : contentWidth * 0.14;

  const cornerIndex = (rotated: boolean) => (
    <View
      style={[
        styles.cornerIndex,
        rotated ? styles.cornerRotated : null,
        // Ancladas a los bordes de la CARTA (no de la caja de contenido): con
        // scale > 1 la caja excede el marco y las esquinas se recortarían
        // (verificado visualmente a 360px en Grande, plan T10). Solo sus
        // tamaños escalan con la caja.
        rotated
          ? { bottom: height * 0.03, right: width * 0.06 }
          : { top: height * 0.03, left: width * 0.06 },
      ]}
    >
      <Text style={[styles.indexRank, color, { fontSize: indexFontSize }]}>{rankLabel(card.rank)}</Text>
      <Text style={[styles.indexSuit, color, { fontSize: indexSuitSize }]}>{suitSymbol}</Text>
    </View>
  );

  return (
    <Animated.View
      style={[
        styles.card,
        styles.face,
        { width, height, borderRadius: Math.round(width * 0.1) },
        flipStyle,
      ]}
    >
      {/* Capa de contenido escalada y centrada: pips se posicionan en
          fracciones de la caja, no de la carta completa (región centrada:
          incluso a 1.2 los pips quedan dentro del marco). Las esquinas van
          fuera de la capa, ancladas a la carta. */}
      <View style={{ position: 'absolute', left: dx, top: dy, width: contentWidth, height: contentHeight }}>
        {card.rank >= 2 && card.rank <= 10
          ? pipPositions.map(([x, y], i) => (
              <Text
                key={i}
                style={[
                  styles.pip,
                  color,
                  {
                    fontSize: pipFontSize,
                    left: contentWidth * (0.18 + x * 0.64) - pipFontSize / 2,
                    top: contentHeight * (0.13 + y * 0.74) - pipFontSize / 2,
                    transform: y > 0.5 ? [{ rotate: '180deg' }] : undefined,
                  },
                ]}
              >
                {suitSymbol}
              </Text>
            ))
          : null}
      </View>
      {card.rank === 1 ? (
        <Text style={[styles.acePip, color, { fontSize: contentWidth * 0.36 }]}>{suitSymbol}</Text>
      ) : card.rank >= 11 ? (
        <Text style={[styles.courtIcon, { fontSize: contentWidth * 0.42 }]}>{COURT_ICONS[card.rank]}</Text>
      ) : null}
      {cornerIndex(false)}
      {cornerIndex(true)}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  face: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  back: {
    backgroundColor: '#1D4ED8',
    borderWidth: 2,
    borderColor: '#93C5FD',
  },
  backMark: {
    color: '#93C5FD',
    fontWeight: '700',
  },
  cornerIndex: {
    position: 'absolute',
    alignItems: 'center',
  },
  cornerRotated: {
    transform: [{ rotate: '180deg' }],
  },
  indexRank: {
    fontWeight: '800',
    lineHeight: undefined,
  },
  indexSuit: {
    fontWeight: '700',
    lineHeight: undefined,
  },
  acePip: {
    fontWeight: '700',
    lineHeight: undefined,
  },
  courtIcon: {
    lineHeight: undefined,
  },
  pip: {
    position: 'absolute',
    fontWeight: '700',
    lineHeight: undefined,
  },
  red: {
    color: '#DC2626',
  },
  black: {
    color: '#111827',
  },
});
