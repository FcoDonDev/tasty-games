import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { GameScreenProps, GameResult } from '@/core/types';
import { GameHeader } from '@/core/ui/GameHeader';
import { PressableScale } from '@/core/ui/PressableScale';
import { hapticDropCommit, hapticGameWin, hapticSelection } from '@/core/ui/haptics';
import {
  primeAudioPlayers,
  soundCardDrop,
  soundCardMove,
  soundGameWin,
} from '@/core/ui/sound';
import { useTheme } from '@/core/ui/ThemeProvider';
import { useContainerSize } from '@/core/ui/useContainerSize';
import { overlayEnter, overlayExit } from '@/core/ui/overlayAnimation';
import { Card } from './components/Card';
import { columnsForWidth, computeCardSize, GAP } from './engine/layout';
import { parseSeed } from './engine/deck';
import {
  DEFAULT_DIFFICULTY,
  parseMemoriceDifficulty,
  recordGameId,
  type Difficulty,
} from './engine/difficulty';
import { MISMATCH_CLEAR_MS, scoreFor, useMemoriceStore } from './engine/state';
import { beginPerfSession, endPerfSession } from '@/core/perf';

export default function MemoriceScreen({
  onExit,
  onGameEnd,
  initialSeed,
  initialDifficulty,
  onActiveGameId,
}: GameScreenProps) {
  const theme = useTheme();
  // Tamaño real del área de tablero (onLayout): el grid llena el 100% disponible
  const { size, onLayout } = useContainerSize();

  const cards = useMemoriceStore((state) => state.cards);
  const flipped = useMemoriceStore((state) => state.flipped);
  const matched = useMemoriceStore((state) => state.matched);
  const moves = useMemoriceStore((state) => state.moves);
  const startedAt = useMemoriceStore((state) => state.startedAt);
  const finishedAt = useMemoriceStore((state) => state.finishedAt);
  const flipCard = useMemoriceStore((state) => state.flipCard);
  const resolveMismatch = useMemoriceStore((state) => state.resolveMismatch);
  const reset = useMemoriceStore((state) => state.reset);

  // D3/D5: la dificultad de la run llega por param del Home (modal SIEMPRE) o
  // deep-link; se inicializa SINCRÓNICAMENTE para que el primer reparto ya
  // tenga el nivel correcto (sin re-deal visible). "Jugar de nuevo" y restart
  // conservan este estado (D3).
  const [difficulty, setDifficulty] = useState<Difficulty>(
    () => parseMemoriceDifficulty(initialDifficulty) ?? DEFAULT_DIFFICULTY,
  );

  // El seed solo llega en builds E2E (EXPO_PUBLIC_E2E=1, gateado en
  // app/juego/[id].tsx): memorize antes repartía con Math.random() sin canal
  // determinista; los fixtures de performance lo exigen reproducible.
  const seed = useMemo(() => parseSeed(initialSeed), [initialSeed]);

  const [showWin, setShowWin] = useState(false);
  const hasReportedRef = useRef(false);

  // Columnas del grid: estandarizadas en 4 para los tres niveles
  // (4×4 / 4×5 / 4×6, PLAN-MEMORICE-DIFICULTAD — playtest).
  const columns = useMemo(() => (size ? columnsForWidth(size.width) : 4), [size]);

  // Tamaño de carta derivado del área medida en AMBAS dimensiones (sin scroll)
  const { cardWidth, cardHeight } = useMemo(
    () =>
      size
        ? computeCardSize(size.width, size.height, columns, cards.length)
        : { cardWidth: 0, cardHeight: 0 },
    [size, columns, cards.length],
  );
  const rows = useMemo(
    () => Array.from({ length: Math.ceil(cards.length / columns) }, (_, r) => cards.slice(r * columns, (r + 1) * columns)),
    [cards, columns],
  );

  // Sesión de métricas (no-op con EXPO_PUBLIC_PERF_METRICS off)
  useEffect(() => {
    beginPerfSession('memorice');
    return () => endPerfSession('memorice');
  }, []);

  // Juice (D8): prime en idle — el primer play no paga la creación (GOTCHAS).
  useEffect(() => {
    const id = setTimeout(() => primeAudioPlayers(['cardMove', 'cardDrop', 'gameWin']), 0);
    return () => clearTimeout(id);
  }, []);

  // D6: el ScoreBoard del header consulta la clave de la run activa.
  const onActiveGameIdRef = useRef(onActiveGameId);
  onActiveGameIdRef.current = onActiveGameId;
  useEffect(() => {
    onActiveGameIdRef.current?.(recordGameId(difficulty));
  }, [difficulty]);

  useEffect(() => {
    hasReportedRef.current = false;
    setShowWin(false);
    reset(seed, difficulty);
  }, [reset, seed, difficulty]);

  // Resuelve el par fallado tras un delay (la lógica vive en la UI, el store es puro)
  useEffect(() => {
    if (flipped.length < 2) return;
    const timer = setTimeout(() => resolveMismatch(), MISMATCH_CLEAR_MS);
    return () => clearTimeout(timer);
  }, [flipped, resolveMismatch]);

  // Fin del juego: reporta una única vez vía el contrato. Los valores se
  // re-leen SINCRÓNICAMENTE del store (`getState()`), no de la closure del
  // render: el store es un singleton que sobrevive al desmonte y al re-entrar
  // tras ganar este efecto corre en el MISMO commit que el reset (orden de
  // declaración) con valores STALE — ver el estado recién reseteado corta el
  // modal de victoria "fantasma" y el doble reporte del récord (bug PLAN).
  useEffect(() => {
    if (hasReportedRef.current) return;
    const fresh = useMemoriceStore.getState();
    if (fresh.finishedAt === null || fresh.cards.length === 0) return;
    hasReportedRef.current = true;
    const durationMs =
      fresh.startedAt !== null ? Math.max(0, fresh.finishedAt - fresh.startedAt) : 0;
    const result: GameResult = {
      gameId: recordGameId(difficulty),
      won: true,
      score: scoreFor(fresh.moves),
      durationMs,
      finishedAt: new Date(fresh.finishedAt).toISOString(),
    };
    void onGameEnd(result);
    soundGameWin();
    hapticGameWin();
    setShowWin(true);
  }, [finishedAt, cards.length, startedAt, moves, difficulty, onGameEnd]);

  const handleReset = useCallback(() => {
    hasReportedRef.current = false;
    setShowWin(false);
    reset(seed, difficulty);
  }, [reset, seed, difficulty]);

  // Juice por flip (D8): la primera carta suena pluck + tick; la segunda, si
  // cierra match suena snap + impacto light (y NO pluck). El flip-back del
  // mismatch (resuelto por timer) queda silencioso. Sin sonido si el flip fue
  // no-op (carta emparejada o 2 ya volteadas).
  const handleFlip = useCallback(
    (id: string) => {
      const before = useMemoriceStore.getState();
      const prevMatched = before.matched.length;
      const prevFlipped = before.flipped.length;
      flipCard(id);
      const after = useMemoriceStore.getState();
      if (after.matched.length > prevMatched) {
        soundCardDrop();
        hapticDropCommit();
      } else if (after.flipped.length > prevFlipped) {
        soundCardMove();
        hapticSelection();
      }
    },
    [flipCard],
  );

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

      <View style={styles.board} onLayout={onLayout}>
        {size !== null
          ? rows.map((row, rowIndex) => (
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
                      onPress={() => handleFlip(card.id)}
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
            ))
          : null}
      </View>

      {showWin ? (
        <Animated.View
          entering={overlayEnter()}
          exiting={overlayExit()}
          style={[styles.overlay, { backgroundColor: `${theme.background}F2` }]}
          accessibilityRole="alert"
          accessibilityLabel="modal-victoria-memorice"
        >
          <Text style={[styles.winTitle, { color: theme.text }]}>¡Ganaste! 🎉</Text>
          <Text style={[styles.winScore, { color: theme.primary }]}>
            {scoreFor(moves)} pts · {moves} intentos
          </Text>
          <PressableScale
            accessibilityLabel="jugar-de-nuevo-memorice"
            onPress={handleReset}
            style={[styles.winButton, { backgroundColor: theme.primary, borderCurve: 'continuous' }]}
          >
            <Text style={[styles.winButtonText, { color: theme.primaryText }]}>Jugar de nuevo</Text>
          </PressableScale>
          <PressableScale
            accessibilityLabel="salir-al-home-memorice"
            onPress={onExit}
            style={[styles.exitButton, { borderColor: theme.surfaceBorder, marginTop: 8, borderCurve: 'continuous' }]}
          >
            <Text style={[styles.exitText, { color: theme.textMuted }]}>Salir</Text>
          </PressableScale>
        </Animated.View>
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
    fontVariant: ['tabular-nums'],
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
    alignContent: 'center',
    gap: GAP,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: GAP,
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
