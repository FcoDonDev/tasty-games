import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from './ThemeProvider';

interface HelpModalProps {
  gameId: string;
  rules: string;
  visible: boolean;
  onClose: () => void;
}

/**
 * Modal genérico de reglas in-app. Lo consumen GameHeader (botón ? del juego)
 * y el contenedor app/juego/[id].tsx (botón ? de la barra superior).
 */
export function HelpModal({ gameId, rules, visible, onClose }: HelpModalProps) {
  const theme = useTheme();
  if (!visible) return null;

  return (
    <View
      style={[styles.overlay, { backgroundColor: `${theme.background}F2` }]}
      accessibilityRole="alert"
      accessibilityLabel={`modal-ayuda-${gameId}`}
    >
      <Text style={[styles.title, { color: theme.text }]}>Reglas</Text>
      <ScrollView
        style={[styles.rulesBox, { borderColor: theme.surfaceBorder, backgroundColor: theme.surface }]}
        alwaysBounceVertical={false}
      >
        <Text style={[styles.rules, { color: theme.text }]}>{rules}</Text>
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`cerrar-ayuda-${gameId}`}
        onPress={onClose}
        style={[styles.closeButton, { backgroundColor: theme.primary }]}
      >
        <Text style={[styles.closeButtonText, { color: theme.primaryText }]}>Entendido</Text>
      </Pressable>
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
    zIndex: 50,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
  },
  rulesBox: {
    width: '100%',
    maxWidth: 520,
    maxHeight: 340,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  rules: {
    fontSize: 15,
    lineHeight: 22,
  },
  closeButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
