import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion, ZoomIn } from 'react-native-reanimated';
import { PressableScale } from '@/core/ui/PressableScale';
import { overlayEnter, overlayExit } from '@/core/ui/overlayAnimation';
import type { GameStatus } from '../engine/rules';

/** Overlays discretos del juego: pausa y fin de run (victoria/derrota). */

function OverlayFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <Animated.View
      entering={overlayEnter()}
      exiting={overlayExit()}
      style={[styles.overlay]}
      accessibilityRole="alert"
      accessibilityLabel={label}
    >
      {children}
    </Animated.View>
  );
}

export function PauseOverlay({ onResume }: { onResume: () => void }) {
  return (
    <OverlayFrame label="modal-pausa-wakwak">
      <Text style={styles.title}>Pausa</Text>
      <PressableScale accessibilityLabel="reanudar-wakwak" onPress={onResume} style={styles.button}>
        <Text style={styles.buttonText}>▶ Reanudar</Text>
      </PressableScale>
    </OverlayFrame>
  );
}

export interface RunStats {
  level: number;
  bestChain: number;
}

export function EndOverlay({
  status,
  score,
  stats,
  onRestart,
  onExit,
  picker,
}: {
  status: GameStatus;
  score: number;
  stats: RunStats;
  onRestart: () => void;
  onExit: () => void;
  /** slot del selector de nivel de inicio (react node) */
  picker?: React.ReactNode;
}) {
  const won = status === 'won';
  const reduced = useReducedMotion();
  return (
    <OverlayFrame label="modal-fin-wakwak">
      <Animated.View
        entering={reduced ? FadeIn.duration(200) : ZoomIn.duration(200)}
        style={styles.card}
      >
        <Text style={[styles.title, { color: won ? '#4ADE80' : '#FB7185' }]}>
          {won ? '¡Run completa!' : 'Sistemas comprometidos'}
        </Text>
        <Text style={styles.subtitle}>
          {won
            ? `Despejaste los 8 niveles · nivel ${stats.level}`
            : `Llegaste al nivel ${stats.level} · ${score} pts`}
        </Text>
        <Text style={styles.stats}>
          Mejor combo: {stats.bestChain >= 2 ? `×${stats.bestChain}` : '—'} · {score} pts
        </Text>
        {picker}
        <PressableScale accessibilityLabel="reintentar-wakwak" onPress={onRestart} style={styles.button}>
          <Text style={styles.buttonText}>↻ Reintentar (nivel 1)</Text>
        </PressableScale>
        <PressableScale accessibilityLabel="fin-salir-wakwak" onPress={onExit} style={styles.ghost}>
          <Text style={styles.ghostText}>Salir</Text>
        </PressableScale>
      </Animated.View>
    </OverlayFrame>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0B1220E6',
  },
  card: {
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#141D33',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#33415C',
    padding: 24,
    width: '100%',
    maxWidth: 320,
  },
  title: {
    color: '#E2E8F0',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
  },
  stats: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#34D399',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 8,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#0B1220',
    fontSize: 16,
    fontWeight: '700',
  },
  ghost: {
    borderColor: '#33415C',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 10,
    width: '100%',
    alignItems: 'center',
  },
  ghostText: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '600',
  },
});
