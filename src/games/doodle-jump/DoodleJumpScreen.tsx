/**
 * DoodleJumpScreen (T6): loop rAF → `store.tick(dt)` (acumulador + sub-pasos
 * fijos, D9) + Renderer de shared values (D8: cero re-renders React por
 * frame). Gestos: drag continuo mueve / tap dispara (D2); teclado ←/→/Espacio
 * en web (D7). Sonido/haptics causales (D10), popups, auto-pausa, récord vía
 * `onGameEnd` (D4: endless, `won:false` siempre). Identidad visual: doodle
 * sketch con papel cuadriculado (D13).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { GameHeader } from '@/core/ui/GameHeader';
import { PressableScale } from '@/core/ui/PressableScale';
import { beginPerfSession, endPerfSession, isPerfEnabled, perfJsStall, perfSample } from '@/core/perf';
import { usePerfFrameMonitor } from '@/core/perf/usePerfFrameMonitor';
import { hapticCombo, hapticHeavy, hapticSelection } from '@/core/ui/haptics';
import {
  primeAudioPlayers,
  soundCardDrop,
  soundCardMove,
  soundExplosion,
  soundHit,
  soundPowerUp,
} from '@/core/ui/sound';
import { useContainerSize } from '@/core/ui/useContainerSize';
import type { GameScreenProps } from '@/core/types';
import { EndOverlay, PauseOverlay } from './components/Overlays';
import {
  BULLET_POOL,
  MONSTER_POOL,
  PLATFORM_POOL,
  Renderer,
  type SlotGroups,
} from './components/Renderer';
import { monsterX, platformX, type DoodleJumpEvent } from './engine/rules';
import { drainTickStats, getGame, setTickStatsEnabled, useDoodleJumpStore } from './engine/state';
import { DOODLER_H, MONSTER_H, WORLD_H, WORLD_W } from './engine/tuning';

/** Presupuesto de frame: dt > 25 ms = stall del loop rAF (JS thread). */
const STALL_BUDGET_MS = 25;
/** Coreografía del shake de muerte (serpiente D16). */
const DEATH_SHAKE_MS = 50;
/** Retardo del overlay de fin tras morir (muerte visible primero). */
const END_DELAY_LOST_MS = 700;
/** Umbral drag-vs-tap (D2): desplazamiento y duración acotados. */
const TAP_MAX_DISTANCE = 10;
const TAP_MAX_DURATION_MS = 280;
/** Grid del papel cuadriculado (D13), en unidades del mundo. */
const GRID_STEP = 24;

interface ScorePopup {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
}

export default function DoodleJumpScreen({ onExit, onGameEnd, initialSeed }: GameScreenProps) {
  const { size, onLayout } = useContainerSize();
  const scale = size ? Math.min(size.width / WORLD_W, size.height / WORLD_H) : 0;
  const scaleRef = useRef(0);
  scaleRef.current = scale;

  const onGameEndRef = useRef(onGameEnd);
  onGameEndRef.current = onGameEnd;
  const endedRef = useRef(false);
  const reduced = useReducedMotion();

  const [scene, setScene] = useState<{
    platforms: ReturnType<typeof getGame>['platforms'];
    monsters: ReturnType<typeof getGame>['monsters'];
    bullets: ReturnType<typeof getGame>['bullets'];
  }>(() => ({ platforms: [], monsters: [], bullets: [] }));
  const [popups, setPopups] = useState<ScorePopup[]>([]);
  const [endShown, setEndShown] = useState(false);
  const popupIdRef = useRef(0);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Shake de muerte en UI-thread (reduced motion: sin shake).
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));

  // Slots del renderer: pools fijos creados una sola vez.
  const slots = useMemo<SlotGroups>(
    () => ({
      platforms: Array.from({ length: PLATFORM_POOL }, () => null),
      monsters: Array.from({ length: MONSTER_POOL }, () => null),
      bullets: Array.from({ length: BULLET_POOL }, () => null),
      doodler: { current: null },
    }),
    [],
  );

  // Métricas (ADR 0011): monitor de FPS + stats de tick al desmontar.
  usePerfFrameMonitor('doodle-jump');
  useEffect(() => {
    setTickStatsEnabled(isPerfEnabled());
    beginPerfSession('doodle-jump');
    return () => {
      const stats = drainTickStats();
      for (const ms of stats.advanceSamples) perfSample('doodle-jump', 'loop.advance', ms);
      if (stats.tickCalls > 0) {
        perfSample('doodle-jump', 'loop.publishRate', stats.tickPublished / stats.tickCalls);
      }
      endPerfSession('doodle-jump');
      setTickStatsEnabled(false);
    };
  }, []);

  const restart = useCallback(() => {
    endedRef.current = false;
    setEndShown(false);
    setPopups([]);
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    useDoodleJumpStore.getState().reset(initialSeed);
  }, [initialSeed]);

  // --- partida: reset al montar y al reintentar (conserva seed E2E)
  useEffect(() => {
    restart();
  }, [restart]);

  // --- limpieza de timers al desmontar
  useEffect(
    () => () => {
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
      for (const timer of popupTimersRef.current) clearTimeout(timer);
      popupTimersRef.current = [];
    },
    [],
  );

  // --- prime de audio en idle (GOTCHAS): el primer play no paga la creación
  useEffect(() => {
    const id = setTimeout(
      () => primeAudioPlayers(['cardDrop', 'cardMove', 'powerUp', 'hit', 'explosion']),
      0,
    );
    return () => clearTimeout(id);
  }, []);

  // --- auto-pausa al ocultar la pestaña (web) o ir a background (nativo)
  useEffect(() => {
    const autoPause = (): void => {
      const store = useDoodleJumpStore.getState();
      if (!store.paused && getGame().status === 'playing') store.togglePause();
    };
    if (Platform.OS === 'web') {
      const onVisibility = (): void => {
        if (document.hidden) autoPause();
      };
      document.addEventListener('visibilitychange', onVisibility);
      return () => document.removeEventListener('visibilitychange', onVisibility);
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') autoPause();
    });
    return () => sub.remove();
  }, []);

  const spawnPopup = useCallback((text: string, color: string) => {
    const s = scaleRef.current;
    if (s <= 0) return;
    const g = getGame();
    const id = ++popupIdRef.current;
    setPopups((prev) => [
      ...prev.slice(-4),
      { id, x: g.doodler.x * s, y: (g.doodler.y - g.camY) * s, text, color },
    ]);
    const timer = setTimeout(() => {
      setPopups((prev) => prev.filter((p) => p.id !== id));
      popupTimersRef.current = popupTimersRef.current.filter((t) => t !== timer);
    }, 800);
    popupTimersRef.current.push(timer);
  }, []);

  const recordEnd = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    const g = getGame();
    onGameEndRef.current({
      gameId: 'doodle-jump',
      won: false, // endless: sin victoria (D4)
      score: g.score,
      durationMs: g.elapsedMs,
      finishedAt: new Date().toISOString(),
    });
  }, []);

  const scheduleEnd = useCallback((delayMs: number) => {
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    endTimerRef.current = setTimeout(() => setEndShown(true), delayMs);
  }, []);

  // --- eventos discretos → sonido/haptics (LO PRIMERO) + popups (D10)
  const handleEvents = useCallback(
    (events: DoodleJumpEvent[]) => {
      for (const event of events) {
        if (typeof event === 'object') {
          soundExplosion();
          hapticHeavy();
          recordEnd();
          if (!reduced) {
            shakeX.value = withSequence(
              withTiming(7, { duration: DEATH_SHAKE_MS }),
              withTiming(-6, { duration: DEATH_SHAKE_MS }),
              withTiming(4, { duration: DEATH_SHAKE_MS }),
              withTiming(0, { duration: DEATH_SHAKE_MS + 10 }),
            );
          }
          scheduleEnd(END_DELAY_LOST_MS);
          continue;
        }
        switch (event) {
          case 'bounce':
            soundCardDrop();
            break;
          case 'spring':
            soundPowerUp();
            hapticSelection();
            spawnPopup('¡Resorte!', '#42A5F5');
            break;
          case 'hat':
            soundPowerUp();
            spawnPopup('¡Propeller!', '#AB47BC');
            break;
          case 'kill':
            soundHit();
            hapticCombo();
            spawnPopup('¡Plop!', '#EC407A');
            break;
          case 'shoot':
            soundCardMove();
            break;
          case 'break':
            break; // el thud del bounce previo ya sonó
        }
      }
    },
    [recordEnd, reduced, shakeX, spawnPopup, scheduleEnd],
  );

  // --- escritura de posiciones del mundo → shared values (por frame)
  const renderFrame = useCallback(
    (s: number) => {
      const g = getGame();
      const doodlerSlot = slots.doodler.current;
      if (doodlerSlot) {
        doodlerSlot.x.set(g.doodler.x * s - (24 * s) / 2);
        doodlerSlot.y.set((g.doodler.y - g.camY) * s - (24 * s) / 2);
        doodlerSlot.flip.set(g.doodler.facing);
        doodlerSlot.opacity.set(1);
        // Copia de wrap: visible solo cerca del borde (riesgo §6).
        const mirrorX = g.doodler.x < WORLD_W / 2 ? g.doodler.x + WORLD_W : g.doodler.x - WORLD_W;
        const near = g.doodler.x < 24 || g.doodler.x > WORLD_W - 24;
        doodlerSlot.twinX.set(mirrorX * s - (24 * s) / 2);
        doodlerSlot.twinY.set((g.doodler.y - g.camY) * s - (24 * s) / 2);
        doodlerSlot.twinOpacity.set(near ? 1 : 0);
      }
      g.platforms.forEach((p, i) => {
        const slot = slots.platforms[i];
        if (!slot) return;
        slot.x.set(platformX(p) * s - (64 * s) / 2);
        slot.y.set((p.y - g.camY) * s);
        slot.opacity.set(1);
      });
      for (let i = g.platforms.length; i < PLATFORM_POOL; i++) {
        const slot = slots.platforms[i];
        if (slot) slot.opacity.set(0);
      }
      g.monsters.forEach((m, i) => {
        const slot = slots.monsters[i];
        if (!slot) return;
        slot.x.set(monsterX(m) * s - (26 * s) / 2);
        slot.y.set((m.y - g.camY) * s - (26 * s) / 2);
        slot.opacity.set(1);
      });
      for (let i = g.monsters.length; i < MONSTER_POOL; i++) {
        const slot = slots.monsters[i];
        if (slot) slot.opacity.set(0);
      }
      g.bullets.forEach((b, i) => {
        const slot = slots.bullets[i];
        if (!slot) return;
        slot.x.set(b.x * s - 3 * s);
        slot.y.set((b.y - g.camY) * s);
        slot.opacity.set(1);
      });
      for (let i = g.bullets.length; i < BULLET_POOL; i++) {
        const slot = slots.bullets[i];
        if (slot) slot.opacity.set(0);
      }
    },
    [slots],
  );

  // --- loop del juego: rAF + tick + sincronía de escena + render (D8/D9)
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastSceneKey = '';
    const frame = (now: number) => {
      const rawDt = now - last;
      const dt = Math.min(100, rawDt);
      last = now;
      const store = useDoodleJumpStore.getState();
      const game = getGame();
      if (!store.paused && game.status === 'playing') {
        handleEvents(store.tick(dt));
      }
      const s = scaleRef.current;
      if (s > 0) renderFrame(s);
      // Sync de escena: React solo re-renderiza si cambió el set de entidades.
      const key = `${game.platforms.map((p) => p.id).join(',')}|${game.monsters.map((m) => m.id).join(',')}|${game.bullets.map((b) => b.id).join(',')}`;
      if (key !== lastSceneKey) {
        lastSceneKey = key;
        setScene({
          platforms: game.platforms.slice(),
          monsters: game.monsters.slice(),
          bullets: game.bullets.slice(),
        });
      }
      if (rawDt > STALL_BUDGET_MS) perfJsStall('doodle-jump', rawDt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [handleEvents]);

  // --- suscripciones discretas para la UI React (status/score/paused)
  const paused = useDoodleJumpStore((st) => st.paused);
  const status = useDoodleJumpStore((st) => st.status);
  const score = useDoodleJumpStore((st) => st.score);

  // --- teclado web (D7): ←/→ mueven, Espacio/↑ dispara
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        useDoodleJumpStore.getState().setMoveDir(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        useDoodleJumpStore.getState().setMoveDir(1);
      } else if ((event.key === ' ' || event.key === 'ArrowUp') && !event.repeat) {
        event.preventDefault();
        const events = useDoodleJumpStore.getState().shootNow();
        if (events.length > 0) handleEvents(events);
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        useDoodleJumpStore.getState().setMoveDir(0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleEvents]);

  // --- gesto: drag continuo mueve / tap rápido dispara (D2/D3)
  const gesture = useMemo(() => {
    let lastX = 0;
    const pan = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-TAP_MAX_DISTANCE, TAP_MAX_DISTANCE])
      .onBegin((e) => {
        lastX = e.x;
      })
      .onUpdate((e) => {
        const s = scaleRef.current;
        if (s <= 0) return;
        const delta = (e.x - lastX) / s;
        lastX = e.x;
        if (delta !== 0) useDoodleJumpStore.getState().applyDrag(delta);
      });
    const tap = Gesture.Tap()
      .runOnJS(true)
      .maxDuration(TAP_MAX_DURATION_MS)
      .onEnd(() => {
        const events = useDoodleJumpStore.getState().shootNow();
        if (events.length > 0) handleEvents(events);
      });
    return Gesture.Simultaneous(pan, tap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleEvents]);

  // --- papel cuadriculado estático (D13): líneas memoizadas de una vez
  const grid = useMemo(() => {
    if (scale <= 0) return null;
    const lines: ReactNode[] = [];
    for (let x = GRID_STEP; x < WORLD_W; x += GRID_STEP) {
      lines.push(
        <View
          key={`v${x}`}
          style={{ position: 'absolute', left: x * scale, top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(62,58,46,0.07)' }}
        />,
      );
    }
    for (let y = GRID_STEP; y < WORLD_H; y += GRID_STEP) {
      lines.push(
        <View
          key={`h${y}`}
          style={{ position: 'absolute', top: y * scale, left: 0, right: 0, height: 1, backgroundColor: 'rgba(62,58,46,0.07)' }}
        />,
      );
    }
    return lines;
  }, [scale]);

  const paper = (
    <View style={styles.boardArea} onLayout={onLayout} accessibilityLabel="doodle-jump-escena">
      {scale > 0 ? (
        <Animated.View
          style={[
            styles.paper,
            { width: WORLD_W * scale, height: WORLD_H * scale },
            shakeStyle,
          ]}
        >
          {grid}
          <Renderer
            slots={slots}
            platforms={scene.platforms}
            monsters={scene.monsters}
            bullets={scene.bullets}
            scale={scale}
          />
          {popups.map((popup) => (
            <FloatingPopup key={popup.id} popup={popup} reduced={reduced} />
          ))}
        </Animated.View>
      ) : null}
    </View>
  );

  const endVisible = endShown && status !== 'playing';

  return (
    <View style={styles.screen}>
      <GameHeader
        gameId="doodle-jump"
        onExit={onExit}
        onRestart={restart}
        center={
          <Text style={styles.score} accessibilityLabel="doodle-jump-score">
            {score} m
          </Text>
        }
        left={
          <PressableScale
            accessibilityLabel="doodle-jump-pausa"
            onPress={() => useDoodleJumpStore.getState().togglePause()}
            style={styles.pauseButton}
          >
            <View>
              <View style={styles.pauseBar} />
              <View style={styles.pauseBar} />
            </View>
          </PressableScale>
        }
      />
      <GestureDetector gesture={gesture}>
        <View style={styles.area}>{paper}</View>
      </GestureDetector>
      {paused && status === 'playing' ? (
        <PauseOverlay onResume={() => useDoodleJumpStore.getState().togglePause()} />
      ) : null}
      {endVisible ? (
        <EndOverlay
          score={score}
          seconds={Math.floor(getGame().elapsedMs / 1000)}
          onRestart={restart}
          onExit={onExit}
        />
      ) : null}
    </View>
  );
}

/**
 * Popup de score (D17 de serpiente, adaptado): entrada FadeInUp + deriva
 * vertical en loop. Reduced motion: fade simple, sin deriva.
 */
function FloatingPopup({ popup, reduced }: { popup: ScorePopup; reduced: boolean | null }) {
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    y.value = withRepeat(withTiming(-26, { duration: 750 }), -1, true);
  }, [y, reduced]);
  const bob = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View
      entering={reduced ? FadeIn.duration(120) : FadeInUp.duration(160)}
      exiting={FadeOut.duration(150)}
      pointerEvents="none"
      style={[styles.popup, { left: popup.x - 30, top: popup.y - 16 }, bob]}
    >
      <Text style={[styles.popupText, { color: popup.color }]}>{popup.text}</Text>
    </Animated.View>
  );
}


const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#EFE9D6',
  },
  area: {
    flex: 1,
    backgroundColor: '#EFE9D6',
  },
  boardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paper: {
    backgroundColor: '#FFFDF5',
    borderWidth: 1,
    borderColor: '#D8D2BC',
    borderRadius: 8,
    overflow: 'hidden',
  },
  popup: {
    position: 'absolute',
    zIndex: 10,
  },
  popupText: {
    fontSize: 13,
    fontWeight: '900',
    textShadowColor: '#FFFDF5',
    textShadowRadius: 4,
  },
  score: {
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    color: '#3E3A2E',
  },
  pauseButton: {
    borderWidth: 1,
    borderColor: '#D8D2BC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    gap: 3,
  },
  pauseBar: {
    width: 4,
    height: 14,
    backgroundColor: '#6D6753',
    borderRadius: 1,
  },
});
