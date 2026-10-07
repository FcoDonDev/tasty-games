# PLAN — Dificultades en Memorice

## Contexto

Memorice hoy es un juego único: 8 pares fijos (`PAIR_COUNT = 8` en
`src/games/memorice/engine/state.ts`), score `100 - moves` y récords bajo la
clave `memorice`. El repo ya tiene infraestructura transversal de dificultad
(PLAN-ACCESIBILIDAD, serpiente/wakwak):

- Modal genérico `src/core/ui/DifficultyModal.tsx`, mostrado por el Home
  (`app/index.tsx`) vía el mapa `DIFFICULTY_GATES` — pero SOLO la primera vez
  (persiste la preferencia y no vuelve a preguntar).
- `GameScreenProps.initialDifficulty` y `onActiveGameId` ya definidos en
  `src/core/types.ts`; `app/juego/[id].tsx` propaga el param `difficulty` SIEMPRE.
- Patrón `recordGameId()`: claves de récord separadas por dificultad
  (`serpiente` = medio, `serpiente-facil`, `serpiente-dificil`; `wakwak` =
  normal, `wakwak-facil`).

## Requerimiento

3 niveles de dificultad en memorice con un modal de selección que aparece
**SIEMPRE** antes de cada inicio (cada tap en la card del Home), no solo la
primera vez.

## Decisiones de diseño (aprobadas con el usuario)

- **D1 — Knob de dificultad**: nº de pares. Fácil 8 (juego actual), Medio 10,
  Difícil 12 (`MEMORICE_SYMBOLS` tiene 12 símbolos, alcanza).
- **D2 — Récords**: claves separadas vía `recordGameId()` (patrón serpiente):
  `memorice` = fácil (retrocompatible con récords existentes),
  `memorice-medio`, `memorice-dificil`. Score sigue `100 - moves`, comparable
  solo dentro de cada clave. Sin migración de DB (los récords son filas
  claveadas por `gameId`; las claves nuevas aparecen solas).
- **D3 — Modal SIEMPRE**: cada tap en la card de memorice del Home abre el
  `DifficultyModal` sin consultar preferencia persistida. Deep-link/E2E entra
  directo con `?difficulty=` (canal ya existente). "Jugar de nuevo" y el
  restart del header repiten la dificultad de la run en curso.
- **D4 — "Ahora no"**: se queda en el Home (consistente con el comportamiento
  actual del modal para serpiente/wakwak). Sin persistir preferencia.
- **D5 — Default**: `facil` (el nivel actual de 8 pares).

## Criterios de aceptación

- [ ] Tap en card memorice del Home → modal con 3 opciones SIEMPRE (no solo
      la primera vez).
- [ ] Elegir nivel → partida arranca con el nº de pares correcto
      (8/10/12) y sin scroll a 360×640 (D4 responsive).
- [ ] Récords guardados bajo la clave correspondiente (`memorice`,
      `memorice-medio`, `memorice-dificil`); ScoreBoard del header consulta la
      clave de la run activa.
- [ ] "Jugar de nuevo" y restart conservan la dificultad elegida.
- [ ] Deep-link `/juego/memorice?difficulty=dificil` respeta el nivel
      (producción: param existe pero es el flujo normal del Home; E2E lo usa
      con seeds).
- [ ] `pnpm typecheck` + `pnpm test` + `node scripts/e2e.mjs` verdes.

## Checklist de tareas

- [ ] T1. `src/games/memorice/engine/difficulty.ts` (nuevo, puro): `Difficulty`,
      `DIFFICULTIES`, `DIFFICULTY_PAIR_COUNTS = { facil: 8, medio: 10,
      dificil: 12 }`, `DIFFICULTY_LABELS`, `recordGameId(d)`,
      `parseMemoriceDifficulty(raw?)` (patrón `parseSerpienteDifficulty`).
- [ ] T2. `engine/state.ts`: `reset(seed?, difficulty?)` →
      `buildDeck(DIFFICULTY_PAIR_COUNTS[difficulty ?? 'facil'], seed)`.
      Migrar imports de `PAIR_COUNT` (queda como alias de `facil`).
- [ ] T3. `engine/layout.ts` + `__tests__/layout.test.ts`: validar grid sin
      scroll con 20 y 24 cartas (narrow 3 col → 7/8 filas);
      `computeCardSize` ya es genérico en `totalCards`.
- [ ] T4. `MemoriceScreen.tsx`: consumir `initialDifficulty` (parse) + estado
      de dificultad de la run; pasarla a `reset` en mount/restart/"Jugar de
      nuevo"; `onGameEnd` usa `recordGameId(difficulty)`; `onActiveGameId()`
      para el ScoreBoard (patrón `SerpienteScreen.tsx:381-397`).
- [ ] T5. `app/index.tsx`: entrada `memorice` en `DIFFICULTY_GATES` + flag
      `always: true` que salta el lookup de preferencia (D3). Al elegir →
      navegar con param `difficulty`. Sin persistencia.
- [ ] T6. Tests unitarios: `difficulty.test.ts` (nuevo), `state.test.ts`
      (reset por dificultad: nº de cartas), `layout.test.ts` (20/24 cartas);
      regresión deck/perf-fixtures.
- [ ] T7. E2E web (`src/games/memorice/__e2e__/memorice.web.spec.ts`):
      Home → tap card → modal → elegir Difícil → 24 cartas; partida completa
      por dificultad con récord en la clave correcta; entrada directa
      `?difficulty=`.
- [ ] T8. Docs: `src/games/memorice/README.md` + `RULES.md` (matriz de
      dificultad).
- [ ] T9. Verificación estándar: `pnpm typecheck` → `pnpm test` →
      `node scripts/e2e.mjs` (suite entera verde).

## Notas / hallazgos

- `app/ajustes.tsx` lista récords: verificar que muestre (o ignore
  ordenadamente) las claves nuevas — revisar cómo maneja hoy
  `serpiente-facil` (pendiente al llegar a T4/T9).
- El `PAIR_COUNT` exportado hoy lo consumen tests y la pantalla; mantener el
  alias evita tocar `perf-fixtures.test.ts` y `performance.web.spec.ts`.
- `columnsForWidth` narrow (360px) = 3 columnas: 24 cartas → 8 filas; las
  cartas salen más chicas pero `computeCardSize` deriva del alto disponible
  y candea mínimo 48px. Verificar visualmente en T3/T9.
