import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useDragGesture } from '@/core/ui/drag/useDraggable';
import type { Piece } from '../engine/board';

const COLORS = {
  1: { fill: '#F8FAFC', border: '#334155', glyph: '#334155' },
  2: { fill: '#1E293B', border: '#F1F5F9', glyph: '#F8FAFC' },
} as const;

interface PieceViewProps {
  piece: Piece;
  /** lado de la casilla; la ficha es ~78% */
  square: number;
  /** posición (coords del contenedor) de la casilla que ocupa */
  x: number;
  y: number;
  draggable: boolean;
  dragActive: boolean;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  onDragStart: (id: string) => void;
  onDragEnd: (id: string, translationX: number, translationY: number) => void;
}

export function PieceView({
  piece,
  square,
  x,
  y,
  draggable,
  dragActive,
  tx,
  ty,
  onDragStart,
  onDragEnd,
}: PieceViewProps) {
  const gesture = useDragGesture(piece.id, { onDragStart, onDragEnd }, draggable);
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = dragActive ? withSpring(1.08, { damping: 20 }) : withSpring(1);
  }, [dragActive, scale]);

  const animatedStyle = useAnimatedStyle(
    () => ({
      transform: [
        { translateX: dragActive ? tx.value : 0 },
        { translateY: dragActive ? ty.value : 0 },
        { scale: scale.value },
      ],
    }),
    [dragActive],
  );

  const colors = COLORS[piece.player];
  const diameter = Math.round(square * 0.78);
  const offset = (square - diameter) / 2;

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessibilityLabel={`damas-ficha-${piece.id}`}
        style={[
          styles.piece,
          {
            left: x + offset,
            top: y + offset,
            width: diameter,
            height: diameter,
            borderRadius: diameter / 2,
            backgroundColor: colors.fill,
            borderColor: colors.border,
            zIndex: dragActive ? 100 : 10,
          },
          dragActive ? styles.lift : null,
          animatedStyle,
        ]}
      >
        {piece.king ? (
          <Text style={[styles.kingGlyph, { color: colors.glyph, fontSize: diameter * 0.48 }]}>
            {'★'}
          </Text>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lift: {
    boxShadow: '0 6px 14px rgba(15, 23, 42, 0.45)',
  },
  kingGlyph: {
    fontWeight: '800',
  },
});
