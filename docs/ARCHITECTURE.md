# Arquitectura — tasty-games

App de juegos 2D simples (Web + Android) con Expo SDK 57 / Expo Router /
React Native 0.86 / TypeScript. Este documento describe cómo está construido
el proyecto y por qué. Las decisiones con su justificación completa viven como
ADRs en [`docs/adr/`](adr/README.md).

## Stack

| Capa | Tecnología | Rol |
|---|---|---|
| Framework | Expo SDK 57 + Expo Router | Un código para Web y Android, navegación por archivos |
| Render | Views nativos + react-native-reanimated 4 | UI interactiva, animaciones en UI thread (ADR 0001) |
| Gestos | react-native-gesture-handler | Drag & drop de cartas/fichas |
| Estado | zustand | Store liviano, mismo código en ambas plataformas |
| Persistencia | expo-sqlite (nativo) / localStorage (web) | Récords + preferencias (ADR 0002) |
| Test unitario | Jest (jest-expo) + @testing-library/react-native | Reglas y componentes |
| Test E2E | Playwright (web) / Maestro (Android, pendiente) | Flujos de juego end-to-end (ADR 0003) |
| Deploy web | Docker + nginx → GCP Cloud Run | Build estático servido con SPA fallback |

## Contrato de juego

Todo juego nuevo implementa un `GameDefinition` (`src/core/types.ts`) para registrarse en la pantalla principal sin tocar código ajeno:

- **GameDefinition**: `id`, `name`, `description`, `thumbnail?`, `minDurationHint?`, `rules?` (condensado de texto plano para la ayuda in-app — la fuente completa de reglas es el `RULES.md` del juego), `Component` (pantalla del juego).
- **GameScreenProps** (props del `Component`): `onExit()`, `onGameEnd(result)` e `initialSeed?` (solo E2E, ver ADR 0006).
- **GameResult**: `gameId`, `won`, `score?`, `durationMs`, `finishedAt` (ISO 8601).

## Registro de juegos

`src/core/game-registry.ts` exporta `GAME_REGISTRY` y `getGameById(id)`. La Home solo itera el registro y renderiza `Component`; no conoce reglas de ningún juego.

**Agregar un juego** = crear `src/games/<id>/` con un `GameDefinition` + una línea en el registro. Cero cambios en Home, router u otros juegos.

**Regla dura: nada bajo `src/games/<a>/` importa de `src/games/<b>/`**; la única dependencia permitida hacia afuera es `src/core/`. Esto garantiza que agregar el juego #4 no implique tocar ni entender el código de los anteriores. Lo compartido vive en `src/core/` (ej: `mulberry32` está duplicado en cada juego que lo necesita en vez de extraerse a core).

## Estado: dos niveles separados

- **Estado de app** (`src/core/stores/useAppStore.ts`): preferencias globales (dark mode, sonido) con hidratación desde `preferencesRepository`.
- **Estado de juego** (`src/games/<id>/engine/state.ts`): store Zustand propio de cada juego, **no exportado fuera de su carpeta**. El engine de un juego no puede acoplarse al de otro.

Los engines (`rules.ts`, `deck.ts`, `board.ts`, `layout.ts`) son **funciones puras sin UI**: ahí vive el riesgo y ahí van los tests. La lógica de timing que depende del reloj (ej: timeout del mismatch en memorice) vive en la pantalla, no en el store, para que los tests sean deterministas.

**Juegos en tiempo real (wakwak, [ADR 0009](adr/0009-wakwak-motor-agnostico.md)):** el núcleo expone `advance(state, dtMs)` por ticks fijos y un **puerto de presentación** (`renderer/types.ts`) que los adaptadores de render implementan — solo `renderer/` importa la librería de render; el loop rAF vive en el adaptador y la lógica sigue siendo pura y testeable. Referencia para cualquier futuro juego continuo.

## Persistencia dual y migraciones

- Repositorios en `src/core/db/repositories/` en pares `*.ts` (expo-sqlite) / `*.web.ts` (localStorage) con la misma interfaz async — **siempre editar las dos** (ADR 0002).
- El único lugar que escribe récords es `app/juego/[id].tsx` vía `recordsRepository`; los juegos llaman `onGameEnd(result)` y nunca importan expo-sqlite.
- **Estado en curso de una partida**: `gameStateRepository` (blob JSON por `gameId`, tabla `game_state` — migración v2). Cada juego define su blob en su `engine/persistence.ts` puro (serialize/parse defensivo); el auto-resume de solitario funciona así (ADR 0008).
- **Migraciones SQLite**: nunca editar el DDL existente en `src/core/db/schema.ts`. Sumar `SCHEMA_VERSION` +1 y agregar un array de statements a `MIGRATIONS[]`; `client.ts` aplica pendientes vía `PRAGMA user_version`.

## UI compartida (`src/core/ui/`)

Los juegos no importan librerías de animación/gestos directamente: consumen los wrappers de core.

| Módulo | Rol |
|---|---|
| `GameHeader.tsx` | Header estándar de juego: Salir (`salir-<id>`) / Reiniciar con confirmación (`reiniciar-<id>`) / Ayuda (`ayuda-<id>`); `center` lo aporta cada juego (turno/movimientos), `left` para acciones propias (undo/ajustes de solitario) |
| `HelpModal.tsx` | Modal genérico de ayuda (`modal-ayuda-<id>`) con `GameDefinition.rules`; usado por GameHeader y por el contenedor `[id].tsx` |
| `ScoreBoard.tsx` | Récord; variante `compact` (una línea, `record-<id>`) en GameCard y en la chromeBar del contenedor |
| `PressableScale.tsx` | Botón con feedback de press (CSS transition 120 ms / scale 0.97), `hitSlop` + `pressRetentionOffset` configurables |
| `overlayAnimation.ts` | Builders `FadeIn`/`FadeOut` perezosos-memoizados para overlays (220 ms entrada / 150 ms salida) |
| `useContainerSize.ts` | Medición real del contenedor con `onLayout` (guard anti re-render); alimenta los `computeLayout` (ADR 0004) |
| `drag/useDraggable.ts` | Patrón de drag & drop reutilizable (ver abajo) |
| `haptics.ts` | Wrapper de expo-haptics; ningún juego importa expo-haptics directamente |
| `sound.ts` | Wrapper de expo-audio (mismo patrón que haptics): preload perezoso de efectos, API `soundCardMove/Drop/Invalid/GameWin()`, gated por toggle global (`useAppStore.soundOn`) y por plataforma. Ningún juego importa expo-audio directamente |

## Drag & drop (`src/core/ui/drag/useDraggable.ts`)

Patrón reutilizable consumido por solitario y damas:

- `Gesture.Pan` con `activeOffsetX/Y ±6` para no robar taps ni scroll.
- Shared values (`tx/ty`) escritas en **`onUpdate`** con `.set()` (worklet puro, compiler-safe): el arrastre sigue el dedo en UI thread; React no re-renderiza por frame. Los callbacks JS solo disparan en start/end — nunca `setState` ni `scheduleOnRN` dentro de `onUpdate`.
- **Velocity handoff**: `onEnd` reporta `velocityX/velocityY`; settle (drop válido) y snap-back (drop inválido) usan `withSpring` con esa velocity. 
- `cancelAnimation` en `onStart` permite interrumpir un spring en vuelo; `.onFinalize(!success)` resetea el gesto cancelado (segundo dedo/llamada).
- **Doble tap opcional** (`onDoubleTap` en `DragCallbacks`): `Gesture.Tap().numberOfTaps(2)` compuesto con el Pan (`maxDelay(500)` explícito — el default nativo de 200 ms hace fallar el doble tap humano). Con `activeOffsetX/Y ±6`, el tap no activa el drag y viceversa; consumidor actual: auto-move de solitario (damas no lo pasa → comportamiento intacto).
- JS↔worklet con `scheduleOnRN` (de `react-native-worklets`) — no `runOnJS` (deprecado en Reanimated 4).
- Haptics: un haptic al commit del drop (no al terminar la animación); `scheduleOnRN(hapticFn)` desde worklets; solo nativo (`EXPO_OS !== 'web'`).
- **Layout como fuente única**: cada engine tiene un `layout.ts` puro que calcula geometría (rects/posiciones) e hit-testing (`hitTestPile` / `hitTestSquare`) desde el tamaño medido del contenedor. Render (posición absoluta) y validación del drop consumen las mismas funciones — nada de `measure()` async.

## Testing

- **Unit** (`__tests__/` junto al código, patrón `**/__tests__/**/*.test.@(ts|tsx)`): prioridad en los engines puros — es donde vive el riesgo (validez de movimientos, fin de juego, score, hit-testing).
- **E2E web** (`src/games/<id>/__e2e__/*.web.spec.ts` + specs core en `src/core/__e2e__/`): Playwright, orquestado por `scripts/e2e.mjs` (export → serve :4173 → tests → cleanup). Escenarios deterministas vía seeds sentinelas (ADR 0006).
- **E2E Android** (Maestro, `__e2e__/*.android.yaml`): pendiente de Fase E —  ver `docs/ROADMAP.md`.
- Todos los componentes interactivos llevan `accessibilityLabel` estable: son los selectores de Playwright y Maestro.

## Rutas y pantallas

```
app/
  _layout.tsx     # GestureHandlerRootView + SafeAreaProvider + ThemeProvider + hydrate
  index.tsx       # Home: lista GAME_REGISTRY como cards (nativo: columnas según ancho REAL medido, ADR 0004; web: 1 columna centrada con ancho tope; + engranaje a ajustes)
  ajustes.tsx     # Dark mode + borrar récords
  juego/[id].tsx  # Contenedor: monta Component del juego; ÚNICO escritor de récords
```

El contenedor `[id].tsx` resuelve el juego por id, reenvía `seed` solo con
`EXPO_PUBLIC_E2E=1`, y muestra chromeBar con título, récord compacto y ayuda.
Los botones de salida usan `exitToHome` (`src/core/navigation.ts`): vuelve
atrás si hay stack; si la pantalla se abrió directo (deep link/recarga), hace
`router.replace('/')` — "Salir" siempre funciona.

## Build y deploy web

- Build release: `CI=1 pnpm exec expo export --platform web` (genera `dist/`,
  gitignored).
- Deploy: `Dockerfile` multi-stage (build con `node:22-alpine` + pnpm 11 via
  corepack → runtime `nginx:1.27-alpine` en :8080) con SPA fallback
  (`try_files $uri $uri/ /index.html`, requerido por expo-router: sin él,
  recargar `/juego/<id>` da 404), cache inmutable para `/_expo/static/` y
  `/assets/`, gzip. Cloud Build conectado al repo: push → build → Cloud Run.
- El export productivo **no** define `EXPO_PUBLIC_E2E` (ADR 0006).

## Documentación relacionada

- [`docs/adr/`](adr/README.md) — decisiones de diseño transversales.
- [`docs/UI-UX.md`](UI-UX.md) — gate de animación, reglas de layout y motion.
- [`docs/GOTCHAS.md`](GOTCHAS.md) — lecciones técnicas del toolchain.
- [`docs/ROADMAP.md`](ROADMAP.md) — trabajo pendiente (Fase E, deudas).
- `src/games/<id>/README.md` — documentación técnica por juego.
- `src/games/<id>/RULES.md` — reglas implementadas (para QA).
- `AGENTS.md` — convenciones del repo para agentes (procesos, comandos).
