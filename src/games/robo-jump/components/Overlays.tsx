/**
 * Overlays de Robo Jump (T6), espejo de `serpiente/components/Overlays`
 * con la paleta sketch del juego (D13). Endless: siempre derrota (D4).
 */

import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { PressableScale } from '@/core/ui/PressableScale';
import { overlayEnter, overlayExit } from '@/core/ui/overlayAnimation';

export function PauseOverlay({ onResume }: { onResume: () => void }) {
  return (
    <Animated.View
      entering={overlayEnter()}
      exiting={overlayExit()}
      style={styles.overlay}
      accessibilityLabel="overlay-pausa"
    >
      <View style={styles.card}>
        <Text style={styles.title}>Pausa</Text>
        <PressableScale
          accessibilityLabel="reanudar-robo-jump"
          onPress={onResume}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Seguir</Text>
        </PressableScale>
      </View>
    </Animated.View>
  );
}

export function EndOverlay({
  score,
  seconds,
  onRestart,
  onExit,
}: {
  score: number;
  seconds: number;
  onRestart: () => void;
  onExit: () => void;
}) {
  return (
    <Animated.View
      entering={overlayEnter()}
      exiting={overlayExit()}
      style={styles.overlay}
      accessibilityLabel="overlay-fin"
    >
      <View style={styles.card}>
        <Text style={styles.title}>Fin del salto</Text>
        <Text style={styles.stats}>
          {score} m · {seconds}s
        </Text>
        <PressableScale
          accessibilityLabel="reintentar-robo-jump"
          onPress={onRestart}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Jugar de nuevo</Text>
        </PressableScale>
        <PressableScale
          accessibilityLabel="fin-salir-robo-jump"
          onPress={onExit}
          style={styles.ghost}
        >
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
    backgroundColor: '#4A4437E6',
  },
  card: {
    alignItems: 'stretch',
    gap: 10,
    backgroundColor: '#FFFDF5',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#3E3A2E',
    padding: 24,
    width: '100%',
    maxWidth: 320,
  },
  title: {
    color: '#3E3A2E',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  stats: {
    color: '#6D6753',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  button: {
    backgroundColor: '#7CB342',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonText: {
    color: '#1B2410',
    fontSize: 16,
    fontWeight: '800',
  },
  ghost: {
    borderColor: '#D8D2BC',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  ghostText: {
    color: '#6D6753',
    fontSize: 14,
    fontWeight: '600',
  },
});
