import { Fragment, memo, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useDragGesture, type DragCallbacks } from '@/core/ui/drag/useDraggable';
import { perfRenderCount } from '@/core/perf';
import { useTheme } from '@/core/ui/ThemeProvider';
import type { Card } from '../engine/deck';
import { cardPosition, type Rect, type SolitaireLayout } from '../engine/layout';
import { isValidSequence, type PileRef } from '../engine/rules';
import { PlayingCard } from './PlayingCard';

type PileKind = 'stock' | 'waste' | 'foundation' | 'tableau';

/** Reparto animado (plan D9): onda por columna, fade-only, < 550ms total. */
export const DEAL_FADE_MS = 180;
export const DEAL_COLUMN_DELAY_MS = 50;
export const DEAL_ANIM_TOTAL_MS = DEAL_COLUMN_DELAY_MS * 6 + DEAL_FADE_MS + 40;

interface PileProps {
  layout: SolitaireLayout;
  rect: Rect;
  kind: PileKind;
  pileIndex?: number;
  cards: Card[];
  emptySymbol?: string;
  /** Drop legal sobre esta pila: se resalta el slot */
  highlighted?: boolean;
  dragKey: string | null;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  callbacks: DragCallbacks;
  /** Escala del contenido de las cartas (setting, ver engine/state ContentScale) */
  contentScale: number;
  /** Reparto en curso (solo tableau): entrada escalonada + drag gated (D9) */
  dealing?: boolean;
  onPressStock?: () => void;
  /** Auto-envío a foundation vía doble tap / clic derecho sobre una carta */
  onAutoMove?: (id: string) => void;
}

interface PileCardProps {
  card: Card;
  layout: SolitaireLayout;
  /** Coordenadas precomputadas (números estables): nada de objetos nuevos por render */
  x: number;
  y: number;
  index: number;
  draggable: boolean;
  dragActive: boolean;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  callbacks: DragCallbacks;
  /** Escala del contenido de la carta (prop numérica estable para memo) */
  contentScale: number;
  /** Fase de reparto: la carta monta con FadeIn escalonado por columna (D9) */
  dealing: boolean;
  /** Delay de entrada de la columna de esta carta (ms) */
  dealDelayMs: number;
  /** Auto-envío a foundation: clic derecho en web (en nativo no ocurre el evento) */
  onAutoMove?: (id: string) => void;
}

const IS_WEB = process.env.EXPO_OS === 'web';

// memo: al cambiar el estado (drag start/end, commit del store) solo re-renderizan
// las cartas cuyas props cambiaron; el resto de las ~52 salta la reconciliación.
const PileCard = memo(function PileCard({
  card,
  layout,
  x,
  y,
  index,
  draggable,
  dragActive,
  tx,
  ty,
  callbacks,
  contentScale,
  dealing,
  dealDelayMs,
  onAutoMove,
}: PileCardProps) {
  const gesture = useDragGesture(card.id, callbacks, draggable, { tx, ty });
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    // Lift: feedback en press-in, ~150ms, UI thread (ReduceMotion: salto directo)
    scale.set(withTiming(dragActive ? 1.05 : 1, { duration: 150 }));
    rotate.set(withTiming(dragActive ? 1.5 : 0, { duration: 150 }));
  }, [dragActive, scale, rotate]);

  // Entrada del reparto: `entering` SOLO durante la fase de deal (D9). Un
  // entering permanente re-animaría en cada montaje (las cartas cambian de
  // pila al moverse); al apagarse el flag, los montajes posteriores no animan.
  const dealEntering = useMemo(
    () =>
      dealing
        ? FadeIn.duration(DEAL_FADE_MS).delay(reduced ? 0 : dealDelayMs)
        : undefined,
    [dealing, reduced, dealDelayMs],
  );

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

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessibilityLabel={`solitario-card-${card.id}`}
        entering={dealEntering}
        style={[
          styles.cardSlot,
          { left: x, top: y, zIndex: dragActive ? 100 + index : index },
          dragActive ? styles.cardLift : null,
          animatedStyle,
        ]}
        {...(IS_WEB && onAutoMove
          ? // rn-web reenvía onContextMenu al DOM (forwardedProps); no está
            // en los tipos de RN: cast + gate web. En nativo el evento no ocurre.
            ({
              onContextMenu: (e: { preventDefault?: () => void }) => {
                e.preventDefault?.();
                if (__DEV__) {
                  // eslint-disable-next-line no-console
                  console.debug('[solitario:contextmenu] card=', card.id);
                }
                onAutoMove(card.id);
              },
            } as unknown as Record<string, never>)
          : null)}
      >
        <PlayingCard card={card} width={layout.cardWidth} height={layout.cardHeight} scale={contentScale} />
      </Animated.View>
    </GestureDetector>
  );
});

export const Pile = memo(function Pile({
  layout,
  rect,
  kind,
  pileIndex = 0,
  cards,
  emptySymbol,
  highlighted = false,
  dragKey,
  tx,
  ty,
  callbacks,
  contentScale,
  dealing = false,
  onPressStock,
  onAutoMove,
}: PileProps) {
  const theme = useTheme();
  // Contador de renders por pila (CA3): verifica la efectividad de la memoización
  perfRenderCount('solitario', `pile:${kind === 'waste' ? 'waste' : `${kind}-${pileIndex}`}`);

  // Ref estable: si se recrea por render, rompería el memo de los PileCard
  const pileRef: PileRef = useMemo<PileRef>(
    () =>
      kind === 'waste'
        ? { kind: 'waste' }
        : kind === 'foundation'
          ? { kind: 'foundation', index: pileIndex }
          : { kind: 'tableau', index: pileIndex, cardIndex: 0 },
    [kind, pileIndex],
  );

  const dragIndex = dragKey ? cards.findIndex((card) => card.id === dragKey) : -1;

  const isDraggable = (index: number): boolean => {
    // Durante el reparto animado el drag queda habilitado solo al terminar
    // (listo = jugable, plan D5/D9); stock/waste no tienen cartas que arrastrar
    // en ese momento, el gate solo afecta al tableau.
    if (dealing) return false;
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
            <PlayingCard card={top} width={layout.cardWidth} height={layout.cardHeight} scale={contentScale} />
          </View>
        ) : (
          <Text style={[styles.emptySymbol, { fontSize: Math.round(rect.width * 0.4) }]}>↻</Text>
        )}
      </Pressable>
    );
  }

  // Cartas visibles por pila: tableau muestra TODAS (fan), waste las últimas 3,
  // foundation solo el top (el resto queda tapado).
  const firstRendered =
    kind === 'tableau' ? 0 : Math.max(0, cards.length - (kind === 'waste' ? 3 : 1));

  return (
    <Fragment>
      <View
        accessibilityLabel={`solitario-${kind}${kind === 'waste' ? '' : `-${pileIndex}`}`}
        style={[
          styles.slot,
          { left: rect.x, top: rect.y, width: rect.width, height: rect.height },
          highlighted ? { borderColor: theme.primary, borderWidth: 2, borderStyle: 'solid' } : null,
          highlighted ? styles.slotGlow : null,
        ]}
      >
        {emptySymbol ? (
          <Text
            style={[
              styles.emptySymbol,
              { fontSize: Math.round(rect.width * 0.4), color: highlighted ? theme.primary : undefined },
            ]}
          >
            {emptySymbol}
          </Text>
        ) : null}
      </View>

      {cards.slice(firstRendered).map((card, offset) => {
        const index = firstRendered + offset;
        const { x, y } = cardPosition(layout, pileRef, cards, index);
        return (
          <PileCard
            key={card.id}
            card={card}
            layout={layout}
            x={x}
            y={y}
            index={index}
            draggable={isDraggable(index)}
            dragActive={isDragActive(index)}
            tx={tx}
            ty={ty}
            callbacks={callbacks}
            contentScale={contentScale}
            dealing={dealing}
            dealDelayMs={pileIndex * DEAL_COLUMN_DELAY_MS}
            onAutoMove={onAutoMove}
          />
        );
      })}
    </Fragment>
  );
});
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
  slotGlow: {
    boxShadow: '0 0 10px rgba(59, 130, 246, 0.55)',
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
  cardLift: {
    boxShadow: '0 6px 14px rgba(15, 23, 42, 0.35)',
  },
});
