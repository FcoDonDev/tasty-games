import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { PressableScale } from '@/core/ui/PressableScale';
import { overlayEnter, overlayExit } from '@/core/ui/overlayAnimation';
import type { GameStatus } from '../engine/rules';

/** Overlays discretos del juego: pausa y fin de partida (victoria/derrota). */

function OverlayFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <Animated.View
      entering={overlayEnter()}
      exiting={overlayExit()}
      style={[styles.overlay]}
      accessibilityRole="alert"
      accessibilityLabel={label}
    >
      <View style={styles.card}>{children}</View>
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

export function EndOverlay({
  status,
  score,
  onRestart,
  onExit,
}: {
  status: GameStatus;
  score: number;
  onRestart: () => void;
  onExit: () => void;
}) {
  const won = status === 'won';
  return (
    <OverlayFrame label="modal-fin-wakwak">
      <Text style={[styles.title, { color: won ? '#4ADE80' : '#FB7185' }]}>
        {won ? '¡Laberinto despejado!' : 'Sistemas comprometidos'}
      </Text>
      <Text style={styles.subtitle}>
        {won ? 'Recogiste todas las baterías' : 'Los drones atraparon al robot'} · {score} pts
      </Text>
      <PressableScale accessibilityLabel="reintentar-wakwak" onPress={onRestart} style={styles.button}>
        <Text style={styles.buttonText}>↻ Reintentar</Text>
      </PressableScale>
      <PressableScale accessibilityLabel="fin-salir-wakwak" onPress={onExit} style={styles.ghost}>
        <Text style={styles.ghostText}>Salir</Text>
      </PressableScale>
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
