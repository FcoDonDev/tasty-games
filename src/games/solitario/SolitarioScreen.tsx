import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';
import type { GameResult, GameScreenProps } from '@/core/types';
import { preferencesRepository } from '@/core/db/repositories/preferencesRepository';
import { ScoreBoard } from '@/core/ui/ScoreBoard';
import { useTheme } from '@/core/ui/ThemeProvider';
import { Pile } from './components/Pile';
import { SettingsModal } from './components/SettingsModal';
import { SUITS, SUIT_SYMBOLS, parseSeed, type Card } from './engine/deck';
import { cardPosition, columnExtent, computeLayout, hitTestPile } from './engine/layout';
import { canPickUp, foundationIndexFor, scoreFor, type PileRef } from './engine/rules';
import { useSolitarioStore, type DrawMode } from './engine/state';

const PREF_DRAW = 'solitario.drawMode';
const PREF_UNDO = 'solitario.undo';

function findRefByCardId(
  tableau: Card[][],
  waste: Card[],
  foundations: Card[][],
  id: string,
): PileRef | null {
  const wasteTop = waste[waste.length - 1];
  if (wasteTop?.id === id) return { kind: 'waste' };
  for (let i = 0; i < foundations.length; i++) {
    const top = foundations[i][foundations[i].length - 1];
    if (top?.id === id) return { kind: 'foundation', index: i };
  }
  for (let col = 0; col < tableau.length; col++) {
    const index = tableau[col].findIndex((card) => card.id === id);
    if (index !== -1) return { kind: 'tableau', index: col, cardIndex: index };
  }
  return null;
}

function pileCards(ref: PileRef, tableau: Card[][], waste: Card[], foundations: Card[][]): Card[] {
  switch (ref.kind) {
    case 'waste':
      return waste;
    case 'foundation':
      return foundations[ref.index];
    case 'tableau':
      return tableau[ref.index];
  }
}

export default function SolitarioScreen({ onExit, onGameEnd, initialSeed }: GameScreenProps) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const layout = useMemo(() => computeLayout(width, height), [width, height]);

  const tableau = useSolitarioStore((s) => s.tableau);
  const waste = useSolitarioStore((s) => s.waste);
  const stock = useSolitarioStore((s) => s.stock);
  const foundations = useSolitarioStore((s) => s.foundations);
  const moves = useSolitarioStore((s) => s.moves);
  const undos = useSolitarioStore((s) => s.undos);
  const undoEnabled = useSolitarioStore((s) => s.undoEnabled);
  const historyDepth = useSolitarioStore((s) => s.history.length);
  const startedAt = useSolitarioStore((s) => s.startedAt);
  const finishedAt = useSolitarioStore((s) => s.finishedAt);
  const stuck = useSolitarioStore((s) => s.stuck);
  const reset = useSolitarioStore((s) => s.reset);
  const drawStock = useSolitarioStore((s) => s.drawStock);
  const moveCards = useSolitarioStore((s) => s.moveCards);
  const setUndoEnabled = useSolitarioStore((s) => s.setUndoEnabled);

  const [ready, setReady] = useState(false);
  const [showWin, setShowWin] = useState(false);
  const [showLose, setShowLose] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [drawPref, setDrawPref] = useState<DrawMode>(1);
  const [undoPref, setUndoPref] = useState(false);
  const hasReportedRef = useRef(false);

  // Estado del arrastre: shared values para el gesto + ref con el origen
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const dragRef = useRef<PileRef | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);

  // Carga de preferencias + primer reparto (con seed de test si viene gated)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [drawRaw, undoRaw] = await Promise.all([
        preferencesRepository.get(PREF_DRAW),
        preferencesRepository.get(PREF_UNDO),
      ]);
      if (cancelled) return;
      const loadedDraw: DrawMode = drawRaw === '3' ? 3 : 1;
      const loadedUndo = undoRaw === '1';
      setDrawPref(loadedDraw);
      setUndoPref(loadedUndo);
      reset({
        seed: parseSeed(initialSeed),
        drawMode: loadedDraw,
        undoEnabled: loadedUndo,
      });
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [reset, initialSeed]);

  // Victoria: reporte único vía el contrato
  useEffect(() => {
    if (finishedAt === null || startedAt === null || hasReportedRef.current) return;
    hasReportedRef.current = true;
    const durationMs = Math.max(0, finishedAt - startedAt);
    const result: GameResult = {
      gameId: 'solitario',
      won: true,
      score: scoreFor(moves, durationMs, undos),
      durationMs,
      finishedAt: new Date(finishedAt).toISOString(),
    };
    void onGameEnd(result);
    setShowWin(true);
  }, [finishedAt, startedAt, moves, undos, onGameEnd]);

  // Sin movimientos: modal de derrota (sin récord, S5)
  useEffect(() => {
    if (stuck && finishedAt === null) setShowLose(true);
  }, [stuck, finishedAt]);

  const handleDragStart = useCallback((id: string) => {
    const state = useSolitarioStore.getState();
    if (state.finishedAt !== null || state.stuck) return;
    const ref = findRefByCardId(state.tableau, state.waste, state.foundations, id);
    if (!ref || !canPickUp(state, ref)) return;
    dragRef.current = ref;
    setDragKey(id);
  }, []);

  const finishSnapBack = useCallback(() => setDragKey(null), []);

  const handleDragEnd = useCallback(
    (id: string, translationX: number, translationY: number) => {
      const ref = dragRef.current;
      dragRef.current = null;
      if (!ref) {
        setDragKey(null);
        tx.value = 0;
        ty.value = 0;
        return;
      }

      const state = useSolitarioStore.getState();
      const cards = pileCards(ref, state.tableau, state.waste, state.foundations);
      const index = ref.kind === 'tableau' ? ref.cardIndex : cards.length - 1;
      const origin = cardPosition(layout, ref, cards, index);
      const dropX = origin.x + layout.cardWidth / 2 + translationX;
      const dropY = origin.y + layout.cardHeight / 2 + translationY;
      const target = hitTestPile(layout, dropX, dropY, state.tableau);
      const moved = target ? state.moveCards(ref, target) : false;

      if (moved) {
        // El re-render coloca la carta en el destino: reset inmediato, sin animación
        tx.value = 0;
        ty.value = 0;
        setDragKey(null);
      } else {
        // Snap-back animado; dragKey se mantiene hasta terminar para no cortar el transform
        tx.value = withTiming(0, { duration: 160 });
        ty.value = withTiming(0, { duration: 160 }, () => {
          runOnJS(finishSnapBack)();
        });
      }
    },
    [layout, tx, ty, finishSnapBack],
  );

  const currentSettings = useMemo(
    () => ({ drawMode: drawPref, undoEnabled: undoPref }),
    [drawPref, undoPref],
  );

  const handleReplay = useCallback(() => {
    hasReportedRef.current = false;
    setShowWin(false);
    setShowLose(false);
    reset(currentSettings);
  }, [reset, currentSettings]);

  const handleChangeDrawMode = useCallback((mode: DrawMode) => {
    setDrawPref(mode);
    void preferencesRepository.set(PREF_DRAW, String(mode));
  }, []);

  const handleChangeUndo = useCallback(
    (enabled: boolean) => {
      setUndoPref(enabled);
      setUndoEnabled(enabled);
      void preferencesRepository.set(PREF_UNDO, enabled ? '1' : '0');
    },
    [setUndoEnabled],
  );

  const boardHeight = useMemo(() => {
    if (tableau.length === 0) return layout.topRowHeight + 200;
    const maxExtent = Math.max(...tableau.map((col) => columnExtent(layout, col)));
    return layout.tableau[0].y + maxExtent + 16;
  }, [layout, tableau]);

  if (!ready) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="salir-solitario"
          onPress={onExit}
          style={[styles.headerButton, { borderColor: theme.surfaceBorder }]}
        >
          <Text style={[styles.headerButtonText, { color: theme.textMuted }]}>← Salir</Text>
        </Pressable>

        <Text style={[styles.moves, { color: theme.text }]}>Movimientos: {moves}</Text>

        <View style={styles.headerActions}>
          {undoEnabled && historyDepth > 0 && finishedAt === null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="solitario-undo"
              onPress={() => useSolitarioStore.getState().undo()}
              style={[styles.headerButton, { borderColor: theme.surfaceBorder }]}
            >
              <Text style={[styles.headerButtonText, { color: theme.textMuted }]}>↩</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="solitario-abrir-ajustes"
            onPress={() => setShowSettings(true)}
            style={[styles.headerButton, { borderColor: theme.surfaceBorder }]}
          >
            <Text style={[styles.headerButtonText, { color: theme.textMuted }]}>⚙</Text>
          </Pressable>
        </View>
      </View>

      <ScoreBoard gameId="solitario" />

      <View style={[styles.board, { height: boardHeight }]}>
        <Pile
          layout={layout}
          rect={layout.stock}
          kind="stock"
          cards={stock}
          dragKey={dragKey}
          tx={tx}
          ty={ty}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onPressStock={drawStock}
        />
        <Pile
          layout={layout}
          rect={layout.waste}
          kind="waste"
          cards={waste}
          dragKey={dragKey}
          tx={tx}
          ty={ty}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
        {layout.foundations.map((rect, i) => (
          <Pile
            key={`foundation-${i}`}
            layout={layout}
            rect={rect}
            kind="foundation"
            pileIndex={i}
            cards={foundations[i]}
            emptySymbol={SUIT_SYMBOLS[SUITS[i]]}
            dragKey={dragKey}
            tx={tx}
            ty={ty}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        ))}
        {layout.tableau.map((rect, i) => (
          <Pile
            key={`tableau-${i}`}
            layout={layout}
            rect={rect}
            kind="tableau"
            pileIndex={i}
            cards={tableau[i]}
            dragKey={dragKey}
            tx={tx}
            ty={ty}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        ))}
      </View>

      <SettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        drawMode={drawPref}
        undoEnabled={undoPref}
        onChangeDrawMode={handleChangeDrawMode}
        onChangeUndo={handleChangeUndo}
      />

      {showWin ? (
        <View
          style={[styles.overlay, { backgroundColor: `${theme.background}F2` }]}
          accessibilityRole="alert"
          accessibilityLabel="modal-victoria-solitario"
        >
          <Text style={[styles.overlayTitle, { color: theme.text }]}>¡Ganaste! 🎉</Text>
          <Text style={[styles.overlayScore, { color: theme.primary }]}>
            {scoreFor(moves, (finishedAt ?? 0) - (startedAt ?? 0), undos)} pts · {moves} movimientos
            {undos > 0 ? ` · ${undos} undos` : ''}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="jugar-de-nuevo-solitario"
            onPress={handleReplay}
            style={[styles.overlayButton, { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.overlayButtonText, { color: theme.primaryText }]}>Jugar de nuevo</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="salir-al-home-solitario"
            onPress={onExit}
            style={[styles.headerButton, { borderColor: theme.surfaceBorder, marginTop: 8 }]}
          >
            <Text style={[styles.headerButtonText, { color: theme.textMuted }]}>Salir</Text>
          </Pressable>
        </View>
      ) : null}

      {showLose && !showWin ? (
        <View
          style={[styles.overlay, { backgroundColor: `${theme.background}F2` }]}
          accessibilityRole="alert"
          accessibilityLabel="modal-derrota-solitario"
        >
          <Text style={[styles.overlayTitle, { color: theme.text }]}>Sin movimientos</Text>
          <Text style={[styles.overlayScore, { color: theme.textMuted }]}>No quedan jugadas posibles</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="jugar-de-nuevo-solitario"
            onPress={handleReplay}
            style={[styles.overlayButton, { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.overlayButtonText, { color: theme.primaryText }]}>Jugar de nuevo</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="salir-al-home-solitario"
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 52,
    gap: 8,
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
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  moves: {
    fontSize: 15,
    fontWeight: '700',
  },
  board: {
    position: 'relative',
    marginTop: 12,
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
  overlayTitle: {
    fontSize: 28,
    fontWeight: '800',
  },
  overlayScore: {
    fontSize: 18,
    fontWeight: '700',
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
