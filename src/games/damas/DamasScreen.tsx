import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ReduceMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { GameScreenProps } from '@/core/types';
import { GameHeader } from '@/core/ui/GameHeader';
import { hapticDropCommit, hapticGameWin } from '@/core/ui/haptics';
import { useTheme } from '@/core/ui/ThemeProvider';
import { useContainerSize } from '@/core/ui/useContainerSize';
import type { DragCallbacks } from '@/core/ui/drag/useDraggable';
import { isDark, parseSetupSeed } from './engine/board';
import { computeLayout, hitTestSquare, squarePosition } from './engine/layout';
import { legalMovesForPiece, movablePieceIds, type Move } from './engine/rules';
import { useDamasStore } from './engine/state';
import { PieceView } from './components/Piece';

export default function DamasScreen({ onExit, initialSeed }: GameScreenProps) {
  const theme = useTheme();
  // Tamaño real del área de tablero (onLayout): tablero cuadrado centrado
  const { size, onLayout } = useContainerSize();
  const layout = useMemo(() => (size ? computeLayout(size.width, size.height) : null), [size]);

  const board = useDamasStore((s) => s.board);
  const turn = useDamasStore((s) => s.turn);
  const moves = useDamasStore((s) => s.moves);
  const finishedAt = useDamasStore((s) => s.finishedAt);
  const winner = useDamasStore((s) => s.winner);
  const reset = useDamasStore((s) => s.reset);

  const [ready, setReady] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  /** Casillas con destino legal para la ficha arrastrada */
  const [validTargets, setValidTargets] = useState<Set<number>>(() => new Set());

  // Estado del arrastre: shared values para el gesto + refs con el origen y moves
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const dragFromRef = useRef<number | null>(null);
  const movesByTargetRef = useRef<Map<number, Move>>(new Map());

  useEffect(() => {
    reset(parseSetupSeed(initialSeed));
    setReady(true);
  }, [reset, initialSeed]);

  // Victoria: haptic de éxito (visual: overlay de fin)
  useEffect(() => {
    if (winner !== null) hapticGameWin();
  }, [winner]);

  // Fichas arrastrables del jugador en turno (con captura obligatoria aplicada)
  const movable = useMemo(
    () => (finishedAt === null ? movablePieceIds(board, turn) : new Set<string>()),
    [board, turn, finishedAt],
  );

  const finishDrag = useCallback(() => {
    setDragKey(null);
  }, []);

  const handleDragStart = useCallback((id: string) => {
    const state = useDamasStore.getState();
    if (state.finishedAt !== null) return;
    const from = state.board.findIndex((item) => item?.id === id);
    if (from === -1) return;
    const pieceMoves = legalMovesForPiece(state.board, from);
    if (pieceMoves.length === 0) return;
    dragFromRef.current = from;
    movesByTargetRef.current = new Map(pieceMoves.map((m) => [m.path[m.path.length - 1], m]));
    setValidTargets(new Set(movesByTargetRef.current.keys()));
    setDragKey(id);
  }, []);

  const handleDragEnd = useCallback(
    (
      id: string,
      translationX: number,
      translationY: number,
      velocityX: number,
      velocityY: number,
    ) => {
      const from = dragFromRef.current;
      dragFromRef.current = null;
      setValidTargets(new Set());
      if (from === null || layout === null) {
        setDragKey(null);
        tx.set(0);
        ty.set(0);
        return;
      }

      // Drop point = centro de la casilla de origen + traslación del gesto
      const origin = squarePosition(layout, from);
      const dropX = origin.x + layout.square / 2 + translationX;
      const dropY = origin.y + layout.square / 2 + translationY;
      const target = hitTestSquare(layout, dropX, dropY);
      const move = target !== null ? movesByTargetRef.current.get(target) : undefined;
      movesByTargetRef.current = new Map();
      const moved = move ? useDamasStore.getState().applyMove(move) : false;

      // Spring con handoff de velocidad del gesto (settle y snap-back)
      const springConfig = (velocity: number) => ({
        duration: 400,
        dampingRatio: 0.8,
        velocity,
        reduceMotion: ReduceMotion.System,
      });
      const spring = (axis: 'x' | 'y') =>
        withSpring(0, springConfig(axis === 'x' ? velocityX : velocityY));

      if (moved && target !== null) {
        // Haptic en el frame causal del commit, junto al settle visual
        hapticDropCommit();
        // Settle: la ficha queda donde el dedo la soltó y glisa a su asiento
        const dest = squarePosition(layout, target);
        tx.set(origin.x + translationX - dest.x);
        ty.set(origin.y + translationY - dest.y);
        tx.set(spring('x'));
        ty.set(withSpring(0, springConfig(velocityY), () => scheduleOnRN(finishDrag)));
      } else {
        // Snap-back con spring
        tx.set(spring('x'));
        ty.set(withSpring(0, springConfig(velocityY), () => scheduleOnRN(finishDrag)));
      }
    },
    [layout, tx, ty, finishDrag],
  );

  const dragCallbacks = useMemo<DragCallbacks>(
    () => ({ onDragStart: handleDragStart, onDragEnd: handleDragEnd, onDragCancel: finishDrag }),
    [handleDragStart, handleDragEnd, finishDrag],
  );

  const handleReplay = useCallback(() => {
    reset();
  }, [reset]);

  const handleRestart = useCallback(() => {
    reset();
  }, [reset]);

  if (!ready) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <GameHeader
        gameId="damas"
        onExit={onExit}
        onRestart={handleRestart}
        center={
          <View style={styles.centerStack}>
            <Text
              accessibilityLabel={`damas-turno-${turn}`}
              style={[styles.turn, { color: theme.text }]}
            >
              Turno: Jugador {turn}
            </Text>
            <Text style={[styles.moves, { color: theme.textMuted }]}>Movimientos: {moves}</Text>
          </View>
        }
      />

      <View style={styles.board} onLayout={onLayout}>
        {layout !== null ? (
          <>
            {Array.from({ length: 64 }, (_, i) => {
              const pos = squarePosition(layout, i);
              const dark = isDark(i);
              return (
                <View
                  key={i}
                  accessibilityLabel={dark ? `damas-celda-${i}` : undefined}
                  style={[
                    styles.square,
                    {
                      left: pos.x,
                      top: pos.y,
                      width: layout.square,
                      height: layout.square,
                      backgroundColor: dark ? '#B58863' : '#F0D9B5',
                    },
                    dark && validTargets.has(i) ? styles.targetSquare : null,
                  ]}
                />
              );
            })}

            {board.map((pieceItem, index) =>
              pieceItem ? (
                <PieceView
                  key={pieceItem.id}
                  piece={pieceItem}
                  square={layout.square}
                  x={squarePosition(layout, index).x}
                  y={squarePosition(layout, index).y}
                  draggable={movable.has(pieceItem.id)}
                  dragActive={dragKey === pieceItem.id}
                  tx={tx}
                  ty={ty}
                  callbacks={dragCallbacks}
                />
              ) : null,
            )}
          </>
        ) : null}
      </View>

      {winner !== null ? (
        <View
          style={[styles.overlay, { backgroundColor: `${theme.background}F2` }]}
          accessibilityRole="alert"
          accessibilityLabel="modal-fin-damas"
        >
          <Text style={[styles.overlayTitle, { color: theme.text }]}>
            ¡Gana Jugador {winner}! 🎉
          </Text>
          <Text style={[styles.overlaySubtitle, { color: theme.textMuted }]}>
            {moves} movimientos
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="jugar-de-nuevo-damas"
            onPress={handleReplay}
            style={[styles.overlayButton, { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.overlayButtonText, { color: theme.primaryText }]}>
              Jugar de nuevo
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="salir-al-home-damas"
            onPress={onExit}
            style={[styles.headerButton, { borderColor: theme.surfaceBorder, marginTop: 8 }]}
          >
            <Text style={[styles.headerButtonText, { color: theme.textMuted }]}>Salir</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  turn: {
    fontSize: 15,
    fontWeight: '700',
  },
  centerStack: {
    alignItems: 'center',
  },
  moves: {
    fontSize: 13,
    fontWeight: '600',
  },
  board: {
    flex: 1,
  },
  square: {
    position: 'absolute',
  },
  targetSquare: {
    borderWidth: 3,
    borderColor: '#2563EB',
    borderStyle: 'solid',
    boxShadow: '0 0 10px rgba(59, 130, 246, 0.55)',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  overlayTitle: {
    fontSize: 28,
    fontWeight: '800',
  },
  overlaySubtitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  overlayButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  overlayButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
