import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { PressableScale } from '@/core/ui/PressableScale';
import { overlayEnter, overlayExit } from '@/core/ui/overlayAnimation';

export type ControlMode = 'gestos' | 'flotante';

/**
 * Ajustes (T3): borde atravesar/muro (D1) + control táctil + anillo.
 * Espejo de `ControlSettings` de wakwak con labels propios. La preferencia
 * persiste en `preferencesRepository` (SerpienteScreen); el wrap se aplica
 * en vivo vía `setWrap`.
 */
export function SettingsButton({ onPress }: { onPress: () => void }) {
  return (
    <PressableScale accessibilityLabel="serpiente-ajustes" onPress={onPress} style={styles.headerButton}>
      <Text style={styles.headerIcon}>⚙</Text>
    </PressableScale>
  );
}

interface SettingsModalProps {
  visible: boolean;
  /**
   * B3: el modal existe en TODAS las plataformas (el borde es setting de
   * juego, D1); las opciones de control táctil solo se muestran en táctil.
   */
  touch: boolean;
  wrap: boolean;
  mode: ControlMode;
  ring: boolean;
  onChangeWrap: (wrap: boolean) => void;
  onChangeMode: (mode: ControlMode) => void;
  onChangeRing: (ring: boolean) => void;
  onClose: () => void;
}

export function SettingsModal({
  visible,
  touch,
  wrap,
  mode,
  ring,
  onChangeWrap,
  onChangeMode,
  onChangeRing,
  onClose,
}: SettingsModalProps) {
  if (!visible) return null;
  return (
    <Animated.View
      entering={overlayEnter()}
      exiting={overlayExit()}
      style={styles.overlay}
      accessibilityLabel="modal-ajustes-serpiente"
    >
      <View style={styles.card}>
        <Text style={styles.title}>Ajustes</Text>

        <PressableScale
          accessibilityLabel="serpiente-wrap"
          onPress={() => onChangeWrap(!wrap)}
          style={[styles.option, wrap && styles.optionActive]}
        >
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Atravesar bordes</Text>
            <Text style={styles.optionHint}>
              {wrap ? 'Salir por un borde entra por el opuesto' : 'Apagado: el muro mata'}
            </Text>
          </View>
          {wrap ? <Text style={styles.check}>✓</Text> : null}
        </PressableScale>

        {touch ? (
          <>
            <PressableScale
              accessibilityLabel="serpiente-modo-gestos"
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
              accessibilityLabel="serpiente-modo-flotante"
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
                accessibilityLabel="serpiente-anillo-feedback"
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
          </>
        ) : null}

        <PressableScale
          accessibilityLabel="cerrar-ajustes-serpiente"
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
    borderColor: '#14532B',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerIcon: {
    color: '#86EFAC',
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
    backgroundColor: '#07120CE6',
  },
  card: {
    alignItems: 'stretch',
    gap: 8,
    backgroundColor: '#0E2417',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#14532B',
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
    borderColor: '#14532B',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  optionActive: {
    borderColor: '#4ADE80',
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
    color: '#86EFAC',
    fontSize: 12,
  },
  check: {
    color: '#4ADE80',
    fontSize: 16,
    fontWeight: '800',
  },
  button: {
    backgroundColor: '#4ADE80',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#052E16',
    fontSize: 15,
    fontWeight: '700',
  },
});
