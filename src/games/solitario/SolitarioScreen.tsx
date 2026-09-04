import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { runOnJS, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import type { GameResult, GameScreenProps } from '@/core/types';
import { preferencesRepository } from '@/core/db/repositories/preferencesRepository';
import { GameHeader } from '@/core/ui/GameHeader';
import { ScoreBoard } from '@/core/ui/ScoreBoard';
import { useTheme } from '@/core/ui/ThemeProvider';
import { Pile } from './components/Pile';
import { SettingsModal } from './components/SettingsModal';
import { SUITS, SUIT_SYMBOLS, parseSeed, type Card } from './engine/deck';
import { cardPosition, columnExtent, computeLayout, hitTestPile } from './engine/layout';
import { canDropOnFoundation, canDropOnTableau, canPickUp, scoreFor, type PileRef, type TargetRef } from './engine/rules';
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
  /** Claves `foundation-<i>` / `tableau-<j>` con drop legal para el drag activo */
  const [validTargets, setValidTargets] = useState<Set<string>>(() => new Set());

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

  const finishDrag = useCallback(() => {
    setDragKey(null);
    setValidTargets(new Set());
  }, []);

  const handleDragStart = useCallback((id: string) => {
    const state = useSolitarioStore.getState();
    if (state.finishedAt !== null || state.stuck) return;
    const ref = findRefByCardId(state.tableau, state.waste, state.foundations, id);
    if (!ref) return;
    const moving = canPickUp(state, ref);
    if (!moving) return;
    dragRef.current = ref;
    setDragKey(id);

    // Targets con drop legal, precomputados una sola vez por drag
    const targets = new Set<string>();
    if (moving.length === 1) {
      for (let i = 0; i < state.foundations.length; i++) {
        if (canDropOnFoundation(moving[0], state.foundations[i])) targets.add(`foundation-${i}`);
      }
    }
    for (let j = 0; j < state.tableau.length; j++) {
      if (ref.kind === 'tableau' && ref.index === j) continue;
      if (canDropOnTableau(moving, state.tableau[j])) targets.add(`tableau-${j}`);
    }
    setValidTargets(targets);
  }, []);

  const handleDragEnd = useCallback(
    (id: string, translationX: number, translationY: number) => {
      const ref = dragRef.current;
      dragRef.current = null;
      setValidTargets(new Set());
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

      if (moved && target) {
        // Settle: la carta queda donde el dedo la soltó y glisa a su asiento final
        const destCards =
          target.kind === 'foundation' ? state.foundations[target.index] : state.tableau[target.index];
        const finalRef: PileRef =
          target.kind === 'foundation'
            ? { kind: 'foundation', index: target.index }
            : { kind: 'tableau', index: target.index, cardIndex: 0 };
        const final = cardPosition(layout, finalRef, destCards, destCards.length);
        tx.value = origin.x + translationX - final.x;
        ty.value = origin.y + translationY - final.y;
        tx.value = withTiming(0, { duration: 120 });
        ty.value = withTiming(0, { duration: 120 }, () => {
          runOnJS(finishDrag)();
        });
      } else {
        // Snap-back con spring; dragKey se mantiene hasta terminar el gesto de retorno
        tx.value = withSpring(0, { damping: 16, stiffness: 220 });
        ty.value = withSpring(0, { damping: 16, stiffness: 220 }, () => {
          runOnJS(finishDrag)();
        });
      }
    },
    [layout, tx, ty, finishDrag],
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

  const handleRestart = useCallback(() => {
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
      <GameHeader
        gameId="solitario"
        onExit={onExit}
        onRestart={handleRestart}
        center={<Text style={[styles.moves, { color: theme.text }]}>Movimientos: {moves}</Text>}
        left={
          <>
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
          </>
        }
      />

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
            highlighted={validTargets.has(`foundation-${i}`)}
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
            highlighted={validTargets.has(`tableau-${i}`)}
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
