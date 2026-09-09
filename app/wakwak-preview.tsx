import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PressableScale } from '@/core/ui/PressableScale';
import { LaberintoPreview, PersonajesPreview } from '@/games/wakwak/preview';

/**
 * Ruta dev de iteración de diseño (PLAN-WAK-POLISH): galería de personajes y
 * preview del laberinto con validador en vivo. No toca el juego activo.
 */
export default function WakWakPreview() {
  const router = useRouter();
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <PressableScale accessibilityLabel="volver-preview" onPress={() => router.back()}>
          <Text style={styles.volver}>← Volver</Text>
        </PressableScale>
        <Text style={styles.title}>Wak Wak · Preview</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <PersonajesPreview />
        <LaberintoPreview />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#060B16',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  volver: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
  },
  title: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '800',
  },
  content: {
    padding: 16,
    gap: 28,
    paddingBottom: 48,
  },
});
