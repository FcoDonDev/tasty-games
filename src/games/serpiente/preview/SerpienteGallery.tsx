import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SerpientePreviewV1 } from './SerpientePreviewV1';
import { SerpientePreviewV2 } from './SerpientePreviewV2';
import { SerpientePreviewV3 } from './SerpientePreviewV3';

/**
 * Galería comparativa de las 3 versiones (PLAN-SERPIENTE §8, patrón
 * ADR 0012): mismo estado falso, tres takes de Arcade jugoso. El feel
 * temporal (hit-stop, slow-mo, shake) es runtime y aquí se representa
 * estático; se valida en juego real tras la elección.
 */
const VERSIONS = [
  {
    id: 'V1',
    title: 'V1 · Víbora neón',
    points: ['Cuerpo continuo + cabeza rosa con glow focalizado', 'HUD flotante + chip violeta', 'Ondulación, pulso y popup animados en loop'],
  },
  {
    id: 'V2',
    title: 'V2 · Escamas arcade',
    points: ['Cuerpo continuo con escamas, cero glow (más barato)', 'HUD flotante + chip violeta', 'Ojos direccionales + ring en el especial'],
  },
  {
    id: 'V3',
    title: 'V3 · Tinta colección',
    points: ['Cuerpo menta con vientre + tarjeta con borde', 'HUD flotante + chip violeta', 'Coherente con WakWak, sin glow'],
  },
] as const;

export function SerpienteGallery() {
  return (
    <View accessibilityLabel="galeria-serpiente">
      {VERSIONS.map((version) => (
        <View key={version.id} style={styles.section}>
          <Text style={styles.title}>{version.title}</Text>
          {version.points.map((point) => (
            <Text key={point} style={styles.point}>
              · {point}
            </Text>
          ))}
          <View style={styles.board}>
            {version.id === 'V1' ? (
              <SerpientePreviewV1 />
            ) : version.id === 'V2' ? (
              <SerpientePreviewV2 />
            ) : (
              <SerpientePreviewV3 />
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

export function SerpienteGalleryScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SerpienteGallery />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 32,
    paddingBottom: 48,
  },
  section: {
    gap: 4,
  },
  title: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '800',
  },
  point: {
    color: '#94A3B8',
    fontSize: 12,
  },
  board: {
    marginTop: 8,
  },
});
