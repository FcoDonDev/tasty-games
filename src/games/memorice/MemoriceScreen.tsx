import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { GameScreenProps, GameResult } from '@/core/types';
import { ScoreBoard } from '@/core/ui/ScoreBoard';
import { useTheme } from '@/core/ui/ThemeProvider';
import { Card } from './components/Card';
import { MISMATCH_CLEAR_MS, PAIR_COUNT, scoreFor, useMemoriceStore } from './engine/state';

export default function MemoriceScreen({ onExit, onGameEnd }: GameScreenProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const columns = width < 420 ? 3 : 4;

  const cards = useMemoriceStore((state) => state.cards);
  const flipped = useMemoriceStore((state) => state.flipped);
  const matched = useMemoriceStore((state) => state.matched);
  const moves = useMemoriceStore((state) => state.moves);
  const startedAt = useMemoriceStore((state) => state.startedAt);
  const finishedAt = useMemoriceStore((state) => state.finishedAt);
  const flipCard = useMemoriceStore((state) => state.flipCard);
  const resolveMismatch = useMemoriceStore((state) => state.resolveMismatch);
  const reset = useMemoriceStore((state) => state.reset);

  const [showWin, setShowWin] = useState(false);
  const hasReportedRef = useRef(false);

  useEffect(() => {
    hasReportedRef.current = false;
    setShowWin(false);
    reset();
  }, [reset]);

  // Resuelve el par fallado tras un delay (la lógica vive en la UI, el store es puro)
  useEffect(() => {
    if (flipped.length < 2) return;
    const timer = setTimeout(() => resolveMismatch(), MISMATCH_CLEAR_MS);
    return () => clearTimeout(timer);
  }, [flipped, resolveMismatch]);

  // Fin del juego: reporta una única vez vía el contrato
  useEffect(() => {
    if (finishedAt === null || cards.length === 0 || hasReportedRef.current) return;
    hasReportedRef.current = true;
    const durationMs = startedAt !== null ? Math.max(0, finishedAt - startedAt) : 0;
    const result: GameResult = {
      gameId: 'memorice',
      won: true,
      score: scoreFor(moves),
      durationMs,
      finishedAt: new Date(finishedAt).toISOString(),
    };
    void onGameEnd(result);
    setShowWin(true);
  }, [finishedAt, cards.length, startedAt, moves, onGameEnd]);

  const handleReset = useCallback(() => {
    hasReportedRef.current = false;
    setShowWin(false);
    reset();
  }, [reset]);

  const isFaceUp = useCallback(
    (id: string) => flipped.includes(id) || matched.includes(id),
    [flipped, matched],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="salir-memorice"
          onPress={onExit}
          style={[styles.exitButton, { borderColor: theme.surfaceBorder }]}
        >
          <Text style={[styles.exitText, { color: theme.textMuted }]}>← Salir</Text>
        </Pressable>
        <Text style={[styles.moves, { color: theme.text }]}>Intentos: {moves}</Text>
      </View>

      <ScoreBoard gameId="memorice" />

      <FlatList
        data={cards}
        keyExtractor={(card) => card.id}
        numColumns={columns}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        renderItem={({ item, index }) => (
          <Card
            card={item}
            index={index}
            faceUp={isFaceUp(item.id)}
            matched={matched.includes(item.id)}
            disabled={flipped.length >= 2}
            onPress={() => flipCard(item.id)}
            style={{
              backgroundColor: theme.surface,
              surfaceBorder: theme.surfaceBorder,
              question: theme.textMuted,
              matchedBg: theme.primary,
              matchedBorder: theme.primary,
            }}
          />
        )}
      />

      {showWin ? (
        <View
          style={[styles.overlay, { backgroundColor: `${theme.background}F2` }]}
          accessibilityRole="alert"
          accessibilityLabel="modal-victoria-memorice"
        >
          <Text style={[styles.winTitle, { color: theme.text }]}>¡Ganaste! 🎉</Text>
          <Text style={[styles.winScore, { color: theme.primary }]}>
            {scoreFor(moves)} pts · {moves} intentos
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="jugar-de-nuevo-memorice"
            onPress={handleReset}
            style={[styles.winButton, { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.winButtonText, { color: theme.primaryText }]}>Jugar de nuevo</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="salir-al-home-memorice"
            onPress={onExit}
            style={[styles.exitButton, { borderColor: theme.surfaceBorder, marginTop: 8 }]}
          >
            <Text style={[styles.exitText, { color: theme.textMuted }]}>Salir</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 52,
  },
  exitButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  exitText: {
    fontSize: 14,
    fontWeight: '600',
  },
  moves: {
    fontSize: 16,
    fontWeight: '700',
  },
  grid: {
    paddingHorizontal: 12,
    paddingBottom: 24,
    gap: 4,
  },
  row: {
    gap: 0,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  winTitle: {
    fontSize: 28,
    fontWeight: '800',
  },
  winScore: {
    fontSize: 20,
    fontWeight: '700',
  },
  winButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  winButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
