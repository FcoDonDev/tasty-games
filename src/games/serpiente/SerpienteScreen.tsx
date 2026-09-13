import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { preferencesRepository } from '@/core/db/repositories/preferencesRepository';
import { GameHeader } from '@/core/ui/GameHeader';
import { PressableScale } from '@/core/ui/PressableScale';
import { beginPerfSession, endPerfSession, isPerfEnabled, perfCount, perfJsStall, perfSample } from '@/core/perf';
import { PerfProfiler } from '@/core/perf/PerfProfiler';
import { usePerfFrameMonitor } from '@/core/perf/usePerfFrameMonitor';
import { useIsTouchDevice } from '@/core/ui/useIsTouchDevice';
import { useContainerSize } from '@/core/ui/useContainerSize';
import type { GameScreenProps } from '@/core/types';
import { Board } from './components/Board';
import { Hud } from './components/Hud';
import { EndOverlay, PauseOverlay } from './components/Overlays';
import { SettingsButton, SettingsModal, type ControlMode } from './components/SettingsSheet';
import {
  beginFloatingDrag,
  keyToDirection,
  swipeToDirection,
  updateFloatingDrag,
} from './engine/controls';
import { GRID_COLS, GRID_ROWS, colOf, rowOf, type Direction } from './engine/grid';
import type { SerpienteEvent } from './engine/rules';
import { drainTickStats, setTickStatsEnabled, useSerpienteStore } from './engine/state';

const PREF_WRAP = 'serpiente.wrap';
const PREF_CONTROL = 'serpiente.controlMode';
const PREF_RING = 'serpiente.floatingRing';
/** Presupuesto de frame ~16.7ms: dt > 25ms = stall del loop rAF (JS thread). */
const STALL_BUDGET_MS = 25;
/** Hit-stop al comer el especial (D4/D17): 70 ms, visual-only. */
const SPECIAL_HIT_STOP_MS = 70;
/** Muerte (§4/C): freeze 400 ms + shake + flash causa + overlay diferido. */
const DEATH_FREEZE_MS = 400;
const DEATH_SHAKE_MS = 50;
const END_DELAY_WON_MS = 600;
const END_DELAY_LOST_MS = 750;
const RING_SIZE = 72;

interface ScorePopup {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
}

/**
 * SerpienteScreen (T3): loop rAF → `store.tick(dt)` + renderer V2 Escamas.
 * Eventos discretos → popups (`score-float` estático + animación de entrada),
 * hit-stop del especial, freeze+shake+flash de muerte y overlays. Sonido,
 * haptics y `onGameEnd`/récord van en T4 (ver TODO).
 */
export default function SerpienteScreen({ onExit, onGameEnd, initialSeed }: GameScreenProps) {
  const { size, onLayout } = useContainerSize();
  const [cellSize, setCellSize] = useState(0);
  // TODO(T4): llamar onGameEndRef al cerrar (won/lost) para el récord.
  const onGameEndRef = useRef(onGameEnd);
  onGameEndRef.current = onGameEnd;
  const endedRef = useRef(false);
  const reduced = useReducedMotion();

  const isTouch = useIsTouchDevice();
  const [controlMode, setControlMode] = useState<ControlMode>('gestos');
  const [ringEnabled, setRingEnabled] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [popups, setPopups] = useState<ScorePopup[]>([]);
  const [endShown, setEndShown] = useState(false);
  const [deathCell, setDeathCell] = useState<number | null>(null);
  const cellSizeRef = useRef(0);
  const popupIdRef = useRef(0);
  const hitStopUntilRef = useRef(0);
  const deathUntilRef = useRef(0);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deathTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const paused = useSerpienteStore((s) => s.paused);
  const status = useSerpienteStore((s) => s.game.status);
  const score = useSerpienteStore((s) => s.game.score);
  const eaten = useSerpienteStore((s) => s.game.eaten);
  const elapsedMs = useSerpienteStore((s) => s.game.elapsedMs);

  // Shake de muerte en UI-thread (reduced motion: sin shake).
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));

  // Métricas: FPS UI thread (no-op con gate off) + sesión de resumen.
  usePerfFrameMonitor('serpiente');
  useEffect(() => {
    setTickStatsEnabled(isPerfEnabled());
    beginPerfSession('serpiente');
    return () => {
      const stats = drainTickStats();
      for (const ms of stats.advanceSamples) perfSample('serpiente', 'loop.advance', ms);
      if (stats.tickCalls > 0) {
        perfCount('serpiente', 'loop.tick.calls', stats.tickCalls);
        perfCount('serpiente', 'loop.tick.published', stats.tickPublished);
      }
      endPerfSession('serpiente');
      setTickStatsEnabled(false);
    };
  }, []);

  const restart = useCallback(() => {
    endedRef.current = false;
    setEndShown(false);
    setPopups([]);
    setDeathCell(null);
    hitStopUntilRef.current = 0;
    deathUntilRef.current = 0;
    shakeX.value = 0;
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    if (deathTimerRef.current) clearTimeout(deathTimerRef.current);
    useSerpienteStore.getState().reset(initialSeed);
  }, [initialSeed, shakeX]);

  // --- partida: reset al montar y al reintentar (conserva seed E2E)
  useEffect(() => {
    restart();
  }, [restart]);

  // --- limpieza de timers al desmontar
  useEffect(
    () => () => {
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
      if (deathTimerRef.current) clearTimeout(deathTimerRef.current);
    },
    [],
  );

  // --- setting wrap (D1, siempre visible) + preferencias táctiles
  useEffect(() => {
    let cancelled = false;
    void preferencesRepository.get(PREF_WRAP).then((raw) => {
      if (cancelled) return;
      useSerpienteStore.getState().setWrap(raw !== '0');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isTouch) return;
    let cancelled = false;
    void (async () => {
      const [modeRaw, ringRaw] = await Promise.all([
        preferencesRepository.get(PREF_CONTROL),
        preferencesRepository.get(PREF_RING),
      ]);
      if (cancelled) return;
      if (modeRaw === 'flotante') setControlMode('flotante');
      setRingEnabled(ringRaw === '1');
    })();
    return () => {
      cancelled = true;
    };
  }, [isTouch]);

  const changeWrap = useCallback((wrap: boolean) => {
    useSerpienteStore.getState().setWrap(wrap);
    void preferencesRepository.set(PREF_WRAP, wrap ? '1' : '0');
  }, []);

  const changeControlMode = useCallback((mode: ControlMode) => {
    setControlMode(mode);
    void preferencesRepository.set(PREF_CONTROL, mode);
  }, []);

  const changeRing = useCallback((ring: boolean) => {
    setRingEnabled(ring);
    void preferencesRepository.set(PREF_RING, ring ? '1' : '0');
  }, []);

  // --- popup de score (D17 `score-float`): spawn discreto por evento, cap 5
  const spawnPopup = useCallback((text: string, color: string) => {
    const cell = cellSizeRef.current;
    if (cell <= 0) return;
    const game = useSerpienteStore.getState().game;
    const head = game.snake[0];
    const id = ++popupIdRef.current;
    setPopups((prev) => [
      ...prev.slice(-4),
      {
        id,
        x: (colOf(head) + 0.5) * cell,
        y: rowOf(head) * cell,
        text,
        color,
      },
    ]);
    setTimeout(() => setPopups((prev) => prev.filter((p) => p.id !== id)), 800);
  }, []);

  // --- fin de partida: overlay diferido (el récord se escribe en T4)
  const scheduleEnd = useCallback((delayMs: number) => {
    endedRef.current = true;
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    endTimerRef.current = setTimeout(() => setEndShown(true), delayMs);
  }, []);

  // --- eventos discretos → popups / hit-stop / muerte (sonido+haptics: T4)
  const handleEvents = useCallback(
    (events: SerpienteEvent[]) => {
      for (const event of events) {
        switch (event) {
          case 'eat':
            spawnPopup('+10', '#FBBF24');
            break;
          case 'special':
            spawnPopup('+50', '#C4B5FD');
            hitStopUntilRef.current = Math.max(performance.now(), hitStopUntilRef.current) + SPECIAL_HIT_STOP_MS;
            break;
          case 'die': {
            // Flash en la celda causa (D16): la cabeza al morir.
            const game = useSerpienteStore.getState().game;
            setDeathCell(game.snake[0] ?? null);
            deathUntilRef.current = performance.now() + DEATH_FREEZE_MS;
            if (!reduced) {
              shakeX.value = withSequence(
                withTiming(7, { duration: DEATH_SHAKE_MS }),
                withTiming(-6, { duration: DEATH_SHAKE_MS }),
                withTiming(4, { duration: DEATH_SHAKE_MS }),
                withTiming(-3, { duration: DEATH_SHAKE_MS }),
                withTiming(0, { duration: DEATH_SHAKE_MS + 10 }),
              );
            }
            if (deathTimerRef.current) clearTimeout(deathTimerRef.current);
            deathTimerRef.current = setTimeout(() => setDeathCell(null), DEATH_FREEZE_MS + 50);
            scheduleEnd(END_DELAY_LOST_MS);
            break;
          }
          case 'win':
            scheduleEnd(END_DELAY_WON_MS);
            break;
        }
      }
    },
    [spawnPopup, scheduleEnd, reduced, shakeX],
  );

  // --- loop del juego (D8/D10): rAF + tick; React re-renderiza por tick
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const rawDt = now - last;
      const dt = Math.min(100, rawDt);
      last = now;
      const store = useSerpienteStore.getState();
      const perfOn = isPerfEnabled();
      const frozen = now < deathUntilRef.current;
      if (!store.paused && store.game.status === 'playing') {
        // Hit-stop del especial: el engine no avanza (pausa visual-only).
        if (!frozen && hitStopUntilRef.current - now <= 0) {
          let t0 = 0;
          if (perfOn) t0 = performance.now();
          const tickEvents = store.tick(dt);
          if (perfOn) perfSample('serpiente', 'loop.tick', performance.now() - t0);
          handleEvents(tickEvents);
        }
      }
      if (rawDt > STALL_BUDGET_MS) perfJsStall('serpiente', rawDt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [handleEvents]);

  // --- teclado (PC web): flechas + WASD
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (event: KeyboardEvent) => {
      const dir = keyToDirection(event.key);
      if (!dir) return;
      event.preventDefault();
      useSerpienteStore.getState().setDirection(dir);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // --- gesto táctil full-screen según el modo (solo dispositivos táctiles)
  const ringX = useSharedValue(0);
  const ringY = useSharedValue(0);
  const ringOpacity = useSharedValue(0);

  const panGesture = useMemo(() => {
    if (!isTouch) return null;
    // Callbacks planos (JS thread): tocan zustand; runOnJS(true) lo hace
    // explícito y silencia el warning de RNGH. Haptics en T4.
    const pan = Gesture.Pan().runOnJS(true);
    if (controlMode === 'gestos') {
      let emitted = false;
      return pan
        .onBegin(() => {
          emitted = false;
        })
        .onUpdate((event) => {
          if (emitted) return;
          const dir = swipeToDirection(event.translationX, event.translationY);
          if (!dir) return;
          emitted = true;
          useSerpienteStore.getState().setDirection(dir);
        });
    }
    let drag = beginFloatingDrag(0, 0);
    let lastDir: Direction | null = null;
    return pan
      .onBegin((event) => {
        drag = beginFloatingDrag(event.x, event.y);
        lastDir = null;
        if (ringEnabled) {
          ringX.value = event.x;
          ringY.value = event.y;
          ringOpacity.value = 1;
        }
      })
      .onUpdate((event) => {
        drag = updateFloatingDrag(drag, event.x, event.y);
        if (drag.dir !== null && drag.dir !== lastDir) {
          lastDir = drag.dir;
          useSerpienteStore.getState().setDirection(drag.dir);
          if (ringEnabled) {
            ringX.value = drag.ox;
            ringY.value = drag.oy;
          }
        }
      })
      .onFinalize(() => {
        ringOpacity.value = 0;
      });
  }, [isTouch, controlMode, ringEnabled, ringX, ringY, ringOpacity]);

  // --- celda derivada del tamaño real medido (D4)
  useEffect(() => {
    if (!size) return;
    const next = Math.floor(Math.min(size.width / GRID_COLS, size.height / GRID_ROWS));
    setCellSize((prev) => (prev === next ? prev : Math.max(0, next)));
  }, [size]);

  useEffect(() => {
    cellSizeRef.current = cellSize;
  }, [cellSize]);

  const board = (
    <View style={styles.boardArea} onLayout={onLayout}>
      {cellSize > 0 ? (
        <Animated.View
          style={[
            styles.board,
            { width: cellSize * GRID_COLS, height: cellSize * GRID_ROWS },
            shakeStyle,
          ]}
          accessibilityLabel="tablero-serpiente"
        >
          {/* D-WW0: `render.board` (duración, solo profiling) + `renderFreq:*`
              (frecuencia, instrumentado). No-op con el gate apagado. */}
          <PerfProfiler gameId="serpiente" id="board">
            <Board cellSize={cellSize} />
          </PerfProfiler>
          {deathCell !== null ? (
            <View
              accessibilityLabel="serpiente-muerte"
              pointerEvents="none"
              style={[
                styles.deathFlash,
                {
                  left: colOf(deathCell) * cellSize + 1,
                  top: rowOf(deathCell) * cellSize + 1,
                  width: cellSize - 2,
                  height: cellSize - 2,
                  borderRadius: (cellSize - 2) / 2,
                },
              ]}
            />
          ) : null}
          {popups.map((popup) => (
            <Animated.View
              key={popup.id}
              entering={reduced ? FadeIn.duration(120) : FadeInUp.duration(160)}
              exiting={FadeOut.duration(150)}
              pointerEvents="none"
              style={[styles.popup, { left: popup.x - 28, top: popup.y - 14 }]}
            >
              <Text style={[styles.popupText, { color: popup.color }]}>{popup.text}</Text>
            </Animated.View>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );

  const area = (
    <View style={styles.area}>
      <Hud />
      {board}
      {controlMode === 'flotante' && ringEnabled && panGesture ? (
        <FloatingRing x={ringX} y={ringY} opacity={ringOpacity} />
      ) : null}
    </View>
  );

  const endVisible = endShown && status !== 'playing';

  return (
    <View style={styles.screen}>
      <GameHeader
        gameId="serpiente"
        onExit={onExit}
        onRestart={restart}
        left={
          <>
            <PressableScale
              accessibilityLabel="pausa-serpiente"
              onPress={() => useSerpienteStore.getState().togglePause()}
              style={styles.pauseButton}
            >
              <View>
                <View style={styles.pauseBar} />
                <View style={styles.pauseBar} />
              </View>
            </PressableScale>
            {isTouch ? <SettingsButton onPress={() => setSettingsOpen(true)} /> : null}
          </>
        }
      />
      {panGesture ? <GestureDetector gesture={panGesture}>{area}</GestureDetector> : area}
      {isTouch ? (
        <SettingsModal
          visible={settingsOpen}
          wrap={useSerpienteStore((s) => s.wrap)}
          mode={controlMode}
          ring={ringEnabled}
          onChangeWrap={changeWrap}
          onChangeMode={changeControlMode}
          onChangeRing={changeRing}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {paused && status === 'playing' ? (
        <PauseOverlay onResume={() => useSerpienteStore.getState().togglePause()} />
      ) : null}
      {endVisible ? (
        <EndOverlay
          status={status}
          score={score}
          eaten={eaten}
          seconds={Math.floor(elapsedMs / 1000)}
          onRestart={restart}
          onExit={onExit}
        />
      ) : null}
    </View>
  );
}

/** Anillo sutil del modo flotante (opcional): marca el origen de decisión. */
function FloatingRing({
  x,
  y,
  opacity,
}: {
  x: SharedValue<number>;
  y: SharedValue<number>;
  opacity: SharedValue<number>;
}) {
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value - RING_SIZE / 2 }, { translateY: y.value - RING_SIZE / 2 }],
    opacity: opacity.value,
  }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.ring, ringStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#07120C',
  },
  area: {
    flex: 1,
    backgroundColor: '#07120C',
  },
  boardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  board: {
    backgroundColor: '#0B1F14',
    borderWidth: 1,
    borderColor: '#14532B',
    overflow: 'hidden',
  },
  deathFlash: {
    position: 'absolute',
    backgroundColor: 'rgba(239,68,68,0.75)',
    zIndex: 5,
  },
  popup: {
    position: 'absolute',
    zIndex: 10,
  },
  popupText: {
    fontSize: 13,
    fontWeight: '900',
    textShadowColor: '#07120C',
    textShadowRadius: 4,
  },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    borderColor: '#4ADE80',
    backgroundColor: '#4ADE8022',
  },
  pauseButton: {
    borderWidth: 1,
    borderColor: '#14532B',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    gap: 3,
  },
  pauseBar: {
    width: 4,
    height: 14,
    backgroundColor: '#86EFAC',
    borderRadius: 1,
  },
});
