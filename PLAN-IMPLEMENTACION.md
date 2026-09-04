# Plan de implementación — App de juegos simples (Web + Android)

> Basado en `propuesta-app-juegos.md`. Gestor de paquetes: **pnpm**.
> Estado de ejecución marcado con checkboxes. Completadas: Fase 0 y Fase 1 (merge a main). Siguiente: Fase 2 — Solitario.

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

### Fase 2 — Solitario (Klondike) (~4–6 días)

- [ ] `engine/deck.ts` + reparto (7 tableau, stock, waste, 4 foundations)
- [ ] `engine/rules.ts` (puro): validez tableau↔foundation↔tableau, alternancia color, secuencias, volteo, reciclaje stock, victoria, sin-movimientos
- [ ] `engine/state.ts`: `moveCard`, `drawStock`, undo (snapshots)
- [ ] **Drag & drop real** (patrón reutilizable para damas): `Gesture.Pan` + shared values; drop-zones por layout calculado (evitar `measure()` async); snap-back si inválido; `runOnJS` para validar
- [ ] `rules.test.ts` exhaustivo (mayor riesgo del proyecto)
- [ ] E2E acotado: movimiento legal, intento ilegal con snap-back, victoria forzada vía flag de test (victoria orgánica queda cubierta por unit tests)
- [ ] README + RULES

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
