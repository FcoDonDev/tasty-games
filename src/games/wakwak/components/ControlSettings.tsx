import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { PressableScale } from '@/core/ui/PressableScale';
import { overlayEnter, overlayExit } from '@/core/ui/overlayAnimation';

/**
 * Ajustes de control táctil (solo se muestran en dispositivos táctiles).
 * Botón en el header + modal a nivel de pantalla con:
 * - modo "gestos": swipe en cualquier parte de la pantalla (default);
 * - modo "flotante": pad invisible que nace donde apoya el dedo, con anillo
 *   de feedback opcional.
 * La preferencia persiste en `preferencesRepository` (WakWakScreen).
 */

export type ControlMode = 'gestos' | 'flotante';

interface ControlSettingsButtonProps {
  onPress: () => void;
}

export function ControlSettingsButton({ onPress }: ControlSettingsButtonProps) {
  return (
    <PressableScale accessibilityLabel="wakwak-ajustes-control" onPress={onPress} style={styles.headerButton}>
      <Text style={styles.headerIcon}>⚙</Text>
    </PressableScale>
  );
}

interface ControlSettingsModalProps {
  visible: boolean;
  mode: ControlMode;
  ring: boolean;
  onChangeMode: (mode: ControlMode) => void;
  onChangeRing: (ring: boolean) => void;
  onClose: () => void;
}

export function ControlSettingsModal({
  visible,
  mode,
  ring,
  onChangeMode,
  onChangeRing,
  onClose,
}: ControlSettingsModalProps) {
  if (!visible) return null;
  return (
    <Animated.View
      entering={overlayEnter()}
      exiting={overlayExit()}
      style={styles.overlay}
      accessibilityLabel="modal-control-wakwak"
    >
      <View style={styles.card}>
        <Text style={styles.title}>Control</Text>

        <PressableScale
          accessibilityLabel="wakwak-modo-gestos"
          onPress={() => onChangeMode('gestos')}
          style={[styles.option, mode === 'gestos' && styles.optionActive]}
        >
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Gestos</Text>
            <Text style={styles.optionHint}>Deslizá en cualquier parte de la pantalla</Text>
          </View>
          {mode === 'gestos' ? <Text style={styles.check}>✓</Text> : null}
        </PressableScale>

        <PressableScale
          accessibilityLabel="wakwak-modo-flotante"
          onPress={() => onChangeMode('flotante')}
          style={[styles.option, mode === 'flotante' && styles.optionActive]}
        >
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Flotante</Text>
            <Text style={styles.optionHint}>Pad invisible donde apoyes el dedo</Text>
          </View>
          {mode === 'flotante' ? <Text style={styles.check}>✓</Text> : null}
        </PressableScale>

        {mode === 'flotante' ? (
          <PressableScale
            accessibilityLabel="wakwak-anillo-feedback"
            onPress={() => onChangeRing(!ring)}
            style={[styles.option, styles.optionSub, ring && styles.optionActive]}
          >
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Anillo de feedback</Text>
              <Text style={styles.optionHint}>Marca el punto de control mientras tocás</Text>
            </View>
            {ring ? <Text style={styles.check}>✓</Text> : null}
          </PressableScale>
        ) : null}

        <PressableScale
          accessibilityLabel="cerrar-control-wakwak"
          onPress={onClose}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Listo</Text>
        </PressableScale>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    borderWidth: 1,
    borderColor: '#33415C',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerIcon: {
    color: '#94A3B8',
    fontSize: 15,
  },
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
    backgroundColor: '#0B1220E6',
  },
  card: {
    alignItems: 'stretch',
    gap: 8,
    backgroundColor: '#141D33',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#33415C',
    padding: 20,
    width: '100%',
    maxWidth: 320,
  },
  title: {
    color: '#E2E8F0',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderColor: '#33415C',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  optionActive: {
    borderColor: '#34D399',
  },
  optionSub: {
    marginLeft: 16,
  },
  optionText: {
    flexShrink: 1,
    gap: 2,
  },
  optionTitle: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '700',
  },
  optionHint: {
    color: '#94A3B8',
    fontSize: 12,
  },
  check: {
    color: '#34D399',
    fontSize: 16,
    fontWeight: '800',
  },
  button: {
    backgroundColor: '#34D399',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#0B1220',
    fontSize: 15,
    fontWeight: '700',
  },
});
