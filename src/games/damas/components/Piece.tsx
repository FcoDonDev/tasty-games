import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useDragGesture, type DragCallbacks } from '@/core/ui/drag/useDraggable';
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
  callbacks: DragCallbacks;
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
  callbacks,
}: PieceViewProps) {
  const gesture = useDragGesture(piece.id, callbacks, draggable, { tx, ty });
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);

  useEffect(() => {
    // Lift: feedback en press-in, ~150ms, UI thread (ReduceMotion: salto directo)
    scale.set(withTiming(dragActive ? 1.08 : 1, { duration: 150 }));
    rotate.set(withTiming(dragActive ? 1.5 : 0, { duration: 150 }));
  }, [dragActive, scale, rotate]);

  const animatedStyle = useAnimatedStyle(
    () => ({
      transform: [
        { translateX: dragActive ? tx.get() : 0 },
        { translateY: dragActive ? ty.get() : 0 },
        { rotate: `${rotate.get()}deg` },
        { scale: scale.get() },
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
