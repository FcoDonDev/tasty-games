import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { preferencesRepository } from '@/core/db/repositories/preferencesRepository';
import { GameHeader } from '@/core/ui/GameHeader';
import { PressableScale } from '@/core/ui/PressableScale';
import { beginPerfSession, endPerfSession, perfJsStall } from '@/core/perf';
import { usePerfFrameMonitor } from '@/core/perf/usePerfFrameMonitor';
import { useIsTouchDevice } from '@/core/ui/useIsTouchDevice';
import { hapticGameWin, hapticSelection } from '@/core/ui/haptics';
import { soundGameWin, soundHit, soundPickup, soundPowerUp } from '@/core/ui/sound';
import { useContainerSize } from '@/core/ui/useContainerSize';
import type { GameScreenProps } from '@/core/types';
import { ControlSettingsButton, ControlSettingsModal, type ControlMode } from './components/ControlSettings';
import { Hud } from './components/Hud';
import { EndOverlay, PauseOverlay } from './components/Overlays';
import { beginFloatingDrag, directionFromSwipe, updateFloatingDrag } from './engine/controls';
import { MAZE_COLS, MAZE_ROWS, type Direction } from './engine/maze';
import { worldSnapshot, type GameEvent } from './engine/rules';
import { useWakWakStore } from './engine/state';
import { EntitiesLayer, type EntitiesHandle } from './renderer/reanimated/EntitiesLayer';
import { MazeLayer } from './renderer/reanimated/MazeLayer';

const BOARD_BG = '#0B1220';
/** Presupuesto de frame ~16.7ms: dt > 25ms = stall del loop rAF (JS thread). */
const STALL_BUDGET_MS = 25;
const PREF_CONTROL = 'wakwak.controlMode';
const PREF_RING = 'wakwak.floatingRing';

const KEY_DIRS: Record<string, Direction> = {
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

/**
 * WakWakScreen: orquestador del motor A (ADR 0010). Posee el loop rAF que
 * alimenta `store.tick(dt)` y escribe poses en `EntitiesLayer` vía el puerto
 * de presentación; React re-renderiza solo con eventos discretos.
 *
 * Input por plataforma: PC web → teclado (flechas + WASD); táctil (nativo y
 * web con puntero coarse) → modo configurable persistido: "gestos" (swipe en
 * toda la pantalla, una dirección por gesto) o "flotante" (pad invisible que
 * nace donde apoya el dedo, con re-centrado/histéresis y anillo opcional).
 */
export default function WakWakScreen({ onExit, onGameEnd, initialSeed }: GameScreenProps) {
  const { size, onLayout } = useContainerSize();
  const [cellSize, setCellSize] = useState(0);
  const entitiesRef = useRef<EntitiesHandle | null>(null);
  const endedRef = useRef(false);
  const onGameEndRef = useRef(onGameEnd);
  onGameEndRef.current = onGameEnd;

  const isTouch = useIsTouchDevice();
  const [controlMode, setControlMode] = useState<ControlMode>('gestos');
  const [ringEnabled, setRingEnabled] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const paused = useWakWakStore((s) => s.paused);
  const status = useWakWakStore((s) => s.game.status);
  const batteries = useWakWakStore((s) => s.game.batteries);
  const supers = useWakWakStore((s) => s.game.supers);
  const bonusActive = useWakWakStore((s) => s.game.bonus !== null);
  const score = useWakWakStore((s) => s.game.score);

  // Métricas: FPS UI thread (no-op con gate off) + sesión de resumen
  usePerfFrameMonitor('wakwak');
  useEffect(() => {
    beginPerfSession('wakwak');
    return () => endPerfSession('wakwak');
  }, []);

  // --- partida: reset al montar y al reintentar (conserva seed E2E)
  useEffect(() => {
    endedRef.current = false;
    useWakWakStore.getState().reset(initialSeed);
  }, [initialSeed]);

  // --- preferencias de control (solo relevantes en dispositivos táctiles)
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

  const changeControlMode = useCallback((mode: ControlMode) => {
    setControlMode(mode);
    void preferencesRepository.set(PREF_CONTROL, mode);
  }, []);

  const changeRing = useCallback((ring: boolean) => {
    setRingEnabled(ring);
    void preferencesRepository.set(PREF_RING, ring ? '1' : '0');
  }, []);

  // --- eventos discretos → sonido/haptics/récord
  const handleEvents = useCallback((events: GameEvent[]) => {
    for (const event of events) {
      if (event === 'battery') soundPickup();
      else if (event === 'super') soundPowerUp();
      else if (event === 'droneEaten' || event === 'caught') soundHit();
      else if (event === 'won' || event === 'lost') {
        if (event === 'won') {
          soundGameWin();
          hapticGameWin();
        } else {
          soundHit();
        }
        if (!endedRef.current) {
          endedRef.current = true;
          const game = useWakWakStore.getState().game;
          onGameEndRef.current({
            gameId: 'wakwak',
            won: game.status === 'won',
            score: game.score,
            durationMs: game.elapsedMs,
            finishedAt: new Date().toISOString(),
          });
        }
      }
    }
  }, []);

  // --- loop del juego (adaptador A): rAF + tick + present
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const rawDt = now - last;
      const dt = Math.min(100, rawDt);
      last = now;
      const store = useWakWakStore.getState();
      if (!store.paused && store.game.status === 'playing') {
        handleEvents(store.tick(dt));
      }
      entitiesRef.current?.present(worldSnapshot(useWakWakStore.getState().game));
      // Métrica de jank del loop (JS thread): dt crudo por encima del presupuesto
      if (rawDt > STALL_BUDGET_MS) perfJsStall('wakwak', rawDt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [handleEvents]);

  // --- teclado (PC web): flechas + WASD
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (event: KeyboardEvent) => {
      const dir = KEY_DIRS[event.key.toLowerCase()];
      if (!dir) return;
      event.preventDefault();
      useWakWakStore.getState().setDirection(dir);
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
    // Callbacks planos (JS thread): tocan zustand/haptics, no pueden ser
    // worklets; runOnJS(true) lo hace explícito y silencia el warning de RNGH.
    const pan = Gesture.Pan().runOnJS(true);
    if (controlMode === 'gestos') {
      // Swipe clásico: UNA dirección por gesto, emitida al cruzar el umbral
      // (no al levantar el dedo) para el pre-giro anticipado.
      let emitted = false;
      return pan
        .onBegin(() => {
          emitted = false;
        })
        .onUpdate((event) => {
          if (emitted) return;
          const dir = directionFromSwipe(event.translationX, event.translationY);
          if (!dir) return;
          emitted = true;
          hapticSelection();
          useWakWakStore.getState().setDirection(dir);
        });
    }
    // Flotante invisible: el pad nace donde apoya el dedo; cada dirección
    // re-centra el origen (histéresis) y el anillo opcional sigue el commit.
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
          hapticSelection();
          useWakWakStore.getState().setDirection(drag.dir);
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

  // --- celda derivada del tamaño real medido (ADR 0004)
  useEffect(() => {
    if (!size) return;
    const next = Math.floor(Math.min(size.width / MAZE_COLS, size.height / MAZE_ROWS));
    setCellSize((prev) => (prev === next ? prev : Math.max(0, next)));
  }, [size]);

  const restart = useCallback(() => {
    endedRef.current = false;
    useWakWakStore.getState().reset(initialSeed);
  }, [initialSeed]);

  const boardWidth = cellSize * MAZE_COLS;
  const boardHeight = cellSize * MAZE_ROWS;

  const board = (
    <View style={styles.boardArea} onLayout={onLayout}>
      {cellSize > 0 ? (
        <View
          style={[styles.board, { width: boardWidth, height: boardHeight }]}
          accessibilityLabel="tablero-wakwak"
        >
          <MazeLayer
            cellSize={cellSize}
            batteries={batteries}
            supers={supers}
            bonusActive={bonusActive}
          />
          <EntitiesLayer ref={entitiesRef} cellSize={cellSize} />
        </View>
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

  return (
    <View style={styles.screen}>
      <GameHeader
        gameId="wakwak"
        onExit={onExit}
        onRestart={restart}
        left={
          <>
            <PressableScale
              accessibilityLabel="pausa-wakwak"
              onPress={() => useWakWakStore.getState().togglePause()}
              style={styles.pauseButton}
            >
              <View>
                <View style={styles.pauseBar} />
                <View style={styles.pauseBar} />
              </View>
            </PressableScale>
            {isTouch ? (
              <ControlSettingsButton onPress={() => setSettingsOpen(true)} />
            ) : null}
          </>
        }
      />
      {panGesture ? <GestureDetector gesture={panGesture}>{area}</GestureDetector> : area}
      {isTouch ? (
        <ControlSettingsModal
          visible={settingsOpen}
          mode={controlMode}
          ring={ringEnabled}
          onChangeMode={changeControlMode}
          onChangeRing={changeRing}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {paused && status === 'playing' ? (
        <PauseOverlay onResume={() => useWakWakStore.getState().togglePause()} />
      ) : null}
      {status !== 'playing' ? (
        <EndOverlay status={status} score={score} onRestart={restart} onExit={onExit} />
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

const RING_SIZE = 72;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  area: {
    flex: 1,
    backgroundColor: BOARD_BG,
  },
  boardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  board: {
    backgroundColor: BOARD_BG,
    borderWidth: 1,
    borderColor: '#33415C',
    overflow: 'hidden',
  },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    borderColor: '#60A5FA',
    backgroundColor: '#60A5FA22',
  },
  pauseButton: {
    borderWidth: 1,
    borderColor: '#33415C',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    gap: 3,
  },
  pauseBar: {
    width: 4,
    height: 14,
    backgroundColor: '#94A3B8',
    borderRadius: 1,
  },
});
