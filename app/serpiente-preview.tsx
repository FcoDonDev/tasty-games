import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PressableScale } from '@/core/ui/PressableScale';
import { SerpienteGalleryScreen } from '@/games/serpiente/preview';

/**
 * Ruta dev de iteración de diseño (PLAN-SERPIENTE §8, patrón ADR 0012):
 * galería comparativa de las 3 versiones de Arcade jugoso con estado falso.
 * Sin navegación de producción (solo entrada manual por URL).
 */
export default function SerpientePreview() {
  const router = useRouter();
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <PressableScale accessibilityLabel="volver-preview" onPress={() => router.back()}>
          <Text style={styles.volver}>← Volver</Text>
        </PressableScale>
        <Text style={styles.title}>Serpiente · Preview</Text>
      </View>
      <SerpienteGalleryScreen />
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
});
