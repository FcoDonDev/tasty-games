import { StyleSheet, Text, View } from 'react-native';
import { cardLabel, isRedSuit, rankLabel, type Card } from '../engine/deck';

interface PlayingCardProps {
  card: Card;
  width: number;
  height: number;
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

export function PlayingCard({ card, width, height }: PlayingCardProps) {
  const indexFontSize = Math.round(width * 0.17);
  const indexSuitSize = Math.round(width * 0.14);

  if (!card.faceUp) {
    return (
      <View
        style={[
          styles.card,
          styles.back,
          { width, height, borderRadius: Math.round(width * 0.1) },
        ]}
      >
        <Text style={[styles.backMark, { fontSize: indexSuitSize }]}>{'♠'}</Text>
      </View>
    );
  }

  const isRed = isRedSuit(card.suit);
  const color = isRed ? styles.red : styles.black;
  const suitSymbol = cardLabel(card).slice(-1);
  const pipPositions = PIP_LAYOUTS[card.rank] ?? [];
  const pipFontSize = card.rank <= 3 ? width * 0.2 : card.rank <= 6 ? width * 0.17 : width * 0.14;

  const cornerIndex = (rotated: boolean) => (
    <View
      style={[
        styles.cornerIndex,
        rotated ? styles.cornerRotated : null,
        rotated ? { bottom: height * 0.03, right: width * 0.06 } : { top: height * 0.03, left: width * 0.06 },
      ]}
    >
      <Text style={[styles.indexRank, color, { fontSize: indexFontSize }]}>{rankLabel(card.rank)}</Text>
      <Text style={[styles.indexSuit, color, { fontSize: indexSuitSize }]}>{suitSymbol}</Text>
    </View>
  );

  return (
    <View
      style={[
        styles.card,
        styles.face,
        { width, height, borderRadius: Math.round(width * 0.1) },
      ]}
    >
      {cornerIndex(false)}
      {cornerIndex(true)}
      {card.rank === 1 ? (
        <Text style={[styles.acePip, color, { fontSize: width * 0.36 }]}>{suitSymbol}</Text>
      ) : card.rank >= 11 ? (
        <Text style={[styles.courtIcon, { fontSize: width * 0.42 }]}>{COURT_ICONS[card.rank]}</Text>
      ) : (
        pipPositions.map(([x, y], i) => (
          <Text
            key={i}
            style={[
              styles.pip,
              color,
              {
                fontSize: pipFontSize,
                left: width * 0.18 + x * (width - width * 0.36) - pipFontSize / 2,
                top: height * 0.13 + y * (height - height * 0.26) - pipFontSize / 2,
                transform: y > 0.5 ? [{ rotate: '180deg' }] : undefined,
              },
            ]}
          >
            {suitSymbol}
          </Text>
        ))
      )}
    </View>
  );
}

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
