import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GAME_REGISTRY } from '@/core/game-registry';
import { GameCard } from '@/core/ui/GameCard';
import { useTheme } from '@/core/ui/ThemeProvider';

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Mobile-first: 1 columna en pantallas angostas, 2 en el resto
  const numColumns = width < 380 ? 1 : 2;

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + 12 }]}>
      <StatusBar style="auto" />
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.text }]}>Tasty Games</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="abrir-ajustes"
          accessibilityHint="Abre la pantalla de ajustes"
          onPress={() => router.push('/ajustes')}
          style={[styles.gearButton, { borderColor: theme.surfaceBorder }]}
        >
          <Text style={[styles.gearText, { color: theme.textMuted }]}>⚙</Text>
        </Pressable>
      </View>
      <Text style={[styles.subtitle, { color: theme.textMuted }]}>
        Colección de juegos clásicos
      </Text>

      {GAME_REGISTRY.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            Próximamente
          </Text>
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>
            Los juegos aparecerán acá a medida que se registren.
          </Text>
        </View>
      ) : (
        <FlatList
          key={numColumns}
          data={GAME_REGISTRY}
          keyExtractor={(game) => game.id}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? styles.column : undefined}
          contentContainerStyle={[styles.list, { paddingBottom: 24 + insets.bottom }]}
          renderItem={({ item }) => (
            <GameCard
              game={item}
              onPress={() => router.push({ pathname: '/juego/[id]', params: { id: item.id } })}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
  },
  gearButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  gearText: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
    marginTop: 4,
    marginBottom: 16,
  },
  list: {
    // paddingBottom dinámico (safe area) se aplica en el componente
  },
  column: {
    gap: 0,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
