import { StyleSheet, Text, View } from 'react-native';
import { cardLabel, isRedSuit, rankLabel, type Card } from '../engine/deck';

interface PlayingCardProps {
  card: Card;
  width: number;
  height: number;
}

export function PlayingCard({ card, width, height }: PlayingCardProps) {
  const fontSize = Math.round(width * 0.3);
  const suitSize = Math.round(width * 0.26);

  if (!card.faceUp) {
    return (
      <View
        style={[
          styles.card,
          styles.back,
          { width, height, borderRadius: Math.round(width * 0.1) },
        ]}
      >
        <Text style={[styles.backMark, { fontSize: suitSize }]}>{'♠'}</Text>
      </View>
    );
  }

  const color = isRedSuit(card.suit) ? styles.red : styles.black;

  return (
    <View
      style={[
        styles.card,
        styles.face,
        { width, height, borderRadius: Math.round(width * 0.1) },
      ]}
    >
      <Text style={[styles.corner, color, { fontSize }]}>{rankLabel(card.rank)}</Text>
      <Text style={[styles.suit, color, { fontSize: suitSize }]}>{cardLabel(card).slice(-1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    justifyContent: 'center',
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
  corner: {
    fontWeight: '800',
    lineHeight: undefined,
  },
  suit: {
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
