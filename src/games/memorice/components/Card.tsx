import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { CardModel } from '../engine/deck';

interface CardProps {
  card: CardModel;
  /** Posición en el grid, base del accessibilityLabel (estable para E2E) */
  index: number;
  faceUp: boolean;
  matched: boolean;
  disabled: boolean;
  onPress: () => void;
  /** Tamaño calculado por layout (responsive, sin scroll) */
  width: number;
  height: number;
}

interface CardStyle {
  backgroundColor: string;
  surfaceBorder: string;
  question: string;
  matchedBg: string;
  matchedBorder: string;
}

export function Card({
  card,
  index,
  faceUp,
  matched,
  disabled,
  onPress,
  width,
  height,
  style,
}: CardProps & { style: CardStyle }) {
  // Flip en dos fases: 0° -> 90° (se intercambia el contenido) -> 0°.
  // Evita el espejo de rotateY continuo, que se ve mal en web.
  const progress = useSharedValue(0);
  const [showFace, setShowFace] = useState(faceUp);

  useEffect(() => {
    progress.value = withTiming(faceUp ? 1 : 0, { duration: 300 });
  }, [faceUp, progress]);

  useAnimatedReaction(
    () => progress.value >= 0.5,
    (next, previous) => {
      if (next !== previous) {
        runOnJS(setShowFace)(next);
      }
    },
    [],
  );

  const angle = useDerivedValue(
    () => (progress.value <= 0.5 ? progress.value * 180 : (1 - progress.value) * 180),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 800 }, { rotateY: `${angle.value}deg` }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`carta-${index + 1}`}
      accessibilityState={{ disabled: disabled || matched }}
      onPress={onPress}
      disabled={disabled || matched}
      style={[styles.pressable, { width, height }]}
    >
      <Animated.View
        style={[
          styles.card,
          animatedStyle,
          matched
            ? { backgroundColor: style.matchedBg, borderColor: style.matchedBorder }
            : { backgroundColor: style.backgroundColor, borderColor: style.surfaceBorder },
        ]}
      >
        <Text style={[styles.symbol, { opacity: showFace ? 1 : 0, fontSize: Math.round(height * 0.42) }]} accessible={false}>
          {showFace ? card.symbol : ''}
        </Text>
        {!showFace ? (
          <Text
            style={[styles.question, { color: style.question, fontSize: Math.round(height * 0.3) }]}
            accessible={false}
          >
            ?
          </Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbol: {
    fontWeight: '600',
  },
  question: {
    fontWeight: '700',
  },
});
