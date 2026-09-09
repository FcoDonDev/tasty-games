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
  type SharedValue,
} from 'react-native-reanimated';
import { preferencesRepository } from '@/core/db/repositories/preferencesRepository';
import { GameHeader } from '@/core/ui/GameHeader';
import { PressableScale } from '@/core/ui/PressableScale';
import { beginPerfSession, endPerfSession, perfJsStall } from '@/core/perf';
import { usePerfFrameMonitor } from '@/core/perf/usePerfFrameMonitor';
import { useIsTouchDevice } from '@/core/ui/useIsTouchDevice';
import { hapticCombo, hapticGameWin, hapticSelection } from '@/core/ui/haptics';
import { soundCombo, soundGameWin, soundHit, soundPickup, soundPowerUp } from '@/core/ui/sound';
import { useContainerSize } from '@/core/ui/useContainerSize';
import type { GameScreenProps } from '@/core/types';
import { ControlSettingsButton, ControlSettingsModal, type ControlMode } from './components/ControlSettings';
import { BoardBanner } from './components/BoardBanner';
import { Hud } from './components/Hud';
import { LevelInterstitial } from './components/LevelInterstitial';
import { LevelPicker } from './components/LevelPicker';
import { EndOverlay, PauseOverlay } from './components/Overlays';
import { beginFloatingDrag, directionFromSwipe, updateFloatingDrag } from './engine/controls';
import { SLOWMO_RAMP_MS, hitStopMs, slowMoScale, threatsOf } from './engine/feel';
import { MAX_LEVEL } from './engine/levels';
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
const PREF_MAX_LEVEL = 'wakwak.maxLevel';
/** Duración del interstitial entre niveles (D8). */
const INTERSTITIAL_MS = 1500;

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

interface ScorePopup {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
}

/**
 * WakWakScreen: orquestador del motor A (ADR 0010). Posee el loop rAF que
 * alimenta `store.tick(dt)` y escribe poses en `EntitiesLayer` vía el puerto
 * de presentación; React re-renderiza solo con eventos discretos.
 *
 * Game feel (PLAN-WAK-WAK-V2): hit-stop paramétrico al comer drone (D4, única
 * instancia, pausa el dt — visual-only), slow-mo near-death con rampa (D5) y
 * popups de score por evento (D7). Run continua de niveles: ganar un nivel
 * muestra el interstitial y avanza solo (D8); la run termina en derrota o al
 * ganar el nivel 8 (D1).
 */
export default function WakWakScreen({ onExit, onGameEnd, initialSeed }: GameScreenProps) {
  const { size, onLayout } = useContainerSize();
  const [cellSize, setCellSize] = useState(0);
  const entitiesRef = useRef<EntitiesHandle | null>(null);
  const endedRef = useRef(false);
  const onGameEndRef = useRef(onGameEnd);
  onGameEndRef.current = onGameEnd;
  const reduced = useReducedMotion();

  const isTouch = useIsTouchDevice();
  const [controlMode, setControlMode] = useState<ControlMode>('gestos');
  const [ringEnabled, setRingEnabled] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [maxLevel, setMaxLevel] = useState(1);
  const maxLevelRef = useRef(1);
  const [interstitial, setInterstitial] = useState<number | null>(null);
  const [endShown, setEndShown] = useState(false);
  const [popups, setPopups] = useState<ScorePopup[]>([]);
  const cellSizeRef = useRef(0);
  const popupIdRef = useRef(0);
  const hitStopUntilRef = useRef(0);
  const slowScaleRef = useRef(1);
  const nextLevelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const paused = useWakWakStore((s) => s.paused);
  const status = useWakWakStore((s) => s.game.status);
  const runLevel = useWakWakStore((s) => s.runLevel);
  const batteries = useWakWakStore((s) => s.game.batteries);
  const supers = useWakWakStore((s) => s.game.supers);
  const bonusActive = useWakWakStore((s) => s.game.bonus !== null);
  const score = useWakWakStore((s) => s.game.score);
  const bestChain = useWakWakStore((s) => s.game.bestChain);

  // Métricas: FPS UI thread (no-op con gate off) + sesión de resumen
  usePerfFrameMonitor('wakwak');
  useEffect(() => {
    beginPerfSession('wakwak');
    return () => endPerfSession('wakwak');
  }, []);

  // --- partida: reset al montar y al reintentar (conserva seed E2E)
  useEffect(() => {
    endedRef.current = false;
    setEndShown(false);
    setInterstitial(null);
    useWakWakStore.getState().reset(initialSeed);
  }, [initialSeed]);

  // --- limpieza de timers al desmontar
  useEffect(
    () => () => {
      if (nextLevelTimerRef.current) clearTimeout(nextLevelTimerRef.current);
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
    },
    [],
  );

  // --- nivel máximo desbloqueado (persistido; D1)
  useEffect(() => {
    let cancelled = false;
    void preferencesRepository.get(PREF_MAX_LEVEL).then((raw) => {
      if (cancelled || !raw) return;
      const value = Number(raw);
      if (Number.isFinite(value) && value >= 1) {
        maxLevelRef.current = Math.min(MAX_LEVEL, Math.floor(value));
        setMaxLevel(maxLevelRef.current);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    cellSizeRef.current = cellSize;
  }, [cellSize]);

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

  // --- popup de score (D7): spawn discreto por evento, en la celda del robot
  const spawnPopup = useCallback((text: string, color: string) => {
    const cell = cellSizeRef.current;
    if (cell <= 0) return;
    const game = useWakWakStore.getState().game;
    const col = game.robot.cell % MAZE_COLS;
    const row = Math.floor(game.robot.cell / MAZE_COLS);
    const id = ++popupIdRef.current;
    setPopups((prev) => [
      ...prev.slice(-5),
      { id, x: (col + 0.5) * cell, y: row * cell, text, color },
    ]);
    setTimeout(() => setPopups((prev) => prev.filter((p) => p.id !== id)), 800);
  }, []);

  // --- fin de run: récord (solo aquí escribe onGameEnd) + overlay diferido
  const endRun = useCallback((won: boolean) => {
    if (!endedRef.current) {
      endedRef.current = true;
      const game = useWakWakStore.getState().game;
      onGameEndRef.current({
        gameId: 'wakwak',
        won,
        score: game.score,
        durationMs: game.elapsedMs,
        finishedAt: new Date().toISOString(),
      });
    }
    // secuencia antes del overlay: victoria ~1s, derrota ~0.8s (D6)
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    endTimerRef.current = setTimeout(() => setEndShown(true), won ? 1000 : 800);
  }, []);

  // --- interstitial de nivel (D8): congela el juego (status won) y avanza solo
  const scheduleNextLevel = useCallback((nextLevel: number) => {
    setInterstitial(nextLevel);
    if (nextLevelTimerRef.current) clearTimeout(nextLevelTimerRef.current);
    nextLevelTimerRef.current = setTimeout(() => {
      setInterstitial(null);
      useWakWakStore.getState().advanceLevel();
      // desbloqueo persistido del nuevo nivel
      if (nextLevel > maxLevelRef.current) {
        maxLevelRef.current = nextLevel;
        setMaxLevel(nextLevel);
        void preferencesRepository.set(PREF_MAX_LEVEL, String(nextLevel));
      }
    }, INTERSTITIAL_MS);
  }, []);

  // --- eventos discretos → sonido/haptics/animaciones/récord
  const handleEvents = useCallback(
    (events: GameEvent[]) => {
      for (const event of events) {
        switch (event.type) {
          case 'battery':
            soundPickup();
            break;
          case 'super':
            soundPowerUp();
            spawnPopup('+50', '#FDE047');
            break;
          case 'droneEaten': {
            if (event.chain >= 2) {
              soundCombo(event.chain); // pitch sube con la cadena
              hapticCombo(); // mismo instante que el hit-stop (D4)
            } else {
              soundHit();
            }
            entitiesRef.current?.onEvent({ kind: 'droneEaten', id: event.id });
            spawnPopup(`${event.points}`, '#FDE047');
            // hit-stop paramétrico, única instancia (D4): si llega otro, reinicia
            const now = performance.now();
            hitStopUntilRef.current =
              Math.max(now, hitStopUntilRef.current) + hitStopMs(event.chain);
            break;
          }
          case 'caught':
            soundHit();
            entitiesRef.current?.onEvent({ kind: 'robotCaught' });
            break;
          case 'bonusTaken':
            spawnPopup('+100', '#4ADE80');
            break;
          case 'bonusSpawn':
          case 'bonusExpired':
            break;
          case 'won': {
            entitiesRef.current?.onEvent({ kind: 'levelWin' });
            const game = useWakWakStore.getState().game;
            if (game.level >= MAX_LEVEL) {
              soundGameWin();
              hapticGameWin();
              endRun(true);
            } else {
              scheduleNextLevel(game.level + 1);
            }
            break;
          }
          case 'lost':
            soundHit();
            entitiesRef.current?.onEvent({ kind: 'runLost' });
            endRun(false);
            break;
        }
      }
    },
    [endRun, scheduleNextLevel, spawnPopup],
  );

  // --- loop del juego (adaptador A): rAF + tick + present + feel (D4/D5)
  /** Fracción restante del power (0..1) para la barra del BoardBanner:
   * escrita por frame desde el loop, sin setState (PLAN-WAK-POLISH F1). */
  const powerFractionSV = useSharedValue(0);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const rawDt = now - last;
      const dt = Math.min(100, rawDt);
      last = now;
      const store = useWakWakStore.getState();
      if (!store.paused && store.game.status === 'playing') {
        // hit-stop activo: el engine no avanza (pausa visual-only, D4)
        if (hitStopUntilRef.current - now <= 0) {
          // slow-mo near-death (D5): factor objetivo con rampa temporal
          const game = store.game;
          const target = slowMoScale(threatsOf(game), game.powerUntil !== null);
          const k = Math.min(1, rawDt / SLOWMO_RAMP_MS);
          slowScaleRef.current += (target - slowScaleRef.current) * k;
          handleEvents(store.tick(dt * slowScaleRef.current));
        }
      }
      const snapshot = worldSnapshot(useWakWakStore.getState().game);
      entitiesRef.current?.present(snapshot);
      powerFractionSV.value = snapshot.powerFraction;
      // Métrica de jank del loop (JS thread): dt crudo por encima del presupuesto
      if (rawDt > STALL_BUDGET_MS) perfJsStall('wakwak', rawDt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [handleEvents, powerFractionSV]);

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

  const startLevel = useCallback((level: number) => {
    endedRef.current = false;
    setEndShown(false);
    setInterstitial(null);
    setPickerOpen(false);
    useWakWakStore.getState().startRun(level);
  }, []);

  const restart = useCallback(() => {
    endedRef.current = false;
    setEndShown(false);
    setInterstitial(null);
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
          <BoardBanner powerFraction={powerFractionSV} />
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

  const endVisible = endShown && status !== 'playing';
  const finalWin = status === 'won';

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
            <PressableScale
              accessibilityLabel="niveles-wakwak"
              onPress={() => setPickerOpen(true)}
              style={styles.levelButton}
            >
              <Text style={styles.levelButtonText}>NVL {runLevel}</Text>
            </PressableScale>
            {isTouch ? (
              <ControlSettingsButton onPress={() => setSettingsOpen(true)} />
            ) : null}
          </>
        }
      />
      {panGesture ? <GestureDetector gesture={panGesture}>{area}</GestureDetector> : area}
      {interstitial !== null ? <LevelInterstitial level={interstitial} /> : null}
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
      {pickerOpen ? (
        <View style={styles.pickerOverlay} accessibilityLabel="modal-niveles-wakwak">
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Nivel de inicio</Text>
            <LevelPicker
              maxUnlocked={maxLevel}
              current={runLevel}
              onPick={startLevel}
            />
            <PressableScale
              accessibilityLabel="cerrar-niveles-wakwak"
              onPress={() => setPickerOpen(false)}
              style={styles.pickerClose}
            >
              <Text style={styles.pickerCloseText}>Cerrar</Text>
            </PressableScale>
          </View>
        </View>
      ) : null}
      {paused && status === 'playing' ? (
        <PauseOverlay onResume={() => useWakWakStore.getState().togglePause()} />
      ) : null}
      {endVisible ? (
        <EndOverlay
          status={status}
          score={score}
          stats={{ level: finalWin ? MAX_LEVEL : runLevel, bestChain }}
          onRestart={restart}
          onExit={onExit}
          picker={
            maxLevel > 1 ? (
              <View style={styles.pickerInOverlay}>
                <Text style={styles.pickerInOverlayLabel}>Empezar en:</Text>
                <LevelPicker maxUnlocked={maxLevel} current={1} onPick={startLevel} />
              </View>
            ) : null
          }
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
  popup: {
    position: 'absolute',
    zIndex: 10,
  },
  popupText: {
    fontSize: 13,
    fontWeight: '900',
    textShadowColor: '#0B1220',
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
  levelButton: {
    borderWidth: 1,
    borderColor: '#33415C',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  levelButtonText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 60,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0B1220E6',
  },
  pickerCard: {
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#141D33',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#33415C',
    padding: 24,
    width: '100%',
    maxWidth: 320,
  },
  pickerTitle: {
    color: '#E2E8F0',
    fontSize: 18,
    fontWeight: '800',
  },
  pickerClose: {
    borderColor: '#33415C',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginTop: 4,
  },
  pickerCloseText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  pickerInOverlay: {
    width: '100%',
    gap: 6,
  },
  pickerInOverlayLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
});
