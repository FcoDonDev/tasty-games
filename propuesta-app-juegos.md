# Propuesta técnica — App de juegos simples (Web + Android)

## 1. Stack definido

| Capa | Tecnología | Rol |
|---|---|---|
| Framework base | Expo (SDK 54+, Expo Router) | Un solo código para Web y Android, navegación por archivos |
| Render 2D | `@shopify/react-native-skia` | Canvas GPU-accelerated para cartas, tableros y fichas |
| Animación | `react-native-reanimated` | Loop de frames (`useFrameCallback`) y transiciones fluidas |
| Gestos | `react-native-gesture-handler` | Drag & drop de cartas/fichas |
| Estado | `zustand` | Store liviano, mismo código en Web y Android |
| Persistencia | `expo-sqlite` | Récords por juego + preferencias del usuario |
| Testing unitario | Jest (`jest-expo`) + `@testing-library/react-native` | Lógica de reglas + componentes |
| Testing funcional | Maestro (Android) + Playwright (Web) | Flujos de juego end-to-end por plataforma |

Plataformas objetivo: **Web y Android**, mismo bundle (`expo start --web` / build nativo Android), misma UI y misma lógica de negocio.

---

## 2. Contrato común de juego

Todo juego nuevo debe implementar esta interfaz para poder registrarse en la pantalla principal sin tocar código ajeno:

```ts
// src/core/types.ts

export interface GameResult {
  gameId: string;
  won: boolean;
  score?: number;
  durationMs: number;
  finishedAt: string; // ISO 8601
}

export interface GameScreenProps {
  onExit: () => void;
  onGameEnd: (result: GameResult) => void;
}

export interface GameDefinition {
  id: string;                              // 'solitario' | 'damas' | 'memorice' | ...
  name: string;                            // Nombre visible
  description: string;                     // Descripción corta para la card en Home
  thumbnail: number;                       // require('./assets/thumb.png')
  minDurationHint?: string;                // ej: "5-10 min", solo informativo
  Component: React.ComponentType<GameScreenProps>;
}
```

Cada juego exporta un único `GameDefinition` desde su `index.ts`. La pantalla principal no conoce reglas de ningún juego — solo itera el registro y renderiza `Component`.

```ts
// src/core/game-registry.ts
import solitario from '@/games/solitario';
import damas from '@/games/damas';
import memorice from '@/games/memorice';

export const GAME_REGISTRY: GameDefinition[] = [memorice, solitario, damas];

export function getGameById(id: string) {
  return GAME_REGISTRY.find((g) => g.id === id);
}
```

Agregar un juego nuevo = crear su carpeta bajo `src/games/`, implementar el contrato, y sumar una línea al registro. Cero cambios en Home, en el router o en otros juegos.

---

## 3. Estado (Zustand)

Dos niveles de estado, deliberadamente separados:

- **Estado de app** (`src/core/stores/`): preferencias globales (modo oscuro) y récords cross-juego. Vive en `src/core/`, lo usa la Home y las pantallas de settings.
- **Estado de juego** (`src/games/<juego>/engine/state.ts`): store Zustand *propio* de cada juego, no exportado fuera de su carpeta. Así el motor de damas no puede filtrarse ni acoplarse al de solitario.

```ts
// src/core/stores/useAppStore.ts
import { create } from 'zustand';

interface AppState {
  darkMode: boolean;
  toggleDarkMode: () => void;
  hydrate: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  darkMode: false,
  toggleDarkMode: () => set((s) => {
    const next = !s.darkMode;
    preferencesRepository.set('dark_mode', next ? '1' : '0');
    return { darkMode: next };
  }),
  hydrate: async () => {
    const value = await preferencesRepository.get('dark_mode');
    set({ darkMode: value === '1' });
  },
}));
```

```ts
// src/games/memorice/engine/state.ts — ejemplo de store propio de un juego
import { create } from 'zustand';

interface MemoriceState {
  cards: CardModel[];
  flipped: string[];
  matched: string[];
  moves: number;
  flipCard: (id: string) => void;
  reset: () => void;
}

export const useMemoriceStore = create<MemoriceState>((set, get) => ({
  cards: [],
  flipped: [],
  matched: [],
  moves: 0,
  flipCard: (id) => { /* lógica de matching */ },
  reset: () => { /* baraja nuevo mazo */ },
}));
```

---

## 4. Persistencia (Expo SQLite) — Fase 1 mínima

Dos tablas, sin ORM, acceso vía repositorios para que ningún juego escriba SQL directamente.

```sql
-- src/core/db/schema.ts (DDL)
CREATE TABLE IF NOT EXISTS game_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  won INTEGER NOT NULL,          -- 0/1
  score INTEGER,
  duration_ms INTEGER NOT NULL,
  finished_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

```ts
// src/core/db/repositories/recordsRepository.ts
export const recordsRepository = {
  async save(result: GameResult) { /* INSERT INTO game_records ... */ },
  async bestFor(gameId: string) { /* SELECT ... ORDER BY score DESC LIMIT 1 */ },
  async historyFor(gameId: string) { /* SELECT ... WHERE game_id = ? */ },
};

// src/core/db/repositories/preferencesRepository.ts
export const preferencesRepository = {
  async get(key: string) { /* SELECT value FROM preferences WHERE key = ? */ },
  async set(key: string, value: string) { /* INSERT OR REPLACE ... */ },
};
```

Cada juego, al terminar, llama `onGameEnd(result)` (parte del contrato) — la pantalla contenedora es la única que toca `recordsRepository`. El juego nunca importa `expo-sqlite` directamente.

Deliberadamente fuera de fase 1 (no bloquear el MVP): historial detallado de partidas, sync remoto, perfiles de usuario, estadísticas avanzadas.

---

## 5. Estructura de carpetas

```
juegos-app/
├── app/                              # Expo Router — solo navegación, sin lógica de juego
│   ├── _layout.tsx                   # ThemeProvider + hidratación de stores
│   ├── index.tsx                     # Home: lista GAME_REGISTRY como cards
│   └── juego/
│       └── [id].tsx                  # Resuelve el juego por id y monta su Component
│
├── src/
│   ├── core/                         # Todo lo que NO pertenece a un juego específico
│   │   ├── types.ts                  # Contrato GameDefinition / GameScreenProps
│   │   ├── game-registry.ts
│   │   ├── stores/
│   │   │   └── useAppStore.ts
│   │   ├── db/
│   │   │   ├── schema.ts
│   │   │   ├── client.ts             # apertura de conexión + migraciones
│   │   │   └── repositories/
│   │   │       ├── recordsRepository.ts
│   │   │       └── preferencesRepository.ts
│   │   └── ui/                       # Componentes compartidos entre juegos
│   │       ├── GameCard.tsx          # Card de la Home
│   │       ├── ScoreBoard.tsx
│   │       └── ThemeProvider.tsx
│   │
│   └── games/
│       ├── memorice/
│       │   ├── index.ts              # export default GameDefinition
│       │   ├── MemoriceScreen.tsx
│       │   ├── engine/
│       │   │   ├── state.ts          # store Zustand propio
│       │   │   └── deck.ts           # generación/shuffle de cartas
│       │   ├── components/
│       │   │   └── Card.tsx          # render con Skia
│       │   ├── __tests__/
│       │   │   ├── deck.test.ts
│       │   │   └── state.test.ts
│       │   ├── __e2e__/
│       │   │   ├── memorice.android.yaml   # flujo Maestro
│       │   │   └── memorice.web.spec.ts    # flujo Playwright
│       │   ├── README.md             # doc técnica de implementación
│       │   └── RULES.md              # reglas del juego
│       │
│       ├── solitario/
│       │   ├── index.ts
│       │   ├── SolitarioScreen.tsx
│       │   ├── engine/
│       │   │   ├── state.ts
│       │   │   ├── rules.ts          # movimientos válidos, victoria
│       │   │   └── deck.ts
│       │   ├── components/
│       │   │   ├── Pile.tsx
│       │   │   └── Card.tsx
│       │   ├── __tests__/
│       │   │   ├── rules.test.ts
│       │   │   └── deck.test.ts
│       │   ├── __e2e__/
│       │   ├── README.md
│       │   └── RULES.md
│       │
│       └── damas/
│           ├── index.ts
│           ├── DamasScreen.tsx
│           ├── engine/
│           │   ├── state.ts
│           │   ├── rules.ts          # movimientos legales, capturas, coronación
│           │   └── board.ts
│           ├── components/
│           │   ├── Board.tsx
│           │   └── Piece.tsx
│           ├── __tests__/
│           │   ├── rules.test.ts
│           │   └── board.test.ts
│           ├── __e2e__/
│           ├── README.md
│           └── RULES.md
│
├── assets/
├── app.json
├── package.json
└── tsconfig.json
```

Regla dura: **nada bajo `src/games/<juego>/` importa de otro `src/games/<otro-juego>/`.** La única dependencia permitida hacia afuera es `src/core/`. Esto es lo que garantiza que agregar el juego #4 no implique tocar ni entender el código de los tres anteriores.

---

## 6. Documentación por juego

Cada carpeta de juego incluye dos documentos, con roles distintos:

- **`README.md`** (técnico): estructura del engine, forma en que fluye el estado, decisiones de render con Skia, limitaciones conocidas, cómo correr sus tests. Dirigido a quien mantiene el código.
- **`RULES.md`** (reglas del juego): reglas tal como se implementaron (útil para QA y para eventualmente mostrarlas en un modal de ayuda in-app). Dirigido a quien valida comportamiento, no a quien lee código.

Mantenerlos separados evita el problema típico de READMEs que mezclan "cómo está construido" con "cómo se juega" y terminan sin servir bien a ninguno de los dos propósitos.

---

## 7. Testing

**Unitario** (Jest + `jest-expo`):
- Prioridad en `engine/rules.ts` y `engine/deck.ts` — son funciones puras, sin UI, y es donde vive el riesgo real (ej: ¿es válido este movimiento en damas?, ¿detecta correctamente el fin del juego en solitario?).
- Componentes de UI se testean solo donde hay lógica condicional relevante (`@testing-library/react-native`), no por cobertura vacía.

**Funcional / E2E**, un flujo por juego, duplicado por plataforma dado que "misma experiencia" hay que verificarlo en ambas:
- **Android**: Maestro (`__e2e__/*.android.yaml`) — flujos declarativos, corre contra el build nativo o Expo Go.
- **Web**: Playwright (`__e2e__/*.web.spec.ts`) — corre contra `expo export` / `expo start --web`.

Ambos flujos cubren el mismo caso de uso (ej. "completar una partida de memorice de principio a fin y verificar que el récord se guardó"), pero con el runner correspondiente a cada plataforma — no existe hoy una herramienta única que corra igual en ambos targets sin fricción, así que se acepta la duplicación de flujo antes que forzar un solo runner a cubrir lo que no fue diseñado para cubrir.

---

## 8. Orden de implementación sugerido

1. **Esqueleto + registro + Home** (sin juegos reales) — valida routing, tema, hidratación de stores y conexión SQLite.
2. **Memorice** primero — es el motor más simple (matching de pares, sin reglas de movimiento), sirve para validar todo el pipeline (Skia + gestos + Zustand + SQLite + tests) de punta a punta con el menor riesgo.
3. **Solitario** — introduce drag & drop real y reglas de movimiento con `rules.ts`.
4. **Damas** — introduce lógica de turnos, capturas y tablero con estado más complejo.

Cada juego nuevo, al construirse sobre el contrato ya validado en el paso 1, debería tomar una fracción del tiempo del anterior.
