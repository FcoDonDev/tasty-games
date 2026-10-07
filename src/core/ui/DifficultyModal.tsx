import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { useTheme } from './ThemeProvider';
import { overlayEnter, overlayExit } from './overlayAnimation';

export interface DifficultyOption {
  /** Valor a persistir/navegar (string: la pref y el param de URL son strings). */
  value: string;
  label: string;
  /** Subtítulo corto opcional bajo la etiqueta (hint del nivel). */
  hint?: string;
}

interface DifficultyModalProps {
  gameId: string;
  visible: boolean;
  options: DifficultyOption[];
  onChoose: (value: string) => void;
  /** Descartar sin elegir: el caller persiste el default (D-T5-2). */
  onDismiss: () => void;
}

/**
 * Modal genérico de "primer inicio" para juegos con modos (PLAN-ACCESIBILIDAD
 * T5, D-T5-4): lo muestra el Home ANTES de navegar cuando no hay preferencia
 * persistida. Patrón de los modales de los juegos (overlay enter/exit +
 * PressableScale) con targets grandes para 3ª edad.
 */
export function DifficultyModal({ gameId, visible, options, onChoose, onDismiss }: DifficultyModalProps) {
  const theme = useTheme();
  if (!visible) return null;

  return (
    <Animated.View
      entering={overlayEnter()}
      exiting={overlayExit()}
      style={[styles.overlay, { backgroundColor: `${theme.background}F2` }]}
      accessibilityRole="alert"
      accessibilityLabel="modal-dificultad-home"
    >
      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
        <Text style={[styles.title, { color: theme.text }]}>¿Cómo quieres jugar?</Text>
        <View style={styles.options}>
          {options.map((option) => (
            <PressableScale
              key={option.value}
              accessibilityLabel={`elegir-dificultad-home-${option.value}`}
              onPress={() => onChoose(option.value)}
              style={[styles.option, { borderColor: theme.surfaceBorder, borderCurve: 'continuous' }]}
            >
              <Text style={[styles.optionLabel, { color: theme.text }]}>{option.label}</Text>
              {option.hint ? (
                <Text style={[styles.optionHint, { color: theme.textMuted }]}>{option.hint}</Text>
              ) : null}
            </PressableScale>
          ))}
        </View>
        <PressableScale
          accessibilityLabel={`cerrar-dificultad-home-${gameId}`}
          onPress={onDismiss}
          style={styles.dismiss}
          hitSlop={12}
        >
          <Text style={[styles.dismissText, { color: theme.textMuted }]}>Ahora no</Text>
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
    zIndex: 50,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  options: {
    gap: 10,
  },
  option: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  optionLabel: {
    fontSize: 17,
    fontWeight: '700',
  },
  optionHint: {
    fontSize: 13,
    marginTop: 2,
  },
  dismiss: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  dismissText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
