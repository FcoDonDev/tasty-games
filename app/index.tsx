import { FlatList, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Easing } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GAME_REGISTRY } from '@/core/game-registry';
import { GameCard } from '@/core/ui/GameCard';
import { PressableScale } from '@/core/ui/PressableScale';
import { useTheme } from '@/core/ui/ThemeProvider';
import { useContainerSize } from '@/core/ui/useContainerSize';
import { columnsForWidth } from '@/core/ui/responsiveColumns';

// Entrada de la lista: se anima el CONTENEDOR una vez en mount (la lista es
// virtualizada: nunca `entering` por fila). Ocasional / delight, ≤250ms.
const LIST_ENTER = FadeIn.duration(250).easing(Easing.bezier(0.23, 1, 0.32, 1));

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // Tamaño real del área de lista (onLayout): las columnas se derivan del
  // ancho medido, no de useWindowDimensions → reflow automático al
  // rotar/redimensionar (el `key={numColumns}` remonta la lista).
  const { size, onLayout } = useContainerSize();
  const numColumns = size ? columnsForWidth(size.width) : 1;

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + 12 }]}>
      <StatusBar style="auto" />
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.text }]}>Tasty Games</Text>
        <PressableScale
          accessibilityLabel="abrir-ajustes"
          accessibilityHint="Abre la pantalla de ajustes"
          onPress={() => router.push('/ajustes')}
          style={[styles.gearButton, { borderColor: theme.surfaceBorder, borderCurve: 'continuous' }]}
        >
          <Text style={[styles.gearText, { color: theme.textMuted }]}>⚙</Text>
        </PressableScale>
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
        <Animated.View entering={LIST_ENTER} style={styles.listWrapper} onLayout={onLayout}>
          <FlatList
            key={numColumns}
            style={styles.listScroll}
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
        </Animated.View>
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
  listWrapper: {
    flex: 1,
  },
  // El FlatList necesita su propia constraint de alto en web: sin `flex: 1`
  // directo el ScrollView interno no scrollea y las filas quedan fuera de vista.
  listScroll: {
    flex: 1,
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
