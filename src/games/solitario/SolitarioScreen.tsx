import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { ReduceMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { GameResult, GameScreenProps } from '@/core/types';
import { gameStateRepository } from '@/core/db/repositories/gameStateRepository';
import { preferencesRepository } from '@/core/db/repositories/preferencesRepository';
import { GameHeader } from '@/core/ui/GameHeader';
import { PressableScale } from '@/core/ui/PressableScale';
import { hapticDropCommit, hapticGameWin } from '@/core/ui/haptics';
import { soundCardDrop, soundCardInvalid, soundCardMove, soundGameWin } from '@/core/ui/sound';
import { useTheme } from '@/core/ui/ThemeProvider';
import { useContainerSize } from '@/core/ui/useContainerSize';
import { useLandscapeMobile } from '@/core/ui/useLandscapeMobile';
import { overlayEnter, overlayExit } from '@/core/ui/overlayAnimation';
import type { DragCallbacks } from '@/core/ui/drag/useDraggable';
import { Pile } from './components/Pile';
import { SettingsModal } from './components/SettingsModal';
import { SUITS, SUIT_SYMBOLS, parseSeed, type Card } from './engine/deck';
import { cardPosition, computeLayout, hitTestPile } from './engine/layout';
import { parseSolitarioState, serializeSolitarioState } from './engine/persistence';
import { canDropOnFoundation, canDropOnTableau, canPickUp, scoreFor, type PileRef, type TargetRef } from './engine/rules';
import { useSolitarioStore, type DrawMode } from './engine/state';

const GAME_ID = 'solitario';
const PREF_DRAW = 'solitario.drawMode';
const PREF_UNDO = 'solitario.undo';
/** Debounce del guardado del estado en curso (agrupa ráfagas de movimientos). */
const SAVE_DEBOUNCE_MS = 300;

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
  // Tamaño real del área de tablero (onLayout): el layout llena el 100% disponible
  const { size, onLayout } = useContainerSize();
  const layout = useMemo(() => (size ? computeLayout(size.width, size.height) : null), [size]);
  // Landscape móvil: header vertical al costado izquierdo, el tablero gana alto
  const landscape = useLandscapeMobile();

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
  const restore = useSolitarioStore((s) => s.restore);
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

  // Carga de preferencias + auto-resume: si hay partida en curso guardada se
  // restaura; si no (o si llega seed de E2E) se reparte una partida nueva.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // El seed solo llega en builds E2E: exige reparto fresco determinista,
      // sin restaurar ni dejar estado previo guardado.
      const savedRaw = initialSeed ? null : await gameStateRepository.get(GAME_ID);
      const [drawRaw, undoRaw] = await Promise.all([
        preferencesRepository.get(PREF_DRAW),
        preferencesRepository.get(PREF_UNDO),
      ]);
      if (cancelled) return;
      if (initialSeed) void gameStateRepository.clear(GAME_ID);
      const loadedDraw: DrawMode = drawRaw === '3' ? 3 : 1;
      const loadedUndo = undoRaw === '1';
      setDrawPref(loadedDraw);
      setUndoPref(loadedUndo);
      const saved = savedRaw ? parseSolitarioState(savedRaw) : null;
      if (saved) {
        restore(saved);
      } else {
        reset({
          seed: parseSeed(initialSeed),
          drawMode: loadedDraw,
          undoEnabled: loadedUndo,
        });
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [reset, restore, initialSeed]);

  // Persistencia del estado en curso: cada commit del store agenda un guardado
  // debounceado. Se omite el estado virgen (sin empezar) y los terminales
  // (ganada/trabada): esos se descartan, no se restauran.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useSolitarioStore.subscribe((state) => {
      if (state.startedAt === null || state.finishedAt !== null || state.stuck) return;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void gameStateRepository.set(GAME_ID, serializeSolitarioState(state));
      }, SAVE_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (timer !== null) clearTimeout(timer);
    };
  }, []);

  // Victoria: reporte único vía el contrato
  useEffect(() => {
    if (finishedAt === null || startedAt === null || hasReportedRef.current) return;
    hasReportedRef.current = true;
    // Partida ganada: no hay estado en curso que restaurar
    void gameStateRepository.clear(GAME_ID);
    const durationMs = Math.max(0, finishedAt - startedAt);
    const result: GameResult = {
      gameId: 'solitario',
      won: true,
      score: scoreFor(moves, durationMs, undos),
      durationMs,
      finishedAt: new Date(finishedAt).toISOString(),
    };
    void onGameEnd(result);
    hapticGameWin();
    soundGameWin();
    setShowWin(true);
  }, [finishedAt, startedAt, moves, undos, onGameEnd]);

  // Sin movimientos: modal de derrota (sin récord, S5). Partida descartada.
  useEffect(() => {
    if (stuck && finishedAt === null) {
      void gameStateRepository.clear(GAME_ID);
      setShowLose(true);
    }
  }, [stuck, finishedAt]);

  const finishDrag = useCallback(() => {
    setDragKey(null);
    setValidTargets(new Set());
  }, []);

  /** Doble tap / clic derecho: auto-envío de una carta suelta a su foundation. */
  const handleAutoMove = useCallback((id: string) => {
    const state = useSolitarioStore.getState();
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.debug('[solitario:auto-move] tap id=', id, 'dragRef=', dragRef.current, 'finished=', state.finishedAt !== null, 'stuck=', state.stuck);
    }
    // Ignora taps mientras hay un arrastre activo: el clic derecho durante un
    // drag caería sobre la carta que sigue al cursor y la movería a mitad del gesto.
    if (dragRef.current !== null) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.debug('[solitario:auto-move] ignorado: drag en curso');
      }
      return;
    }
    if (state.finishedAt !== null || state.stuck) return;
    const ref = findRefByCardId(state.tableau, state.waste, state.foundations, id);
    if (!ref) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.debug('[solitario:auto-move] sin ref para', id);
      }
      return;
    }
    const moving = canPickUp(state, ref);
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.debug('[solitario:auto-move] ref=', ref, 'moving=', moving?.length ?? null);
    }
    if (state.autoMoveToFoundation(ref)) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.debug('[solitario:auto-move] COMMIT', id);
      }
      soundCardDrop();
      hapticDropCommit();
    } else {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.debug('[solitario:auto-move] rechazado por el motor');
      }
    }
  }, []);

  const handleDragStart = useCallback((id: string) => {
    const state = useSolitarioStore.getState();
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.debug('[solitario:drag] start id=', id);
    }
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
    (
      id: string,
      translationX: number,
      translationY: number,
      velocityX: number,
      velocityY: number,
    ) => {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.debug('[solitario:drag] end id=', id, 'dx=', translationX.toFixed(1), 'dy=', translationY.toFixed(1));
      }
      const ref = dragRef.current;
      dragRef.current = null;
      setValidTargets(new Set());
      if (!ref || layout === null) {
        setDragKey(null);
        tx.set(0);
        ty.set(0);
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

      // Spring con handoff de velocidad del gesto (settle y snap-back)
      const springConfig = (velocity: number) => ({
        duration: 400,
        dampingRatio: 0.8,
        velocity,
        reduceMotion: ReduceMotion.System,
      });
      const spring = (axis: 'x' | 'y') =>
        withSpring(0, springConfig(axis === 'x' ? velocityX : velocityY));

      if (moved && target) {
        // Haptic + sonido en el frame causal del commit, junto al settle visual
        hapticDropCommit();
        soundCardDrop();
        // Settle: la carta queda donde el dedo la soltó y glisa a su asiento final
        const destCards =
          target.kind === 'foundation' ? state.foundations[target.index] : state.tableau[target.index];
        const finalRef: PileRef =
          target.kind === 'foundation'
            ? { kind: 'foundation', index: target.index }
            : { kind: 'tableau', index: target.index, cardIndex: 0 };
        const final = cardPosition(layout, finalRef, destCards, destCards.length);
        tx.set(origin.x + translationX - final.x);
        ty.set(origin.y + translationY - final.y);
        tx.set(spring('x'));
        ty.set(withSpring(0, springConfig(velocityY), () => scheduleOnRN(finishDrag)));
      } else {
        // Snap-back con spring; dragKey se mantiene hasta terminar el gesto de retorno
        soundCardInvalid();
        tx.set(spring('x'));
        ty.set(withSpring(0, springConfig(velocityY), () => scheduleOnRN(finishDrag)));
      }
    },
    [layout, tx, ty, finishDrag],
  );

  const dragCallbacks = useMemo<DragCallbacks>(
    () => ({
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd,
      onDragCancel: finishDrag,
      onDoubleTap: handleAutoMove,
    }),
    [handleDragStart, handleDragEnd, finishDrag, handleAutoMove],
  );

  const handleDrawStock = useCallback(() => {
    drawStock();
    soundCardMove();
  }, [drawStock]);

  const currentSettings = useMemo(
    () => ({ drawMode: drawPref, undoEnabled: undoPref }),
    [drawPref, undoPref],
  );

  const handleReplay = useCallback(() => {
    hasReportedRef.current = false;
    setShowWin(false);
    setShowLose(false);
    void gameStateRepository.clear(GAME_ID);
    reset(currentSettings);
  }, [reset, currentSettings]);

  const handleRestart = useCallback(() => {
    hasReportedRef.current = false;
    setShowWin(false);
    setShowLose(false);
    void gameStateRepository.clear(GAME_ID);
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

  // El tablero parte desde arriba (como el clásico): todo el espacio sobrante
  // queda debajo para que las columnas crezcan, y una columna que crece no
  // desplaza al resto (antes el recentrado vertical las movía a todas).
  const boardTop = 8;

  if (!ready) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        landscape && styles.containerLandscape,
        { backgroundColor: theme.background },
      ]}
    >
      <GameHeader
        gameId="solitario"
        onExit={onExit}
        onRestart={handleRestart}
        variant={landscape ? 'vertical' : 'horizontal'}
        center={
          <Text style={[styles.moves, { color: theme.text, fontVariant: ['tabular-nums'] }]}>
            Movimientos: {moves}
          </Text>
        }
        left={
          <>
            {undoEnabled && historyDepth > 0 && finishedAt === null ? (
              <PressableScale
                accessibilityLabel="solitario-undo"
                onPress={() => useSolitarioStore.getState().undo()}
                style={[styles.headerButton, { borderColor: theme.surfaceBorder, borderCurve: 'continuous' }]}
              >
                <Text style={[styles.headerButtonText, { color: theme.textMuted }]}>↩</Text>
              </PressableScale>
            ) : null}
            <PressableScale
              accessibilityLabel="solitario-abrir-ajustes"
              onPress={() => setShowSettings(true)}
              style={[styles.headerButton, { borderColor: theme.surfaceBorder, borderCurve: 'continuous' }]}
            >
              <Text style={[styles.headerButtonText, { color: theme.textMuted }]}>⚙</Text>
            </PressableScale>
          </>
        }
      />

      <View style={styles.board} onLayout={onLayout}>
        {layout !== null ? (
          <View
            style={[styles.boardInner, { top: boardTop }]}
            accessibilityLabel="solitario-tablero"
          >
            <Pile
              layout={layout}
              rect={layout.stock}
              kind="stock"
              cards={stock}
              dragKey={dragKey}
              tx={tx}
              ty={ty}
              callbacks={dragCallbacks}
              onPressStock={handleDrawStock}
            />
            <Pile
              layout={layout}
              rect={layout.waste}
              kind="waste"
              cards={waste}
              dragKey={dragKey}
              tx={tx}
              ty={ty}
              callbacks={dragCallbacks}
              onAutoMove={handleAutoMove}
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
                callbacks={dragCallbacks}
                onAutoMove={handleAutoMove}
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
                callbacks={dragCallbacks}
                onAutoMove={handleAutoMove}
              />
            ))}
          </View>
        ) : null}
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
        <Animated.View
          entering={overlayEnter()}
          exiting={overlayExit()}
          style={[styles.overlay, { backgroundColor: `${theme.background}F2` }]}
          accessibilityRole="alert"
          accessibilityLabel="modal-victoria-solitario"
        >
          <Text style={[styles.overlayTitle, { color: theme.text }]}>¡Ganaste! 🎉</Text>
          <Text style={[styles.overlayScore, { color: theme.primary }]}>
            {scoreFor(moves, (finishedAt ?? 0) - (startedAt ?? 0), undos)} pts · {moves} movimientos
            {undos > 0 ? ` · ${undos} undos` : ''}
          </Text>
          <PressableScale
            accessibilityLabel="jugar-de-nuevo-solitario"
            onPress={handleReplay}
            style={[styles.overlayButton, { backgroundColor: theme.primary, borderCurve: 'continuous' }]}
          >
            <Text style={[styles.overlayButtonText, { color: theme.primaryText }]}>Jugar de nuevo</Text>
          </PressableScale>
          <PressableScale
            accessibilityLabel="salir-al-home-solitario"
            onPress={onExit}
            style={[styles.headerButton, { borderColor: theme.surfaceBorder, marginTop: 8, borderCurve: 'continuous' }]}
          >
            <Text style={[styles.headerButtonText, { color: theme.textMuted }]}>Salir</Text>
          </PressableScale>
        </Animated.View>
      ) : null}

      {showLose && !showWin ? (
        <Animated.View
          entering={overlayEnter()}
          exiting={overlayExit()}
          style={[styles.overlay, { backgroundColor: `${theme.background}F2` }]}
          accessibilityRole="alert"
          accessibilityLabel="modal-derrota-solitario"
        >
          <Text style={[styles.overlayTitle, { color: theme.text }]}>Sin movimientos</Text>
          <Text style={[styles.overlayScore, { color: theme.textMuted }]}>No quedan jugadas posibles</Text>
          <PressableScale
            accessibilityLabel="jugar-de-nuevo-solitario"
            onPress={handleReplay}
            style={[styles.overlayButton, { backgroundColor: theme.primary, borderCurve: 'continuous' }]}
          >
            <Text style={[styles.overlayButtonText, { color: theme.primaryText }]}>Jugar de nuevo</Text>
          </PressableScale>
          <PressableScale
            accessibilityLabel="salir-al-home-solitario"
            onPress={onExit}
            style={[styles.headerButton, { borderColor: theme.surfaceBorder, marginTop: 8, borderCurve: 'continuous' }]}
          >
            <Text style={[styles.headerButtonText, { color: theme.textMuted }]}>Salir</Text>
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
  containerLandscape: {
    flexDirection: 'row',
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
    flex: 1,
  },
  boardInner: {
    position: 'absolute',
    left: 0,
    right: 0,
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
