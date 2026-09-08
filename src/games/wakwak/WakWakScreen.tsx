import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { GameHeader } from '@/core/ui/GameHeader';
import { PressableScale } from '@/core/ui/PressableScale';
import { hapticGameWin } from '@/core/ui/haptics';
import { soundGameWin, soundHit, soundPickup, soundPowerUp } from '@/core/ui/sound';
import { useContainerSize } from '@/core/ui/useContainerSize';
import type { GameScreenProps } from '@/core/types';
import { DirectionPad } from './components/DirectionPad';
import { Hud } from './components/Hud';
import { EndOverlay, PauseOverlay } from './components/Overlays';
import { MAZE_COLS, MAZE_ROWS, type Direction } from './engine/maze';
import { worldSnapshot, type GameEvent } from './engine/rules';
import { useWakWakStore } from './engine/state';
import { EntitiesLayer, type EntitiesHandle } from './renderer/reanimated/EntitiesLayer';
import { MazeLayer } from './renderer/reanimated/MazeLayer';

const BOARD_BG = '#0B1220';
const KEY_DIRS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/**
 * WakWakScreen: orquestador del motor A (ADR 0010). Posee el loop rAF que
 * alimenta `store.tick(dt)` y escribe poses en `EntitiesLayer` vía el puerto
 * de presentación; React re-renderiza solo con eventos discretos.
 */
export default function WakWakScreen({ onExit, onGameEnd, initialSeed }: GameScreenProps) {
  const { size, onLayout } = useContainerSize();
  const [cellSize, setCellSize] = useState(0);
  const entitiesRef = useRef<EntitiesHandle | null>(null);
  const endedRef = useRef(false);
  const onGameEndRef = useRef(onGameEnd);
  onGameEndRef.current = onGameEnd;

  const paused = useWakWakStore((s) => s.paused);
  const status = useWakWakStore((s) => s.game.status);
  const batteries = useWakWakStore((s) => s.game.batteries);
  const supers = useWakWakStore((s) => s.game.supers);
  const bonusActive = useWakWakStore((s) => s.game.bonus !== null);
  const score = useWakWakStore((s) => s.game.score);

  // --- partida: reset al montar y al reintentar (conserva seed E2E)
  useEffect(() => {
    endedRef.current = false;
    useWakWakStore.getState().reset(initialSeed);
  }, [initialSeed]);

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
      const dt = Math.min(100, now - last);
      last = now;
      const store = useWakWakStore.getState();
      if (!store.paused && store.game.status === 'playing') {
        handleEvents(store.tick(dt));
      }
      entitiesRef.current?.present(worldSnapshot(useWakWakStore.getState().game));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [handleEvents]);

  // --- teclado (web/QA)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (event: KeyboardEvent) => {
      const dir = KEY_DIRS[event.key];
      if (!dir) return;
      event.preventDefault();
      useWakWakStore.getState().setDirection(dir);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // --- swipe sobre el tablero
  const swipe = Gesture.Pan().onEnd((event) => {
    const { translationX, translationY } = event;
    if (Math.abs(translationX) < 24 && Math.abs(translationY) < 24) return;
    const dir: Direction =
      Math.abs(translationX) > Math.abs(translationY)
        ? translationX > 0
          ? 'right'
          : 'left'
        : translationY > 0
          ? 'down'
          : 'up';
    useWakWakStore.getState().setDirection(dir);
  });

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

  return (
    <View style={styles.screen}>
      <GameHeader
        gameId="wakwak"
        onExit={onExit}
        onRestart={restart}
        left={
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
        }
      />
      <View style={styles.area}>
        <Hud />
        <View style={styles.boardArea} onLayout={onLayout}>
          {cellSize > 0 ? (
            <GestureDetector gesture={swipe}>
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
            </GestureDetector>
          ) : null}
        </View>
        <DirectionPad />
      </View>
      {paused && status === 'playing' ? (
        <PauseOverlay onResume={() => useWakWakStore.getState().togglePause()} />
      ) : null}
      {status !== 'playing' ? (
        <EndOverlay status={status} score={score} onRestart={restart} onExit={onExit} />
      ) : null}
    </View>
  );
}

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
