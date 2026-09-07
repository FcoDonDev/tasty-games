# PLAN — Home responsive, persistencia de partida (solitario) y navegación back

Estado: en curso. Un PLAN activo por requerimiento; se elimina en el commit de cierre.

## Contexto

Tres correcciones reportadas por el usuario:

1. **Home**: en web vista desde el celular solo quedan visibles 2 tarjetas y la
   tercera no es accesible. Además, se pide que las tarjetas se reordenen de
   forma automática (reflow al rotar/redimensionar).
2. **Solitario**: la partida se reinicia automáticamente al salir y entrar.
   Se requiere persistencia del "estado actual".
3. **Rutas**: si se ingresa directamente a un juego (deep link / recarga web),
   el botón "Volver" (← Salir) no funciona.

## Diagnóstico

### 1. Home (`app/index.tsx`)

- `numColumns` deriva de `useWindowDimensions` con umbral `width < 380` —
  contradice el ADR 0004 (medición real con `useContainerSize`).
- Con viewport ≥380px quedan 2 columnas: la 3ª tarjeta cae en una segunda fila
  que requiere scroll interno del `FlatList`, que no funciona en web móvil
  (queda inaccesible). El spec `responsive.web.spec.ts` solo candea que la
  *página* no scrollea, no que las tarjetas sean alcanzables.

### 2. Solitario (`src/games/solitario/engine/state.ts` + `SolitarioScreen.tsx`)

- Store Zustand puro en memoria: el effect de mount siempre llama `reset()` →
  reparto nuevo en cada entrada a la pantalla.

### 3. Rutas / botón "Volver"

- `router.back()` en 3 lugares: `app/juego/[id].tsx:36` (juego no encontrado),
  `app/juego/[id].tsx:67` (`onExit`) y `app/ajustes.tsx:33`.
- Entrando directo a `/juego/solitario` el stack tiene un solo screen y
  `back()` no lleva a ningún lado (web: sin historial previo).

## Decisiones de diseño (aprobadas con el usuario)

| Decisión | Elección |
|---|---|
| Dónde persistir el estado | **Nuevo `gameStateRepository`** (par dual expo-sqlite + localStorage, tabla `game_state`) → requiere migración `SCHEMA_VERSION` 1→2 |
| Comportamiento al reingresar | **Auto-resume**: retoma exactamente donde estaba, sin preguntar. Se descarta al ganar, perder (sin movimientos) o reiniciar manualmente |
| Historial de undo | **No persistir** (guardado chico ~2KB); tras restaurar, undo disponible desde el próximo movimiento |
| Layout del home | **Columnas derivadas del ancho REAL medido** (`useContainerSize`, ADR 0004): 1 col `<480px`, 2 cols `≥480px`, 3 cols `≥1024px` |

## Fases y checklist

Orden de ejecución. Verificación estándar (typecheck → test → e2e) cierra cada fase.

### Fase 1 — Back navigation (rutas)

- [x] Helper `exitToHome(router)` en `src/core/navigation.ts`: `router.canGoBack() ? router.back() : router.replace('/')`.
- [x] Aplicar en los 3 puntos: `onExit` de `juego/[id]`, pantalla "Juego no encontrado", botón volver de `ajustes`.
- [x] Spec E2E web (`src/core/__e2e__/navigation.web.spec.ts`): deep link a juego → salir → home; juego inexistente → volver → home; navegación normal sale → home.

### Fase 2 — Home responsive con reflow automático

- [x] `app/index.tsx`: columnas derivadas del ancho REAL medido con `useContainerSize` (helper puro `columnsForWidth` en `src/core/ui/responsiveColumns.ts`: 1 col `<480`, 2 cols `≥480`, 3 cols `≥1024`); `key={numColumns}` remonta y reordena al rotar/redimensionar.
- [x] Scroll interno corregido: `FlatList` con `style={{ flex: 1 }}` directo.
- [x] `responsive.web.spec.ts`: 3ª tarjeta (damas) alcanzable con scroll interno a 360×640 (la página sigue sin scrollear) + reflow a 2 columnas en viewport 900×800 (misma fila, x distinto).

### Fase 3 — Persistencia de partida (solitario)

- [x] Persistencia dual: `gameStateRepository.ts` (expo-sqlite) + `gameStateRepository.web.ts` (localStorage), interfaz async `get(gameId)` / `set(gameId, json)` / `clear(gameId)`.
- [x] Migración: `SCHEMA_VERSION` 1→2, `MIGRATIONS[1]` = `CREATE TABLE IF NOT EXISTS game_state (game_id TEXT PRIMARY KEY, state TEXT NOT NULL)`. Sin tocar DDL existente.
- [x] `engine/persistence.ts` (puro, testeable): `serializeSolitarioState` / `parseSolitarioState` con validación defensiva (sin history ni finishedAt/stuck; esos se recalculan con `endFlags`).
- [x] Store: acción `restore(saved)` que monta el estado guardado + recalcula flags; historial vacío tras restore.
- [x] `SolitarioScreen`: mount → si hay `initialSeed` (E2E) reparto fresco + `clear()`; si no, restaurar si existe estado válido. Save con `subscribe` + debounce 300ms (omite estado virgen y terminales). Clear al ganar/perder/reiniciar.
- [x] Tests unitarios: round-trip serialize/parse, JSON corrupto/forma inválida → degrada a reparto nuevo, migración v2, restore recalcula `stuck`, repositorio web (round-trip/clear/sin localStorage).
- [x] Spec E2E extra: partida en curso restaurada tras recargar (contador `Movimientos: 1` sobrevive el reload).

### Verificación estándar (por fase)

- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `node scripts/e2e.mjs`

## Notas / hallazgos

- Fase 1: el proyecto Playwright no tiene `hasTouch` → `locator.tap()` falla
  con "page does not support tap"; los specs deben usar `.click()`
  (candidato a `docs/GOTCHAS.md` en el cierre).
- Fase 1: expo-router 57 no exporta el tipo `Router`; se deriva con
  `ReturnType<typeof useRouter>` (`AppRouter` en `src/core/navigation.ts`).
- Fase 2: la causa del scroll roto fue el `FlatList` sin constraint de alto
  propio — el wrapper `flex: 1` no alcanza en RN-web; el ScrollView necesita
  `style={{ flex: 1 }}` directo (candidato a `docs/GOTCHAS.md` en el cierre).
- Fase 3: el blob guardado no incluye `history` ni `finishedAt`/`stuck`; el
  restore recalcula los flags con `endFlags` y el undo queda disponible desde
  el próximo movimiento. Los seeds E2E siempre fuerzan reparto fresco y
  limpian el guardado (el canal de alteración del reparto sigue cerrado).
