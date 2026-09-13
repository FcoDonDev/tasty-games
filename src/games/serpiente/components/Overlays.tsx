import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { PressableScale } from '@/core/ui/PressableScale';
import { overlayEnter, overlayExit } from '@/core/ui/overlayAnimation';
import type { GameStatus } from '../engine/rules';

export function PauseOverlay({ onResume }: { onResume: () => void }) {
  return (
    <Animated.View
      entering={overlayEnter()}
      exiting={overlayExit()}
      style={styles.overlay}
      accessibilityLabel="modal-pausa-serpiente"
    >
      <View style={styles.card}>
        <Text style={styles.title}>Pausa</Text>
        <PressableScale accessibilityLabel="reanudar-serpiente" onPress={onResume} style={styles.button}>
          <Text style={styles.buttonText}>Seguir</Text>
        </PressableScale>
      </View>
    </Animated.View>
  );
}

export function EndOverlay({
  status,
  score,
  eaten,
  seconds,
  onRestart,
  onExit,
}: {
  status: GameStatus;
  score: number;
  eaten: number;
  seconds: number;
  onRestart: () => void;
  onExit: () => void;
}) {
  const won = status === 'won';
  return (
    <Animated.View
      entering={overlayEnter()}
      exiting={overlayExit()}
      style={styles.overlay}
      accessibilityLabel="modal-fin-serpiente"
    >
      <View style={styles.card}>
        <Text style={styles.title}>{won ? '¡Tablero lleno!' : 'Fin del juego'}</Text>
        <Text style={styles.stats}>
          {score} pts · {eaten} comidas · {seconds}s
        </Text>
        <PressableScale accessibilityLabel="reintentar-serpiente" onPress={onRestart} style={styles.button}>
          <Text style={styles.buttonText}>Jugar de nuevo</Text>
        </PressableScale>
        <PressableScale accessibilityLabel="fin-salir-serpiente" onPress={onExit} style={styles.ghost}>
          <Text style={styles.ghostText}>Salir</Text>
        </PressableScale>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 60,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#07120CE6',
  },
  card: {
    alignItems: 'stretch',
    gap: 10,
    backgroundColor: '#0E2417',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#14532B',
    padding: 24,
    width: '100%',
    maxWidth: 320,
  },
  title: {
    color: '#E2E8F0',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  stats: {
    color: '#86EFAC',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  button: {
    backgroundColor: '#4ADE80',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonText: {
    color: '#052E16',
    fontSize: 16,
    fontWeight: '800',
  },
  ghost: {
    borderColor: '#14532B',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  ghostText: {
    color: '#86EFAC',
    fontSize: 14,
    fontWeight: '600',
  },
});
