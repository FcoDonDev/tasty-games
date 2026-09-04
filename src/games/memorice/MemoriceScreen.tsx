import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { GameScreenProps, GameResult } from '@/core/types';
import { GameHeader } from '@/core/ui/GameHeader';
import { ScoreBoard } from '@/core/ui/ScoreBoard';
import { useTheme } from '@/core/ui/ThemeProvider';
import { Card } from './components/Card';
import { columnsForWidth, computeCardSize } from './engine/layout';
import { MISMATCH_CLEAR_MS, PAIR_COUNT, scoreFor, useMemoriceStore } from './engine/state';

export default function MemoriceScreen({ onExit, onGameEnd }: GameScreenProps) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const columns = columnsForWidth(width);

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

  // Tamaño de carta derivado de ancho Y alto: el grid completo cabe sin scroll
  const { cardWidth, cardHeight } = useMemo(
    () => computeCardSize(width, height, columns, PAIR_COUNT * 2),
    [width, height, columns],
  );
  const rows = useMemo(
    () => Array.from({ length: Math.ceil(cards.length / columns) }, (_, r) => cards.slice(r * columns, (r + 1) * columns)),
    [cards, columns],
  );

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
      <GameHeader
        gameId="memorice"
        onExit={onExit}
        onRestart={handleReset}
        center={<Text style={[styles.moves, { color: theme.text }]}>Intentos: {moves}</Text>}
      />

      <ScoreBoard gameId="memorice" />

      <View style={styles.board}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((card, indexInRow) => {
              const index = rowIndex * columns + indexInRow;
              return (
                <Card
                  key={card.id}
                  card={card}
                  index={index}
                  faceUp={isFaceUp(card.id)}
                  matched={matched.includes(card.id)}
                  disabled={flipped.length >= 2}
                  onPress={() => flipCard(card.id)}
                  width={cardWidth}
                  height={cardHeight}
                  style={{
                    backgroundColor: theme.surface,
                    surfaceBorder: theme.surfaceBorder,
                    question: theme.textMuted,
                    matchedBg: theme.primary,
                    matchedBorder: theme.primary,
                  }}
                />
              );
            })}
          </View>
        ))}
      </View>

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
  moves: {
    fontSize: 16,
    fontWeight: '700',
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
  board: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
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
