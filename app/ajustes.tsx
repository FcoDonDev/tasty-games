import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '@/core/stores/useAppStore';
import { recordsRepository } from '@/core/db/repositories/recordsRepository';
import { PressableScale } from '@/core/ui/PressableScale';
import { useTheme } from '@/core/ui/ThemeProvider';
import { overlayEnter, overlayExit } from '@/core/ui/overlayAnimation';

export default function AjustesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const darkMode = useAppStore((state) => state.darkMode);
  const toggleDarkMode = useAppStore((state) => state.toggleDarkMode);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [cleared, setCleared] = useState(false);

  const handleClear = async () => {
    await recordsRepository.clearAll();
    setShowClearConfirm(false);
    setCleared(true);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <PressableScale
          accessibilityLabel="cerrar-ajustes"
          onPress={() => router.back()}
          style={[styles.headerButton, { borderColor: theme.surfaceBorder, borderCurve: 'continuous' }]}
        >
          <Text style={[styles.headerButtonText, { color: theme.textMuted }]}>← Volver</Text>
        </PressableScale>
        <Text style={[styles.title, { color: theme.text }]}>Ajustes</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Modo oscuro</Text>
            <Text style={[styles.rowSubtitle, { color: theme.textMuted }]}>
              Tema de toda la aplicación
            </Text>
          </View>
          <Switch
            accessibilityLabel="set-dark-mode"
            value={darkMode}
            onValueChange={toggleDarkMode}
          />
        </View>

        <View style={[styles.separator, { borderColor: theme.surfaceBorder }]} />

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>Borrar récords</Text>
            <Text style={[styles.rowSubtitle, { color: theme.textMuted }]}>
              Elimina todos los puntajes guardados
            </Text>
          </View>
          <PressableScale
            accessibilityLabel="abrir-borrar-records"
            onPress={() => {
              setCleared(false);
              setShowClearConfirm(true);
            }}
            style={[styles.clearButton, { borderColor: theme.surfaceBorder, borderCurve: 'continuous' }]}
          >
            <Text style={[styles.clearButtonText, { color: theme.textMuted }]}>Borrar</Text>
          </PressableScale>
        </View>
        {cleared ? (
          <Text style={[styles.clearedNote, { color: theme.textMuted }]}>
            Récords eliminados
          </Text>
        ) : null}
      </View>

      {showClearConfirm ? (
        <Animated.View
          entering={overlayEnter()}
          exiting={overlayExit()}
          style={[styles.overlay, { backgroundColor: `${theme.background}F2` }]}
          accessibilityRole="alert"
          accessibilityLabel="modal-borrar-records"
        >
          <Text style={[styles.overlayTitle, { color: theme.text }]}>¿Borrar todos los récords?</Text>
          <Text style={[styles.overlaySubtitle, { color: theme.textMuted }]}>
            Esta acción no se puede deshacer.
          </Text>
          <PressableScale
            accessibilityLabel="confirmar-borrar-records"
            onPress={() => void handleClear()}
            style={[styles.overlayButton, { backgroundColor: theme.primary, borderCurve: 'continuous' }]}
          >
            <Text style={[styles.overlayButtonText, { color: theme.primaryText }]}>Borrar</Text>
          </PressableScale>
          <PressableScale
            accessibilityLabel="cancelar-borrar-records"
            onPress={() => setShowClearConfirm(false)}
            style={[styles.overlayButtonGhost, { borderColor: theme.surfaceBorder, borderCurve: 'continuous' }]}
          >
            <Text style={[styles.overlayButtonTextGhost, { color: theme.textMuted }]}>Cancelar</Text>
          </PressableScale>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 64,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  card: {
    marginTop: 20,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  rowSubtitle: {
    fontSize: 13,
  },
  separator: {
    borderTopWidth: 1,
  },
  clearButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  clearedNote: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  overlayTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  overlaySubtitle: {
    fontSize: 15,
    textAlign: 'center',
  },
  overlayButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  overlayButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  overlayButtonGhost: {
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  overlayButtonTextGhost: {
    fontSize: 16,
    fontWeight: '600',
  },
});
