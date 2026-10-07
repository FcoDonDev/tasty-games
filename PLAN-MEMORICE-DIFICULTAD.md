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
- **D6 — Gate `always` sin persistencia**: para memorice ni `chooseDifficulty`
  ni `dismissDifficulty` escriben en `preferencesRepository` (nadie leería la
  clave — el gate no consulta pref). Solo navegar con el param / quedarse.
- **D7 — Layout por total de cartas**: en narrow (360px) 24 cartas con 3
  columnas dejan cartas ~43×58px; con 4 columnas (6 filas) suben a ~60×80px.
  T3 evalúa `columnsForWidth(width, totalCards)` con medición y elige;
  la pantalla pasa `cards.length` (no `PAIR_COUNT * 2`) a `computeCardSize`.

## Criterios de aceptación

- [ ] Tap en card memorice del Home → modal con 3 opciones SIEMPRE (no solo
      la primera vez); "Ahora no" se queda en el Home sin persistir nada.
- [ ] Elegir nivel → partida arranca con el nº de pares correcto
      (8/10/12) y sin scroll a 360×640 (mobile-first, AGENTS D4) en los tres
      niveles; el grid de 24 cartas usa el columnado elegido en T3.
- [ ] Récords guardados bajo la clave correspondiente (`memorice`,
      `memorice-medio`, `memorice-dificil`); ScoreBoard del header consulta la
      clave de la run activa.
- [ ] "Jugar de nuevo" y restart conservan la dificultad elegida.
- [ ] Deep-link `/juego/memorice?difficulty=dificil` respeta el nivel
      (producción: param existe pero es el flujo normal del Home; E2E lo usa
      con seeds). Sin `difficulty` → `facil`.
- [ ] El primer reparto ya tiene el nivel correcto SIN re-deal visible
      (dificultad inicializada sincrónicamente desde el param).
- [ ] Suite E2E completa verde, incluidos los specs que hoy navegan Home →
      tap "Jugar Memorice" (memorice + navigation), adaptados al modal.

## Checklist de tareas

- [ ] T1. `src/games/memorice/engine/difficulty.ts` (nuevo, puro): `Difficulty`,
      `DIFFICULTIES`, `DIFFICULTY_PAIR_COUNTS = { facil: 8, medio: 10,
      dificil: 12 }`, `DIFFICULTY_LABELS`, `recordGameId(d)`,
      `parseMemoriceDifficulty(raw?)` (patrón `parseSerpienteDifficulty`).
- [ ] T2. `engine/state.ts`: `reset(seed?, difficulty?)` →
      `buildDeck(DIFFICULTY_PAIR_COUNTS[difficulty ?? 'facil'], seed)`.
      Migrar imports de `PAIR_COUNT` (queda como alias de `facil`).
- [ ] T3. `engine/layout.ts` + `__tests__/layout.test.ts`: validar grid sin
      scroll con 20 y 24 cartas; evaluar con medición `columnsForWidth(width,
      totalCards)` (4 columnas para 24 cartas en narrow → cartas ~60×80px vs
      ~43×58px con 3) y candear lo elegido; `computeCardSize` ya es genérico
      en `totalCards`.
- [ ] T4. `MemoriceScreen.tsx`: consumir `initialDifficulty` — estado de
      dificultad inicializado SINCRÓNICAMENTE (`useState(() =>
      parseMemoriceDifficulty(initialDifficulty) ?? 'facil')`, sin race de
      re-deal); deps del efecto de reset `[reset, seed, difficulty]`; pasarla
      a `reset` en mount/restart/"Jugar de nuevo"; `computeCardSize(...,
      cards.length)` (reemplaza `PAIR_COUNT * 2`); `onGameEnd` usa
      `recordGameId(difficulty)`; `onActiveGameId()` para el ScoreBoard
      (patrón `SerpienteScreen.tsx:381-397`).
- [ ] T5. `app/index.tsx`: entrada `memorice` en `DIFFICULTY_GATES` + flag
      `always: true` que salta el lookup de preferencia (D3). Al elegir →
      navegar con param `difficulty`; para gates `always`, ni elegir ni
      descartar persisten preferencia (D6).
- [ ] T6. Tests unitarios: `difficulty.test.ts` (nuevo), `state.test.ts`
      (reset por dificultad: nº de cartas), `layout.test.ts` (20/24 cartas);
      regresión deck/perf-fixtures.
- [ ] T7. E2E web:
      - Nuevo flujo Home → tap card → modal → elegir Difícil → 24 cartas;
        partida completa por dificultad con récord en la clave correcta;
        entrada directa `?difficulty=`.
      - REGRESIÓN: adaptar specs existentes que hoy navegan Home → tap
        "Jugar Memorice" y esperan el juego inmediato (rompen con el modal):
        `src/games/memorice/__e2e__/memorice.web.spec.ts:19-22` y
        `src/core/__e2e__/navigation.web.spec.ts:30-36` — elegir "Fácil" en
        el modal o pasar a deep-link `/juego/memorice`.
      - Caso responsive con `?difficulty=dificil` (24 cartas sin scroll a
        360×640) si T3 no lo cubre por unit.
- [ ] T8. Docs: `src/games/memorice/index.ts` (constante `RULES` in-app:
      "Encuentra los 8 pares…" → texto por nivel) + `README.md` + `RULES.md`
      (matriz de dificultad).
- [ ] T9. Verificación estándar: `pnpm typecheck` → `pnpm test` →
      `node scripts/e2e.mjs` (suite entera verde).

## Notas / hallazgos

- RESUELTO en revisión: `app/ajustes.tsx` solo tiene "Borrar récords"
  (`clearAll`); no lista récords por juego → las claves nuevas no exigen
  cambios allí (récords por nivel se ven en el ScoreBoard del header y las
  cards del Home con la clave base).
- El `PAIR_COUNT` exportado hoy lo consumen tests y la pantalla; mantener el
  alias evita tocar `perf-fixtures.test.ts` y `performance.web.spec.ts`
  (los escenarios perf usan 8 pares vía seeds numéricos de `deck.ts`).
- La suite E2E entra a memorice por DEEP-LINK en: `help`, `responsive`,
  `navigation` (parcial) y `performance` (`goto(url)` con seeds) — ilesos con
  el modal SIEMPRE; solo los 2 specs que tocan la card del Home requieren
  adaptación (ver T7).
- Deep-link en producción con `?difficulty=` arbitrario bypasea el modal —
  aceptable y consistente con serpiente; documentar en T8.
- Layout 24 cartas narrow: medir ambas columnadas (3 vs 4) en T3 y candear la
  elegida; `computeCardSize` clamp de altura mínima 48px ya protege el caso
  peor, pero cartas de 43×58px son pequeñas para 3ª edad (D-T targets).
