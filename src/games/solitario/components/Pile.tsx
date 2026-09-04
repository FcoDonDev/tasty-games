import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useDragGesture } from '@/core/ui/drag/useDraggable';
import type { Card } from '../engine/deck';
import { cardPosition, type Rect, type SolitaireLayout } from '../engine/layout';
import { isValidSequence, type PileRef } from '../engine/rules';
import { PlayingCard } from './PlayingCard';

type PileKind = 'stock' | 'waste' | 'foundation' | 'tableau';

interface PileProps {
  layout: SolitaireLayout;
  rect: Rect;
  kind: PileKind;
  pileIndex?: number;
  cards: Card[];
  emptySymbol?: string;
  dragKey: string | null;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  onDragStart: (id: string) => void;
  onDragEnd: (id: string, translationX: number, translationY: number) => void;
  onPressStock?: () => void;
}

interface PileCardProps {
  card: Card;
  layout: SolitaireLayout;
  pileRef: PileRef;
  cards: Card[];
  index: number;
  draggable: boolean;
  dragActive: boolean;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  onDragStart: (id: string) => void;
  onDragEnd: (id: string, translationX: number, translationY: number) => void;
}

function PileCard({
  card,
  layout,
  pileRef,
  cards,
  index,
  draggable,
  dragActive,
  tx,
  ty,
  onDragStart,
  onDragEnd,
}: PileCardProps) {
  const gesture = useDragGesture(card.id, { onDragStart, onDragEnd }, draggable);
  const position = cardPosition(layout, pileRef, cards, index);
  const animatedStyle = useAnimatedStyle(
    () => ({
      transform: [
        { translateX: dragActive ? tx.value : 0 },
        { translateY: dragActive ? ty.value : 0 },
      ],
    }),
    [dragActive],
  );

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessibilityLabel={`solitario-card-${card.id}`}
        style={[
          styles.cardSlot,
          { left: position.x, top: position.y, zIndex: dragActive ? 100 + index : index },
          animatedStyle,
        ]}
      >
        <PlayingCard card={card} width={layout.cardWidth} height={layout.cardHeight} />
      </Animated.View>
    </GestureDetector>
  );
}

export function Pile({
  layout,
  rect,
  kind,
  pileIndex = 0,
  cards,
  emptySymbol,
  dragKey,
  tx,
  ty,
  onDragStart,
  onDragEnd,
  onPressStock,
}: PileProps) {
  const pileRef: PileRef =
    kind === 'waste'
      ? { kind: 'waste' }
      : kind === 'foundation'
        ? { kind: 'foundation', index: pileIndex }
        : { kind: 'tableau', index: pileIndex, cardIndex: 0 };

  const dragIndex = dragKey ? cards.findIndex((card) => card.id === dragKey) : -1;

  const isDraggable = (index: number): boolean => {
    if (kind !== 'waste' && kind !== 'foundation' && kind !== 'tableau') return false;
    if (kind !== 'tableau') return index === cards.length - 1;
    return cards[index].faceUp && isValidSequence(cards.slice(index));
  };

  const isDragActive = (index: number): boolean => {
    if (dragIndex === -1) return false;
    return kind === 'tableau' ? index >= dragIndex : index === dragIndex;
  };

  if (kind === 'stock') {
    const top = cards[cards.length - 1];
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="solitario-stock"
        accessibilityHint="Roba cartas del mazo"
        onPress={onPressStock}
        style={[styles.slot, styles.stockHit, { left: rect.x, top: rect.y, width: rect.width, height: rect.height }]}
      >
        {top ? (
          <View
            accessibilityLabel={`solitario-card-${top.id}`}
            style={styles.stockCard}
            pointerEvents="none"
          >
            <PlayingCard card={top} width={layout.cardWidth} height={layout.cardHeight} />
          </View>
        ) : (
          <Text style={[styles.emptySymbol, { fontSize: Math.round(rect.width * 0.4) }]}>↻</Text>
        )}
      </Pressable>
    );
  }

  // Solo las cartas visibles se renderizan (el resto queda debajo en la pila)
  const visibleCount = kind === 'waste' ? 3 : 1;
  const firstRendered = Math.max(0, cards.length - visibleCount);

  return (
    <Fragment>
      <View
        accessibilityLabel={`solitario-${kind}${kind === 'waste' ? '' : `-${pileIndex}`}`}
        style={[styles.slot, { left: rect.x, top: rect.y, width: rect.width, height: rect.height }]}
      >
        {emptySymbol ? (
          <Text style={[styles.emptySymbol, { fontSize: Math.round(rect.width * 0.4) }]}>{emptySymbol}</Text>
        ) : null}
      </View>

      {cards.slice(firstRendered).map((card, offset) => {
        const index = firstRendered + offset;
        return (
          <PileCard
            key={card.id}
            card={card}
            layout={layout}
            pileRef={pileRef}
            cards={cards}
            index={index}
            draggable={isDraggable(index)}
            dragActive={isDragActive(index)}
            tx={tx}
            ty={ty}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        );
      })}
    </Fragment>
  );
}

const styles = StyleSheet.create({
  slot: {
    position: 'absolute',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(148, 163, 184, 0.5)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockHit: {
    borderStyle: 'solid',
    overflow: 'visible',
  },
  stockCard: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  emptySymbol: {
    color: 'rgba(148, 163, 184, 0.7)',
    fontWeight: '700',
  },
  cardSlot: {
    position: 'absolute',
  },
});
