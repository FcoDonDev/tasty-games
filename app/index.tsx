import { useState } from 'react';
import { Platform, FlatList, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Easing } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GAME_REGISTRY, getVisibleGames } from '@/core/game-registry';
import { GameCard } from '@/core/ui/GameCard';
import { DifficultyModal, type DifficultyOption } from '@/core/ui/DifficultyModal';
import { PressableScale } from '@/core/ui/PressableScale';
import { useTheme } from '@/core/ui/ThemeProvider';
import { useContainerSize } from '@/core/ui/useContainerSize';
import { columnsForWidth } from '@/core/ui/responsiveColumns';
import { preferencesRepository } from '@/core/db/repositories/preferencesRepository';
import type { GameDefinition } from '@/core/types';

// Entrada de la lista: se anima el CONTENEDOR una vez en mount (la lista es
// virtualizada: nunca `entering` por fila). Ocasional / delight, ≤250ms.
const LIST_ENTER = FadeIn.duration(250).easing(Easing.bezier(0.23, 1, 0.32, 1));

interface DifficultyGate {
  prefKey: string;
  default: string;
  options: DifficultyOption[];
  /**
   * Modal SIEMPRE antes de cada inicio (memorice): el tap abre el modal sin
   * consultar la preferencia y la elección no se persiste (nadie la lee —
   * el gate no consulta pref). Sin `always` = patrón "primer inicio" de
   * serpiente/wakwak.
   */
  always?: boolean;
}

/**
 * Juegos con modos (PLAN-ACCESIBILIDAD T5, D-T5-1/D-T5-4): si el usuario no
 * eligió aún, el Home muestra el modal de dificultad ANTES de navegar. Data
 * pura (claves y opciones como strings).
 */
const DIFFICULTY_GATES: Record<string, DifficultyGate> = {
  serpiente: {
    prefKey: 'serpiente.dificultad',
    default: 'medio',
    options: [
      { value: 'facil', label: 'Fácil', hint: 'Serpiente más lenta' },
      { value: 'medio', label: 'Medio' },
      { value: 'dificil', label: 'Difícil' },
    ],
  },
  wakwak: {
    prefKey: 'wakwak.modo',
    default: 'normal',
    options: [
      { value: 'facil', label: 'Fácil', hint: 'Escenario y personajes ×2, 2 drones' },
      { value: 'normal', label: 'Normal' },
    ],
  },
  memorice: {
    prefKey: 'memorice.dificultad',
    default: 'facil',
    // D3 (PLAN-MEMORICE-DIFICULTAD): el usuario pidió el modal SIEMPRE antes
    // de cada inicio; la dificultad no se persiste (D6).
    always: true,
    options: [
      { value: 'facil', label: 'Fácil', hint: '8 pares' },
      { value: 'medio', label: 'Medio', hint: '10 pares' },
      { value: 'dificil', label: 'Difícil', hint: '12 pares' },
    ],
  },
};

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  /** Juego esperando la elección del modal (null = cerrado). */
  const [promptGame, setPromptGame] = useState<GameDefinition | null>(null);
  // Tamaño real del área de lista (onLayout): las columnas se derivan del
  // ancho medido, no de useWindowDimensions → reflow automático al
  // rotar/redimensionar (el `key={numColumns}` remonta la lista).
  // En web la lista es SIEMPRE de 1 columna (mismo comportamiento que móvil,
  // con ancho tope y centrado — ver styles.listWrapper) para que el remount
  // por `key={numColumns}` nunca dispare y el scroll sobreviva al resize.
  const { size, onLayout } = useContainerSize();
  const numColumns: 1 | 2 | 3 =
    Platform.OS === 'web' ? 1 : size ? columnsForWidth(size.width) : 1;

  // D-T5-1: el gate se lee en el TAP (no en el mount): sin pref → modal;
  // con pref → navegación directa CON el param (la run arranca ya con la
  // preferencia vigente, sin la carrera del load async del screen).
  // Gates `always` (memorice): el modal aparece en CADA tap (D3/D6) — sin
  // lookup ni persistencia.
  const openGame = (game: GameDefinition) => {
    const gate = DIFFICULTY_GATES[game.id];
    if (!gate) {
      router.push({ pathname: '/juego/[id]', params: { id: game.id } });
      return;
    }
    if (gate.always) {
      setPromptGame(game);
      return;
    }
    void preferencesRepository.get(gate.prefKey).then((raw) => {
      if (raw) {
        router.push({ pathname: '/juego/[id]', params: { id: game.id, difficulty: raw } });
        return;
      }
      setPromptGame(game);
    });
  };

  // Al elegir: persistir + navegar con el param (el screen lo aplica al reset
  // del mount — ambos juegos ya lo consumen). D-T5-2: descartar persiste el
  // default ("no vuelve a preguntar") y se queda en el Home. Los gates
  // `always` NO persisten (D6): la elección solo navega.
  const chooseDifficulty = (value: string) => {
    const game = promptGame;
    if (!game) return;
    const gate = DIFFICULTY_GATES[game.id];
    if (!gate.always) {
      void preferencesRepository.set(gate.prefKey, value);
    }
    setPromptGame(null);
    router.push({ pathname: '/juego/[id]', params: { id: game.id, difficulty: value } });
  };

  const dismissDifficulty = () => {
    const game = promptGame;
    if (game) {
      const gate = DIFFICULTY_GATES[game.id];
      if (!gate.always) {
        void preferencesRepository.set(gate.prefKey, gate.default);
      }
    }
    setPromptGame(null);
  };

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
        <Animated.View
          entering={LIST_ENTER}
          style={[styles.listWrapper, Platform.OS === 'web' && styles.listWrapperWeb]}
          onLayout={onLayout}
        >
          <FlatList
            key={numColumns}
            style={styles.listScroll}
            data={getVisibleGames()}
            keyExtractor={(game) => game.id}
            numColumns={numColumns}
            columnWrapperStyle={numColumns > 1 ? styles.column : undefined}
            contentContainerStyle={[styles.list, { paddingBottom: 24 + insets.bottom }]}
            renderItem={({ item }) => (
              <GameCard
                game={item}
                onPress={() => openGame(item)}
              />
            )}
          />
        </Animated.View>
      )}
      {promptGame ? (
        <DifficultyModal
          gameId={promptGame.id}
          visible
          options={DIFFICULTY_GATES[promptGame.id].options}
          onChoose={chooseDifficulty}
          onDismiss={dismissDifficulty}
        />
      ) : null}
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
  // Web: lista de 1 columna con ancho tope y centrada (comportamiento móvil).
  // El padding horizontal del contenedor padre ya acota a ~360px en teléfono.
  listWrapperWeb: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 600,
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
