import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/core/ui/ThemeProvider';
import type { DrawMode } from '../engine/state';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  drawMode: DrawMode;
  undoEnabled: boolean;
  onChangeDrawMode: (mode: DrawMode) => void;
  onChangeUndo: (enabled: boolean) => void;
}

function OptionButton({
  label,
  selected,
  onPress,
  testLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testLabel: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={testLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.option,
        { borderColor: theme.surfaceBorder },
        selected ? { backgroundColor: theme.primary, borderColor: theme.primary } : null,
      ]}
    >
      <Text style={[styles.optionText, { color: selected ? theme.primaryText : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

export function SettingsModal({
  visible,
  onClose,
  drawMode,
  undoEnabled,
  onChangeDrawMode,
  onChangeUndo,
}: SettingsModalProps) {
  const theme = useTheme();
  if (!visible) return null;

  return (
    <View
      style={[styles.overlay, { backgroundColor: `${theme.background}F2` }]}
      accessibilityLabel="solitario-ajustes"
    >
      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
        <Text style={[styles.title, { color: theme.text }]}>Ajustes</Text>

        <Text style={[styles.section, { color: theme.textMuted }]}>Cartas por robo (aplica en la próxima partida)</Text>
        <View style={styles.row}>
          <OptionButton label="Robar 1" selected={drawMode === 1} onPress={() => onChangeDrawMode(1)} testLabel="solitario-set-draw-1" />
          <OptionButton label="Robar 3" selected={drawMode === 3} onPress={() => onChangeDrawMode(3)} testLabel="solitario-set-draw-3" />
        </View>

        <Text style={[styles.section, { color: theme.textMuted }]}>Deshacer (cada uso penaliza el puntaje)</Text>
        <View style={styles.row}>
          <OptionButton label="Off" selected={!undoEnabled} onPress={() => onChangeUndo(false)} testLabel="solitario-set-undo-off" />
          <OptionButton label="On" selected={undoEnabled} onPress={() => onChangeUndo(true)} testLabel="solitario-set-undo-on" />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="solitario-cerrar-ajustes"
          onPress={onClose}
          style={[styles.close, { backgroundColor: theme.primary }]}
        >
          <Text style={[styles.closeText, { color: theme.primaryText }]}>Listo</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  section: {
    fontSize: 13,
    marginTop: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  close: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  closeText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
