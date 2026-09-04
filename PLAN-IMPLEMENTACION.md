# Plan de implementación — App de juegos simples (Web + Android)

> Basado en `propuesta-app-juegos.md`. Gestor de paquetes: **pnpm**.
> Estado de ejecución marcado con checkboxes. Completadas: Fase 0, Fase 1 y Fase 2 (merge a main). Siguiente: Fase 3 — Damas.

---

## 0. Decisiones de diseño (desviaciones justificadas respecto a la propuesta)

| # | Decisión | Justificación |
|---|---|---|
| D1 | **Render: Views nativos + Reanimated + gesture-handler.** Skia queda fuera del MVP. Si luego se quieren efectos (partículas al ganar, fondos), se agrega aislado en `src/core/ui/effects/` | Para UI interactiva (tap, drag & drop), cada carta/ficha como nodo nativo da hit-testing, accesibilidad y soporte web gratis. Skia habría exigido CanvasKit WASM de 2.9 MB en web, entry point custom (`index.web.tsx` + `LoadSkiaWeb`), bugs conocidos con tree-shaking (`SkiaViewApi is not defined`, issues #3345/#2914 de Shopify/react-native-skia) y el límite de 16 contextos WebGL/página |
| D2 | **Persistencia: interfaz de repositorios con 2 implementaciones** — `*.ts` (expo-sqlite, nativo) y `*.web.ts` (localStorage, resuelto por Metro automáticamente). Sin COOP/COEP ni WASM en Metro | expo-sqlite web está en alpha y exige headers `Cross-Origin-Opener-Policy`/`Embedder-Policy` + SharedArrayBuffer. Para récords y preferencias, localStorage es suficiente y estable. La propuesta ya aísla el acceso a datos |
| D3 | **E2E Android contra dev build** (`npx expo run:android`), no Expo Go | Maestro con Expo Go requiere `openLink: exp://...` y servidor Metro corriendo → flujos frágiles. Dev build = `launchApp` normal, determinista. Reanimated 4 + `react-native-worklets` funcionan más fiable en dev build |

**Corrección al contrato de la propuesta:** `bestFor()` ordena `score DESC` (más = mejor), pero memorice premia *menos* movimientos. **Regla:** cada juego define `score` donde más es mejor (memorice: `score = 100 - moves` o similar). Se fija en la Fase 1.

**Vacío no resuelto en la propuesta:** damas necesita oponente. Asumido: **2 jugadores locales en el mismo dispositivo** para el MVP; IA simple (greedy) opcional en Fase 4. Pendiente de confirmación.

---

## 1. Fases y checklist

### Fase 0 — Bootstrap y esqueleto (~2–3 días)

**Setup**
- [x] Verificar entorno: Node 22+, pnpm (⚠️ Java/ADB no detectados — requeridos solo para dev build Android; instalar Temurin 17 + Android SDK antes del E2E Android de Fase 1)
- [x] Scaffold Expo (TypeScript + Expo Router) en la raíz del repo — **SDK 57** (RN 0.86, React 19.2, Reanimated 4.5.1 + worklets 0.10.1 incluidos en template; cumple "SDK 54+")
- [x] `.npmrc` con `node-linker=hoisted` (requerido por Metro con pnpm)
- [x] Deps instaladas vía `pnpm exec expo install` (matriz de compatibilidad respetada): reanimated 4.5.1, worklets 0.10.1, gesture-handler 2.32.0, expo-sqlite 57.0.2, zustand 5.0.15
- [x] Dev deps: jest 29.7, jest-expo 57.0.5, @testing-library/react-native 14.0.1, @types/jest (Playwright se instala en Fase 1)
- [x] `tsconfig.json`: paths `@/*` → `./src/*` + `types: ["jest"]`

**Estructura y código base**
- [x] `src/core/types.ts` — contrato (thumbnail opcional + convención score documentada)
- [x] `src/core/game-registry.ts` — registro vacío + `getGameById`
- [x] `src/core/stores/useAppStore.ts` — darkMode + hydrate (+ flag `hydrated`)
- [x] `src/core/db/schema.ts` — DDL + `PRAGMA user_version` como mecanismo de migración
- [x] `src/core/db/client.ts` — apertura + migraciones secuenciales
- [x] `src/core/db/repositories/recordsRepository.ts` + `.web.ts` (sqlite / localStorage)
- [x] `src/core/db/repositories/preferencesRepository.ts` + `.web.ts`
- [x] `src/core/ui/theme.ts` + `ThemeProvider.tsx`, `GameCard.tsx`, `ScoreBoard.tsx`
- [x] `app/_layout.tsx` (GestureHandlerRootView + ThemeProvider + hydrate), `app/index.tsx` (Home con empty state), `app/juego/[id].tsx` (contenedor: `onExit` → `router.back()`, `onGameEnd` → `recordsRepository.save`)
- [x] `app.json`: name/slug/scheme tasty-games, package `com.franc.tastygames`, tema oscuro base, plugin expo-sqlite
- [x] Test de humo Jest verde (`src/core/__tests__/game-registry.test.ts`)

**Criterios de aceptación**
- [x] `pnpm typecheck` verde
- [x] `pnpm test` verde (3/3)
- [x] Web compila y sirve: `pnpm exec expo export --platform web` genera `/`, `/juego/[id]`, `/_sitemap`, `/+not-found`; bundle 2.2 MB **sin WASM** (D2 confirmado); sitio estático responde 200
- [ ] Dark mode persiste tras recargar (verificado en web; falta confirmar en dev build Android)
- [ ] Récords: insertar/leer en Android (sqlite) — requiere dev build (Java/ADB pendientes)
- [x] Récords: leer en web (localStorage) — implementations listas, verificación E2E en Fase 1

---

### Fase 1 — Memorice end-to-end (~2–3 días) — valida todo el pipeline ✅ COMPLETADA

- [x] `src/games/memorice/engine/deck.ts` — mazo de pares + Fisher-Yates con seed opcional (determinismo para tests)
- [x] `engine/state.ts` — store Zustand propio (flip, matching, moves, victoria, reset); cronómetro por delta `Date.now()` (no ticks)
- [x] Convención score: `score = max(0, 100 - moves)` (más = mejor)
- [x] UI: grid responsive (4 col / 3 en <420px), `Card.tsx` con flip en dos fases (0°→90°→0°, evita espejo de rotateY en web), tap
- [x] Modal de victoria + `onGameEnd(result)` (único reporte vía `hasReportedRef`)
- [x] Tests unit: `deck.test.ts`, `state.test.ts` (20/20 verdes)
- [x] E2E web (`memorice.web.spec.ts`, Playwright): partida 8 pares → modal + récord persistido + ScoreBoard tras reload; flujo salir al Home — 2/2 specs verdes (partida completa ~32 s)
- [x] Regla transversal: todo interactivo con `notas` de accesibilidad estables (`carta-N` con `exact:true`, `modal-victoria-memorice`, `salir-memorice`, `jugar-de-nuevo-memorice`)
- [x] `README.md` (técnico) + `RULES.md` (reglas para QA)
- [x] Tooling E2E: `scripts/e2e.mjs` (orquestador único cross-platform: export visible → serve → playwright → cleanup), scripts `pnpm e2e:web|headed|ui`, reporter HTML + traces
- [~] E2E Android (`memorice.android.yaml`, Maestro vs dev build) → **movido a la sección "Fase E — E2E Android" al final del plan**

Notas aprendidas durante la fase (para no repetir):
- Playwright: clicks sobre botones `disabled` se difieren hasta que se habilitan —
  en juegos con estados bloqueantes, el spec debe esperar el estado antes de clickear.
- Reanimated en Jest requiere mocks propios (`__mocks__/`): el mock oficial de
  reanimated inicializa worklets nativo y falla en Node.
- Windows: nunca `spawn('pnpm')` sin `shell` (pnpm.cmd) — preferir resolver el
  binario y lanzarlo con `process.execPath`.

---

### Fase 2 — Solitario (Klondike) (~5–6 días) ✅ COMPLETADA

#### Decisiones de la fase (aprobadas con usuario)

| # | Decisión | Detalle |
|---|---|---|
| S1 | **Draw 1 / Draw 3 configurable** | Setting in-game (modal de ajustes con engranaje en el header), persistido en `preferencesRepository` (claves `solitario.drawMode`, `solitario.undo`). Aplica al **próximo reparto** (el cambio a mitad de partida no rebaraja) |
| S2 | **Score = f(tiempo, movimientos, undos)** | `score = max(0, 1000 − 5·moves − floor(segundos/2) − 25·undos)`. Ganada típica (~120 moves, ~5 min) ≈ 250 pts. Función pura `scoreFor(moves, durationMs, undos)` en `engine/rules.ts`, testeada |
| S3 | **Undo** | Default: **off** (botón oculto). Setting on = ilimitado vía snapshots inmutables en el store; cada undo se cuenta y penaliza el score (S2) |
| S4 | **Victoria forzada E2E** | `deal(seed)` acepta sentinel `TEST_WIN_SEED` que devuelve estado artesanal (3 palos completos en foundations + 4º palo sin el As, que queda top de un tableau → un solo drag gana). Activado con query param `?seed=test-win`, reenviado a la pantalla solo si `process.env.EXPO_PUBLIC_E2E === '1'` |
| S5 | **Solo se reportan victorias** vía `onGameEnd` (paridad con memorice). Sin-movimientos muestra modal de derrota sin récord; `hasAnyMove()` igualmente testeada |
| S6 | `mulberry32` se **duplica** en `solitario/engine/deck.ts` (regla dura: nada bajo `src/games/<a>/` importa de `src/games/<b>/`). Extraerlo a `src/core/` queda como refactor opcional posterior |

#### Estructura de archivos

```
src/games/solitario/
  index.ts                      # GameDefinition + registro
  SolitarioScreen.tsx           # pantalla, header (salir/undo/ajustes), modales
  components/
    PlayingCard.tsx             # carta visual (palo/rango/dorso), a11y label estable
    Pile.tsx                    # pila (stock/waste/foundation/tableau) con "fan" vertical
    SettingsModal.tsx           # draw 1|3 + undo on/off
  engine/
    deck.ts                     # Suit/Rank/Card, mazo 52, mulberry32, deal(seed), TEST_WIN_SEED
    rules.ts                    # PURO: validez de movimientos, hasAnyMove, isWon, scoreFor
    state.ts                    # store Zustand: piles, draw/recycle, moveCards, undo (snapshots)
    layout.ts                   # PURO: rects de cada pila dado tamaño contenedor + hit-test
  __tests__/
    deck.test.ts
    rules.test.ts               # el más exhaustivo del proyecto (≥25 casos)
    state.test.ts
    layout.test.ts              # hit-testing de rects
  __e2e__/
    solitario.web.spec.ts
src/core/ui/drag/
  useDraggable.ts               # patrón reutilizable Gesture.Pan + shared values (base para damas)
```

Cambios fuera de la carpeta del juego (mínimos):
- [x] `src/core/game-registry.ts`: +1 línea
- [x] `src/core/types.ts`: `GameScreenProps` gana `initialSeed?: string` (opcional, retrocompatible)
- [x] `app/juego/[id].tsx`: reenvía `seed` de `useLocalSearchParams` solo con `EXPO_PUBLIC_E2E=1` (S4)
- [x] `scripts/e2e.mjs`: exportar con `EXPO_PUBLIC_E2E=1` (+ `--clear`, ver notas aprendidas)

#### Diseño técnico

- **Engine puro**: `Card { suit: '♠'|'♥'|'♦'|'♣', rank: 1..13, id, faceUp }`; piles tipadas `{ tableau: Card[][], foundations: Card[][], stock, waste }`. `rules.ts`: `canDropOnTableau` (desc. + color alternado, K a columna vacía), `canDropOnFoundation` (mismo palo, asc.), `legalSequences(col)`, `hasAnyMove(state, drawMode)` (incluye draw/recycle), `isWon(state)`.
- **state.ts**: `drawStock()` (respeta drawMode; recicla waste→stock al agotarse), `moveCards(from, to, count)`, flip implícito del top de tableau tras mover, `undo()` (snapshot push en cada acción solo si undo habilitado), `reset(seed?, settings)`.
- **Drag & drop**: `layout.ts` calcula **matemáticamente** los rects de las 13 pilas desde el tamaño del contenedor (`onLayout`, síncrono) — nada de `measure()` async. Render (posición absoluta) e hit-test consumen la misma función → fuente única de verdad, testeable en Jest. `useDraggable.ts`: `Gesture.Pan` con `activeOffsetX/Y`, shared values `tx/ty/active`; en `onEnd` `runOnJS` → hit-test → si válido `moveCards`, si inválido snap-back (`withTiming` a 0). La subsecuencia arrastrada se mueve como grupo (un solo animated view).
- **Responsive**: tamaño de carta derivado del ancho; en <420px solapamiento mayor en tableau (mobile primero).

#### Desglose de tareas (orden de ejecución)

**Día 1 — engine puro de reglas**
- [x] `engine/deck.ts`: tipos, mazo 52, `mulberry32`, `deal(seed)` → 7 tableau (col i = i+1 cartas, top faceUp), stock 24, waste, 4 foundations; sentinels `TEST_WIN_SEED` + `TEST_MOVE_SEED` (S4) y `parseSeed()`
- [x] `engine/rules.ts` (puro): validez tableau↔foundation↔tableau, alternancia color, secuencias (`isValidSequence`, `canPickUp`), `hasAnyMove`, `isWon`, `scoreFor` (S2)
- [x] `__tests__/rules.test.ts` exhaustivo — **mayor riesgo del proyecto** (fixtures: alternancia, K a vacío, foundation→tableau, sin-movimientos, victoria, score con undos)
- [x] Criterio: `pnpm test -- rules` verde — 32 casos

**Día 2 — store y registro**
- [x] `engine/state.ts`: `drawStock`/reciclaje, `moveCards`, undo snapshots, score, `reset(settings?)` determinista + `__tests__/state.test.ts`
- [x] `index.ts` + línea en `game-registry.ts`; typecheck + web exporta

**Día 3 — layout y render absoluto**
- [x] `engine/layout.ts` (rects + `columnExtent` + `cardPosition` + `hitTestPile`) + `__tests__/layout.test.ts`
- [x] `components/PlayingCard.tsx`, `Pile.tsx`, render absoluto de las 13 pilas

**Día 4 — drag & drop (riesgo técnico)**
- [x] `src/core/ui/drag/useDraggable.ts`: patrón reutilizable (`Gesture.Pan` + shared values + `runOnJS`)
- [x] Wiring en pantalla: drag válido → `moveCards`; inválido → snap-back animado (`withTiming` 160 ms); flip de tableau; drag de subsecuencia como grupo (shared values `tx/ty` de la pantalla + `dragKey`)
- [x] Drop point = origen de la carta + traslación del gesto (coords del tablero) — sin conversión a coords de pantalla

**Día 5 — settings, modales y documentación**
- [x] `SettingsModal.tsx` (draw 1|3, undo on/off) con persistencia vía `preferencesRepository` (`solitario.drawMode`, `solitario.undo`; drawMode aplica al próximo reparto, undo inmediato)
- [x] Modales victoria/derrota; `onGameEnd` con patrón `hasReportedRef`; cronómetro por delta `Date.now()`
- [x] README.md (técnico) + RULES.md (QA); labels a11y: `solitario-card-<id>`, `solitario-tableau-<i>`, `solitario-foundation-<i>`, `solitario-stock`, `solitario-waste`, `modal-victoria-solitario`, `modal-derrota-solitario`, `salir-solitario`, `solitario-undo`, `solitario-ajustes`

**Día 6 — E2E web**
- [x] Gate `EXPO_PUBLIC_E2E=1` en `e2e.mjs` y reenvío de `seed` en `[id].tsx` + `initialSeed` en `types.ts`
- [x] `__e2e__/solitario.web.spec.ts` (Playwright, drag con `page.mouse` down → move escalonado → up):
  1. Movimiento legal (A♠ → foundation) con seed `test-move` — ✓
  2. Intento ilegal → snap-back (A♠ vuelve a la waste, moves sin cambiar) — ✓
  3. `?seed=test-win` → un drag (K♣) → modal victoria → récord en `localStorage` → ScoreBoard tras reload — ✓
  4. Salir al Home — ✓

#### Verificación final de la fase

- [x] `pnpm typecheck` verde · `pnpm test` verde (89/89, incl. regresión memorice) · `CI=1 expo export --platform web` OK · `pnpm e2e:web` 5/5 specs (3 de solitario + 2 de memorice)

#### Notas aprendidas durante la fase (para no repetir)

- **Cache de Metro ignora `EXPO_PUBLIC_*` en export:** exportar con la env var tras haber
  exportado sin ella sirve transforms cacheados con la variable doblada a `undefined`
  (`initialSeed:void 0`). Solución: `expo export --clear` en `scripts/e2e.mjs`.
- **Servidor huérfano en :4173 corrompe el E2E:** un `serve` manual olvidado hace que
  `e2e.mjs` "reutilice" un `dist/` viejo (síntoma: cambios recientes no aparecen en los
  specs). Detenerlo por PID — ver sección "Procesos en background" en AGENTS.md.
- **Stock como Pressable:** la carta top del stock se renderiza DENTRO del Pressable con
  `pointerEvents="none"`; como hermana absoluta bloquearía el tap (hit-testing nativo).
- TypeScript rechaza caracteres unicode (♠) como texto JSX directo — usar `{'♠'}`.

#### Riesgos específicos de la fase

| Riesgo | Mitigación |
|---|---|
| Pan gesture en web intercepta scroll/click | `activeOffsetX/Y` ±10; drag solo en cartas arrastrables; prototipo web el día 4 antes de pulir UI |
| `runOnJS` + worklets en web (primera vez en el repo) | Hook mínimo y probado aislado antes de integrar a la pantalla |
| Hit-test desincronizado con render | Render e hit-test consumen `layout.ts` (fuente única, testeada) |
| Seed de victoria forzada frágil | Estado artesanal fijo, no depende del PRNG/shuffle |

---

### Fase 2b — Ajustes post-Feedback (fan + UX de drag) (~½ día) ✅ COMPLETADA

Feedback de usuario tras el merge de Fase 2: (1) no se ven las cartas "debajo" en el
tableau (solo el top), (2) el drag funciona pero sin experiencia (sin lift, sin feedback
de targets, drop "teletransportado", snap-back rígido).

#### Ajuste 1 — Fan del tableau (bug de render)

- Causa raíz: en `Pile.tsx`, `firstRendered` calculaba cartas visibles como
  `waste ? 3 : 1` — el tableau solo renderizaba el top. Los offsets de `layout.ts`
  (`faceDownOffset`/`faceUpOffset`) existen pero las cartas debajo no se pintaban.
- [x] `Pile.tsx`: `firstRendered` por tipo — tableau → 0 (todas), waste → últimas 3,
      foundation → solo top. `zIndex: index` ya garantiza el apilado correcto.

#### Ajuste 2 — Experiencia drag & drop (solo capa de presentación; engine/ sin cambios)

Decisión: **solo resaltar targets válidos** (inválidos sin cambio visual); specs E2E
ajustados sin asserts de estilos mid-drag (lo visual se verifica manualmente).

- [x] **Lift** (`PileCard`): `useSharedValue` de escala → `withSpring(1.05)` al activar,
      `withSpring(1)` al soltar + sombra estática condicional a `dragActive`
- [x] **Highlight de targets válidos** (`SolitarioScreen` + `Pile`): en drag start,
      precomputar `validTargets: Set<string>` con `canDropOnTableau`/`canDropOnFoundation`
      contra las 7 columnas + 4 foundations (cero cómputo por frame); slots válidos con
      borde `theme.primary` + glow suave
- [x] **Settle animado en drop válido** (`handleDragEnd`): commit `moveCards` →
      `tx/ty = posiciónVisual − posiciónFinal` → `withTiming(0, ~120ms)` con `dragKey`
      retenido hasta terminar. La carta glisa del punto de suelte a su asiento (sin
      salto cuando el drop cae a mitad de columna)
- [x] **Snap-back con spring**: `withSpring` en vez de `withTiming`

#### Ajuste 3 — Spec E2E

- [x] Tras drop válido: `waitForTimeout(300)` antes de medir bounding boxes (settle 120 ms)
- [x] Assertion de fan: reparto aleatorio → count de `solitario-card-*` ≥ 29 (28 tableau + 1 stock)
- [x] Los 3 specs existentes mantienen su lógica

#### Verificación

- [x] `pnpm typecheck` verde · `pnpm test` 89/89 (sin cambios en engine) · `pnpm e2e:web` 5/5 · verificación visual con captura (fan correcto)

---

### Fase 3 — Damas (~4–6 días)

- [ ] `engine/board.ts`: tablero 8×8, índices 0..63, peón/dama
- [ ] `engine/rules.ts`: movimientos diagonales, capturas obligatorias, multi-salto, coronación, fin de juego
- [ ] `engine/state.ts`: turnos, selección, movimientos legales resaltados
- [ ] UI: tablero grid de Views, tap-seleccionar/tap-mover (MVP 2 jugadores locales)
- [ ] `rules.test.ts` con fixtures (captura obligatoria, multi-salto, coronación, fin)
- [ ] E2E: partida corta con movimientos fijos hasta captura y fin
- [ ] README + RULES

---

### Fase 4 — Pulido y release (~2–3 días)

- [ ] Settings: dark mode + borrar récords (confirmación)
- [ ] ScoreBoard en Home (mejor récord por juego)
- [ ] Modal de ayuda in-app con reglas
- [ ] Release web: `pnpm expo export --platform web` + deploy estático
- [ ] Release Android: `eas build -p android` (preview APK / producción AAB); probar release build
- [ ] CI: GitHub Actions (job web Playwright; job Android opcional con Maestro Cloud)

---

## 2. Riesgos y mitigaciones

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Mismatch Reanimated 4 / `react-native-worklets` | Media | Instalar solo con `pnpm expo install`; dev build por defecto (D3) |
| Drag & drop con gesture-handler en web (pointer events, scroll) | Media | Prototipar en Memorice antes de Solitario; `activeOffsetX/Y` |
| Detección de victoria/sin-movimientos mal implementada | Media | Engines 100% puros + tests con fixtures |
| Timer impreciso (background) | Baja | Delta `Date.now()`, no ticks acumulados |
| Evolución de schema SQLite | Baja | `PRAGMA user_version` + migraciones secuenciales desde Fase 0 |
| Java/ADB ausentes para dev build Android | Alta (entorno actual) | Instalar Temurin 17 + Android SDK antes de Fase 1 E2E Android |

## 3. Nota crítica sobre estimaciones

El doc de la propuesta afirma "cada juego tomará una fracción del anterior". **Falso en la práctica**: el contrato reduce el costo de integración, pero Solitario introduce drag & drop (mayor riesgo técnico) y Damas reglas de turno complejas. Total estimado: **~14–21 días**.

## 4. Diferencias con la propuesta (para actualizarla)

1. Skia eliminado del stack MVP (D1)
2. Persistencia: sqlite nativo + `.web.ts` localStorage (D2)
3. E2E Android sobre dev build (D3)
4. `score` normalizado (más = mejor)
5. Damas MVP = 2 jugadores locales; IA opcional (pendiente confirmación)
6. `PRAGMA user_version` para migraciones

---

## Fase E — E2E Android (post-fases, al cierre del proyecto)

⚠️ Requiere entorno con Java 17 + Android SDK/ADB (no disponibles al inicio del
proyecto). Toda la validación E2E Android se concentra acá, una vez completadas
las fases 2–4.

- [ ] Instalar Temurin 17 + Android SDK; `pnpm exec expo run:android` (dev build)
- [ ] Dark mode persiste tras recargar (dev build Android) — pendiente desde Fase 0
- [ ] Récords: insertar/leer en Android (expo-sqlite) — verificar DDL + `PRAGMA user_version`
- [ ] `memorice.android.yaml` (Maestro): partida completa → modal + récord
- [ ] `solitario.android.yaml`: movimiento legal, ilegal con snap-back, victoria forzada
- [ ] `damas.android.yaml`: partida corta hasta captura y fin
- [ ] Maestro Cloud o emulador en CI (opcional)
