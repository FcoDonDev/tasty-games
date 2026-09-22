# PLAN-ACCESIBILIDAD — Bajar la barrera de entrada

> Estado: PLAN aprobado + revisión crítica (critical-plan-review) incorporada.
> Implementación NO iniciada.
> Orden de ejecución: T1 → T2 → T3 → T4 (desglosada en T4a-T4d) → T5. Cada
> tarea cierra con la verificación estándar verde antes de pasar a la siguiente.

## Contexto y objetivo

Bajar la barrera de entrada para jugadores con poca velocidad de reacción
(3ª edad) y poco manejo de tecnología:

1. **Serpiente** necesita niveles de dificultad y controles visibles (D-pad).
2. **Wak Wak** necesita un modo fácil con laberinto reducido (personajes y
   escenario ×2).
3. **Damas** debe ocultarse hasta implementar CPU como contrincante y mejorar
   la UI/UX multijugador.

Cubre juegos existentes y core (registro, tipos). No crea juegos nuevos.

## Decisiones de diseño (aprobadas con el usuario)

| # | Decisión | Elección | Alternativas descartadas |
|---|---|---|---|
| D1 | Récords por dificultad | **Claves separadas** (`serpiente-facil`, `serpiente-dificil`, `wakwak-facil`): sin migración de DB ni schema; la clave base (`serpiente`, `wakwak`) = modo normal/medio, retrocompatible | Columna `difficulty` en `game_records` (SCHEMA_VERSION +1) |
| D2 | Ubicación D-pad serpiente | **Ambas** (bajo el tablero —default— u overlay translúcido inferior) + **tamaño configurable S/M/XL** | Solo bajo el tablero / solo overlay |
| D3 | Wak Wak fácil | **Toggle Fácil/Normal que abarca los 8 niveles**: UN layout reducido compartido con velocidades propias por nivel en fácil | Pista fácil aparte de 1 nivel / 8 layouts distintos |
| D4 | Damas oculta | **Solo del listado del Home**: deep link `/juego/damas` sigue vivo | Ocultar también la ruta (404) |
| D5 | Aplicación de dificultad (serpiente) | **Al reiniciar**: si el usuario cambia dificultad a mitad de partida, **la partida se reinicia automáticamente** con la nueva dificultad (sin mutar el timing de `advance()` en caliente) | Aplicar en vivo a mitad de partida |
| D6 | ScoreBoard con claves separadas | **Header dinámico**: el "Mejor" del header/EndOverlay muestra el récord de la dificultad/modo ACTIVO; la card del Home muestra siempre el de normal/medio | Header fijo en normal/medio |
| D7 | ControlMode default en táctil | **`'botones'`** (D-pad visible por defecto en dispositivos táctiles, orientado a 3ª edad). Los specs E2E táctiles existentes de gestos/flotante se reescriben | Mantener 'gestos' default |
| D8 | Desbloqueo Wak Wak | **Separado por modo**: `PREF_MAX_LEVEL` (normal) + nueva clave para fácil. Default del toggle = **Normal** (protege las baselines de perf de ADR 0011) | Desbloqueo compartido |
| D9 | Modal de dificultad en primer inicio | **En el Home**: al tocar por primera vez un juego con modos (serpiente, wakwak), el Home muestra un modal pidiendo la dificultad deseada ANTES de navegar; la elección se persiste y no vuelve a preguntar. Descartar el modal = default (medio/normal) persistido | Modal dentro de cada juego / modal global de ajustes |

## Referencias (buenas prácticas, punto 2 del requerimiento)

- [Google Playables design best practices](https://developers.google.com/youtube/gaming/playables/certification/best_practices_design):
  targets táctiles **≥48dp con separación ≥8dp**, estilos por estado de botón,
  soporte de teclado para toda la navegación.
- Patrón dominante en clones de Snake web (portrait): **D-pad visible bajo el
  tablero** + swipe como modo alternativo; tamaño XL recomendado para
  dispositivos chicos o jugadores que prefieren botones (snakegame3d).
- Escritorio: teclado (flechas/WASD) ya cubierto; el D-pad no se muestra en PC.

## Hallazgos de la revisión crítica (resueltos en el plan)

- **E1/ScoreBoard**: `app/juego/[id].tsx:73` pasa el id del registro a
  `<ScoreBoard gameId={game.id}>`; con claves separadas el header mostraría
  siempre el récord de medio → T2/T4 incluyen propagar el gameId efectivo
  (prop o callback de la pantalla) y fijar la card del Home en normal (D6).
- **E2/Specs de récords**: `serpiente.web.spec.ts` y `wakwak.web.spec.ts`
  cuentan récords filtrando `gameId` literal → los specs existentes corren con
  dificultad default (sin query param → clave base) y quedan intactos; los
  specs NUEVOS de fácil filtran su clave propia.
- **E3/Seed+dificultad**: los seeds sentinelas actuales no traen dificultad →
  `SerpienteConfig.difficulty?: Difficulty` con default explícito `'medio'` en
  todos los seeds; en E2E la dificultad se pide por URL: `?seed=<x>&difficulty=`
  (parse extendido). La preferencia persistida nunca pisa el config de seed
  (mismo orden que wrap).
- **E4/validateLayout**: el validador del preview tiene pines hardcodeados al
  layout v3 19×21 y `parseLenient` valida dims exactas de módulo; además
  `BONUS_CELL` está hardcodeado en `rules.ts` (`toIndex(11,9)`) → T4a
  parametriza validador y resolución de maze (bonus/spawns/baterías) por modo.
  El plan NO reutiliza validateLayout tal cual.
- **E5/D-pad en specs**: la suite corre en Chromium desktop SIN `hasTouch` →
  si el D-pad es solo táctil, los specs táctiles usan
  `test.use({ hasTouch: true, viewport: 360×640 })` y `click()` sobre los
  botones. Detección táctil: el mismo flag ya usado por `SettingsModal`.
- **E6/E7 (decidido)**: dificultad aplica al reiniciar, y cambiarla a mitad de
  partida reinicia la partida (D5).
- **M2/baseline perf**: default del toggle wakwak = Normal (D8) — los specs
  `wakwak-active-1/8` y `wakwak-paused` comparan baselines ADR 0011 en modo
  Normal.
- **D-3/gating de preferencia**: en wakwak el modo (fácil/normal) debe
  resolverse ANTES de crear el estado del nivel 1 (el laberinto depende del
  modo); patrón `cancelled` + start diferido igual que las prefs actuales.
- **D-4/seeds wakwak**: `seed.ts` hardcodea geometría del layout v3 (fila 15,
  corral) → los seeds existentes quedan scoped a Normal; el modo Fácil usa
  seeds propios. Riesgo de sentinela en pared del layout fácil: cubierto por
  el scoping.
- **D-5/drones fácil**: fácil usa las personalidades (0,1) del corral reducido
  con `elroyThreshold: null` en toda la tabla fácil (Elroy off = aún más
  fácil). `droneChainPoints` con 2 drones: combo máx 600, se candea en tests.
- **D-7/modal**: T2 y T3 tocan `SettingsSheet.tsx` dos veces (dificultad, luego
  ubicación/tamaño D-pad). Al crecer el modal (wrap/control/anillo/dificultad/
  ubicación/tamaño) a 360×640 puede requerir scroll interno; el spec
  responsive puede candearlo.
- **M6/pwa.web.spec**: verificado que NO referencia juegos → sin cambios por T1.
  Sí se ajustan: `responsive.web.spec.ts` (tile "Jugar Damas" + posiciones en
  grilla) y se revisa `help.web.spec.ts` / test del registro.

## Tareas

### T1 — Damas oculta del listado (S, ~3 h)

- [x] `GameDefinition` (`src/core/types.ts`): campo opcional `hidden?: boolean`.
- [x] `src/games/damas/index.ts`: `hidden: true` + nota en RULES/README.
- [x] `app/index.tsx`: filtrar `GAME_REGISTRY` para el listado del Home
      (`getGameById` intacto → deep link sigue funcionando).
- [x] **Antes de editar**: verificar en `app/index.tsx` si algún breakpoint usa
      `numColumns > 1` (hueco en la grilla tras filtrar; el spec 900×800 candea
      una sola columna en web). Si hay columnas, decidir re-flow.
      → RESUELTO: web siempre numColumns=1, sin hueco posible.
- [x] Test unitario del filtro Home (hidden) — lógica nueva → exige tests.
      → `getVisibleGames()` en `game-registry.ts` (lógica pura) + test.
- [x] Specs: ajustar `responsive.web.spec.ts` (tile "Jugar Damas" + posiciones);
      revisar `help.web.spec.ts` y test del registro si cuentan juegos.
      `pwa.web.spec.ts` NO cambia (verificado).
      → help no toca Home/Jugar; navigation usa Memorice (sin cambios).
      Además `damas.web.spec.ts` "salir vuelve al Home" entraba tocando la
      card (ya no existe): se movió a deep link directo.
- [x] Specs que NO cambian: `performance.web.spec.ts` (deep link) — confirmado.

### T2 — Serpiente: niveles de dificultad (M, ~1 día)

- [x] `engine/rules.ts`: tipo `Difficulty = 'facil' | 'medio' | 'dificil'`;
      tabla de velocidad por dificultad (`DIFFICULTY_SPEEDS`); `stepMs(eaten, difficulty)`:
      - **Fácil**: inicio 180ms (≈5,5 celdas/s), -2/comida, piso 110ms.
      - **Medio**: números actuales (140 / -4 / piso 70).
      - **Difícil**: inicio 110ms, -5/comida, piso 55ms.
      `advance()` usa la dificultad del estado. + `DIFFICULTIES`, `DIFFICULTY_LABELS`
      y `recordGameId(difficulty)`.
- [x] `SerpienteConfig.difficulty?: Difficulty` (default `'medio'`), campo en
      `GameState` + store: `setDifficulty` reinicia la partida si estaba
      `playing` (D5); el selector indica el efecto.
      → Store: `startRun(seed?, difficultyParam?)` con prioridad URL >
      config del sentinela > setting; `runSeed` conservado al cambiar en
      caliente (los sentinelas sobreviven al cambio).
- [x] Seeds E2E: config de cada sentinela con dificultad explícita ('medio') +
      parse de `?difficulty=` en la URL (E3); la preferencia persistida nunca
      pisa el config de seed.
      → `parseSerpienteDifficulty()` en seed.ts; `app/juego/[id].tsx` gatea el
      param con EXPO_PUBLIC_E2E=1 y lo pasa como `initialDifficulty`.
- [x] Récords (D1+D6): gameId = `serpiente` / `serpiente-facil` /
      `serpiente-dificil` según la dificultad de la partida; header/EndOverlay
      consultan la clave activa; card del Home siempre `serpiente`.
      → `GameScreenProps.onActiveGameId` (types.ts core) + `activeGameId` en
      `app/juego/[id].tsx` alimentando `<ScoreBoard>`.
- [x] UI: selector fácil/medio/difícil en `SettingsSheet.tsx` +
      persistencia `PREF_DIFFICULTY`; dificultad visible en HUD/EndOverlay.
- [x] Specs E2E de dificultad escritos con TECLADO (flechas), no swipe ni
      botones (M4): no dependen de T3 ni de carreras de gesto.
      → `serpiente-dificultad.web.spec.ts`: récord en clave propia
      (`?seed=test-lose&difficulty=facil`) + selector/reinicio/persistencia
      (clicks sobre Ajustes, sin input de movimiento).
- [x] Specs existentes de récords intactos: corren sin `?difficulty` → clave
      base (E2).
- [x] Tests: `rules.test.ts` candea las tres tablas exactas (180/-2/110,
      140/-4/70, 110/-5/55), piso monótono, y que el piso de fácil nunca es
      menor que el de medio en todo el rango de `eaten` (M5). + store
      (`setDifficulty` reinicia/solo fija, prioridades) + seed (parse).

### T3 — Serpiente: controles visibles (M-L, ~1,5-2 días)

- [x] `ControlMode` suma `'botones'`; **default en táctil = 'botones'** (D7).
      → Con preferencia persistida manda; sin preferencia en táctil → botones.
- [x] D-pad 4 direcciones (`PressableScale`, feedback ya aprobado): targets
      ≈64px en XL (≥48dp mínimo, separación ≥8dp), `accessibilityLabel`
      estables (`serpiente-btn-arriba`, etc.); presionar encola dirección vía
      `queued`; haptics vía wrapper (`hapticSelection`).
      → `components/DPad.tsx`: targets S=48/M=56/XL=64, gap 10 entre filas y
      botones de la fila media (gap REAL entre Pressables — ver hallazgo
      del spec).
- [x] Configurable (D2): ubicación (bajo tablero / overlay translúcido) y
      tamaño (S/M/XL) en Ajustes, persistidos (`serpiente.dpadPos`,
      `serpiente.dpadSize`).
- [x] Layout D4 derivado del tamaño real medido; a 360×640 sin scroll
      (candeado por el spec).
- [x] Escritorio (no táctil): solo teclado; sin D-pad. Detección táctil = el
      flag ya usado por `SettingsModal` (E5).
- [x] Specs: los NUEVOS usan `hasTouch: true` + `click()` sobre botones (E5);
      los specs táctiles existentes de gestos/flotante se REESCRIBEN (el
      default cambió, D7). Spec que candea geometría: `boundingBox()` ≥48px y
      separación ≥8dp a 360×640 (M5).
      → El spec de swipe se reescribió sembrando la preferencia
      'gestos' vía `addInitScript` (no hay query param de control).
- [x] Tests unitarios del componente.

### T4 — Wak Wak: toggle Fácil/Normal con laberinto reducido ×2 (L, ~3 días)

Desglose en subtareas commiteables (M3) para aislar el blast radius mecánico:

- [x] **T4a — Refactor paramétrico de dims (~1 día, sin cambio de
      comportamiento)**: parametrizar dims de `maze.ts` (hoy `MAZE_COLS=19` /
      `MAZE_ROWS=21` constantes de módulo); 12 callers: `rules.ts`, `seed.ts`,
      `ai.ts`, `MazeLayer.tsx`, `WakWakScreen.tsx`, `validateLayout`/preview,
      tests. Mover a resolución por modo: `BONUS_CELL` (hardcodeado en
      `rules.ts`), `robotSpawn`, `droneSpawns`, baterías (E4). Los seeds
      existentes quedan scoped a Normal (D-4). Verde con el layout actual como
      único modo — red de seguridad para el resto.
      → Ejecutada (con refinamiento de critical-plan-review):
      `MazeData` auto-descrito (`cols/rows/bonusCell`); `mazeFor(mode)` +
      `bonusCellFor(mode)` en maze.ts (SPECS: solo 'normal' hasta T4b; 'facil'
      lanza). **El maze viaja en el estado** (`GameState.maze/mode`): step/
      moveEntity/reverseEntity/floatPos(entity, canUseDoor, maze)/
      wrappedDistance(a, b, cols)/droneSpeed/worldSnapshot/threatsOf leen
      `state.maze`; `chooseDroneDirection` recibe `maze` en `DroneDecision`.
      Minas de import-time eliminadas: `HOME_CORNERS` → `homeCorners(maze)`
      (ai.ts; alias legacy intacto) y clamp de `aheadCell` por maze.rows.
      Helpers `rowOf/colOf/toIndex/neighbor/isCorralCell/cellCenter/
      cellDistance` con parámetro opcional default-MAZE (tests intactos).
      `parseLayout(layout, expectedDrones=4)`; `parseLenient`/`openAreas3x3`/
      `validateLayout` paramétricos en dims (pines por modo → T4b).
      `SeedConfig.mode?`; los 7 sentinelas + default PINNEAN `mode:'normal'`
      (geometría fila 15; candea seed.test). `state.startRun(level, seed,
      modeParam?)` con prioridad sentinela > URL param > 'normal';
      `advanceLevel` propaga el modo (nivel 2+ de run fácil = fácil). Suite:
      524 unit + E2E 78 passed (0 cambios de comportamiento).
- [x] **T4b — Sesión de diseño del layout fácil (checkpoint con el usuario)**:
      iterar el laberinto reducido (~11×13, solo pasillos, corral sellado para
      2 drones, 2 súper, túnel) en `preview/LaberintoPreview.tsx` con un
      validador paramétrico que reúna las mismas invariantes (sin callejones,
      sin áreas 3×3, conectividad). Posible re-estimación al salir del
      checkpoint.
      → APROBADO (2b3909d + ajuste del usuario): `preview/LAB_FACIL.ts` 11×13.
      El usuario iteró el primer candidato (eliminó áreas abiertas 2×2 con
      combs verticales en la zona inferior). Cambios aprobados respecto al
      plan: **4 súper** (esquinas superior e inferior; el plan decía 2),
      spawn en el centro (8,5) con corredor completo c1..c9 y topes en los
      bordes, **chip dorado en el propio spawn (8,5)** (aparece a mitad de
      partida, cuando la celda ya está libre). `validateLayout(layout, pins?)`
      paramétrico (spawn/corredor+topes/corners/bonus/súper/drones/dims) con
      defaults = pines normal; `PINS_FACIL` + `validateLayoutEasy`. Gate
      automático: `__tests__/labFacil.test.ts` (6 invariantes). Preview
      paramétrico (dims por card, MazeStaticLayer sin constantes de módulo).
- [ ] **T4c — Velocidades, 2 drones, toggle (~1 día)**: tabla completa de
      Fácil por nivel (los 4 números de `LevelSpeeds`, `powerMs`,
      `scatterMs`/`chaseMs`, `releaseBase`/`releaseStagger`) con criterios
      medibles: ratio robot/drone ≥ 1.3 en los 8 niveles y power ≥ 1.5× el de
      Normal por nivel (M1); `elroyThreshold: null` en toda la tabla (D-5);
      drones (0,1). Toggle Fácil/Normal en el picker + persistencia; default
      Normal (D8); el toggle aplica a la PRÓXIMA run; desbloqueo separado por
      modo (D8). Gating: el modo se resuelve ANTES de crear el estado del
      nivel 1 (D-3). Modo visible en HUD/EndOverlay.
      → EN CURSO (código listo, falta E2E nuevo): `mazeFor('facil')`
      registrado (FACIL_LAYOUT en engine/maze.ts; preview re-exporta);
      `LEVELS_FACIL` con invariante M1 candea en levels.test; `levelConfig(
      level, mode)`; store: setting `mode` + `setMode` (aplica a PRÓXIMA run,
      no reinicia), prioridad sentinela > URL > setting (defaultConfig SIN
      pin — solo sentinelas + perf fixtures pinnean normal); renderer por
      modo: `MazeLayer` props maze/bonusCell, `EntitiesLayer` droneCount
      dinámico (2 fácil / 4 normal), cellSize/board/spawnPopup derivados del
      maze activo; toggle de modo en el picker (chips Fácil/Normal, labels
      `wakwak-modo-normal/facil`); HUD muestra "FÁCIL" (`wakwak-modo`);
      EndOverlay suffix "· FÁCIL"; `recordGameId(game.mode)` en endRun;
      desbloqueo `wakwak.maxLevel`/`wakwak.maxLevelFacil` según modo de la
      run; `onActiveGameId` en cada cambio de game.mode; `?difficulty=facil`
      por URL (gate E2E) → modeParam del reset inicial. Visual verificado
      (360×640: tablero ~×1.8 celdas, 2 drones, HUD FÁCIL, toggle persiste).
- [ ] **T4d — Récords, seeds, E2E (~0,5-1 día)**: `wakwak-facil` en `onGameEnd`
      (D1+D6); seeds sentinelas nuevos para el layout fácil; E2E fácil (nivel 1
      fácil ganado/perdido vía seed); ajustar contadores de récords si algún
      spec pasa a correr en fácil (los existentes quedan en Normal).

### T5 — Modal de dificultad en el Home, primer inicio (M, ~0,5-1 día)

- [ ] Lógica de gate en `app/index.tsx`: al tocar la card de un juego con
      modos (serpiente, wakwak), si no hay preferencia persistida
      (`PREF_DIFFICULTY` / clave de modo wakwak) mostrar modal ANTES de
      navegar; al elegir → persistir + navegar pasando la dificultad como
      param (evita el race de preferencia async al montar la pantalla, D-3).
- [ ] Descartar el modal sin elegir = default persistido (medio / normal):
      no vuelve a preguntar. Ya elegido → navegación directa; el cambio sigue
      disponible en Ajustes (serpiente) y en el picker (wakwak).
- [ ] Modal con `PressableScale` + `overlayAnimation` (patrón de los modales
      de los juegos), targets grandes (público 3ª edad), `accessibilityLabel`
      estables (`modal-dificultad-home`, `elegir-dificultad-facil`, etc.).
- [ ] E2E: el gate se salta si la URL/navegación lleva dificultad explícita;
      verificar specs existentes que navegan Home→serpiente/wakwak (el modal
      inesperado podría romperlos si asumen navegación directa).
- [ ] Tests unitarios del gate (sin preferencia → modal; con preferencia →
      navega directo).

### T6 — Verificación estándar (por tarea y al cierre)

- [ ] `pnpm typecheck` → `pnpm test` → `node scripts/e2e.mjs` (suite entera
      verde).
- [ ] Verificación visual puntual en dev server (viewport 360×640): D-pad
      S/M/XL y overlay; tamaño del laberinto fácil; selector de dificultad;
      modal de ajustes crecido.
- [ ] Docs al cierre: README/RULES de serpiente, wakwak y damas; ROADMAP (CPU
      damas queda como pendiente), ARCHITECTURE/UI-UX si aplica.

## Notas / hallazgos

(completar durante la implementación)

- **T1 ejecutada**: `getVisibleGames()` vive en `game-registry.ts` (no en el
  Home) para que el filtro sea lógica pura testeable sin render. `navigation.web.spec.ts`
  y `help.web.spec.ts` no referencian la card de Damas (sin cambios). Único
  E2E adicional al previsto: `damas.web.spec.ts` "salir vuelve al Home" usaba
  la card del Home como entrada → deep link directo. Suite: 73 passed.
- **T2 ejecutada**: prioridad de dificultad implementada como
  URL > config sentinela > setting (`startRun(seed?, difficultyParam?)`);
  `setDifficulty` conserva `runSeed` para que el cambio en caliente no
  descarte un sentinela. Hallazgo de UX: cambiar dificultad mientras Ajustes
  tenía la run auto-pausada dejaba `autoPausedRef` pegado → al cerrar el
  modal se re-pausaba la partida ya reiniciada; reconciliado en
  `changeDifficulty` (`autoPausedRef = false`). Suite E2E: 75 passed.
- **T3 ejecutada**: gap del D-pad — el margen en el hijo interno de
  PressableScale no separa los boxes de los `Pressable` wrappers (boundingBox
  incluía el gap): reestructurado a filas con `gap` REAL entre botones; el
  spec de geometría mide los Pressables, no los inner Views. El modal de
  Ajustes quedó largo (dificultad + wrap + control + D-pad) → scroll interno
  con "Listo" fijo. `fix-wrap` (robo-jump) falló 4× y pasó luego: flake de
  timing confirmado con stash (falla también en el commit T2 con árbol limpio)
  — módulo no tocado en la sesión, sin corrección (AGENTS.md). Suite E2E:
  78 passed.
- **T3 revisión visual (4516864)**: el D-pad de filas sueltas se veía
  descuadrado → rediseñado como **cruz contigua sobre grilla 3×3** (brazos +
  conector central decorativo no táctil): la alineación sale de la estructura,
  no de offsets. Tamaños reducidos a pedido: S=40/M=48/XL=56. El spec de
  geometría ahora candea la simetría del plus (brazos verticales mismo centro
  X; horizontales mismo centro Y y simétricos a ±1 celda del centro — ojo:
  en un plus el brazo lateral NO comparte centro X con el vertical). Verificado
  con screenshots (bajo tablero y overlay XL) borrados al terminar.
  `fix-wrap` persiste fallando en aislado incluso con árbol limpio (T2):
  investigar por separado.
- **T4a ejecutada**: blast radius mayor al previsto (revisión crítica): el
  maze no podía ir por "default args sueltos" — `neighbor` lee grid/tunnelRow/
  corral, `HOME_CORNERS` era constante evaluada en import-time (fila 19 fuera
  de grilla en 11×13) y `aheadCell` clampaba con 19 hardcodeado. Decisión:
  `GameState.maze` (referencia compartida, no copia) es la única fuente de
  geometría del tick. `BONUS_CELL` sigue exportándose (render + tests) pero
  el pickup usa `bonusCellFor(state.mode)`. Verificado: wakwak NO persiste
  partida a mitad (solo récords/prefs) → restaurar estado con maze viejo no
  aplica. Pendiente T4c (renderer): `MazeLayer` prop `maze`/`bonusCell`,
  `EntitiesLayer` con N drones dinámicos (hoy hardcodea 4 → fantasmas en
  fácil), cellSize/spawnPopup derivados del maze activo, contrato
  `WorldSnapshot` ("siempre 4 drones").
  `fix-wrap` (robo-jump) flake CONFIRMADO: falla y pasa alternando en el mismo
  árbol limpio (falló 4×, pasó en 2 corridas completas) — investigar aparte.
- **T4c hallazgos**: (1) `defaultConfig` de wakwak NO debe pinnear
  `mode:'normal'` — la prioridad sentinela > URL > setting necesita el default
  ABIERTO al setting (solo sentinelas y perf fixtures pinnean; los perf por
  baselines ADR 0011). Candea seed.test. (2) Dev server web necesita
  `EXPO_PUBLIC_E2E=1` inline para que `?seed`/`?difficulty` lleguen al juego
  (el gate vive en `[id].tsx`) + `--clear` si el bundle quedó raro: sin la
  env, el modo fácil de URL no aplica y el juego arranca normal (me confundió
  en la verificación visual). AGENTS.md menciona un `.env` con EXPO_PUBLIC_E2E
  que NO existe en este worktree: crearlo inline en el comando, no como
  archivo. (3) `droneChainPoints` con 2 drones: cadena 1 = 200, cadena 2 =
  400, suma máx por power = 600 (SCORE_DRONE_MAX 3200 queda intocado).
  (4) BUG post-T4c detectado por el usuario: `defaultConfig` clavaba
  `batteryCells/superCells = MAZE.*` (índices en espacio 19-wide) mientras
  `createGameState` resolvía el maze por modo → en fácil las baterías se
  pintaban sobre muros (índices normal re-proyectados a la grilla 11×13) y
  solo aparecían los 2 súper normales con índice <143. FIX: `SeedConfig`
  hace opcionales las listas y `createGameState` las toma del maze del modo
  resuelto salvo override explícito (sentinelas); `defaultConfig` ya no las
  clava (regresión en rules.test: pickups ⊆ path del maze fácil, 4 súper).
  Verificado en app viva: 0 dots sobre muros, 4 súper, 2 drones, HUD FÁCIL.

- Cubicación previa: total ~5-5,5 días; con la revisión, T3 sube a ~2 días
  (reescribir specs táctiles por el default 'botones') y T4 a ~3 días
  (BONUS_CELL/validador paramétrico no estaban en la cubicación inicial).
  T5 (modal Home) suma ~0,5-1 día → **total revisado ~6-6,5 días**.
- Home verificado: web SIEMPRE numColumns=1 (`app/index.tsx:29-30`) → filtrar
  damas (T1) no puede dejar hueco en grilla; riesgo D-1 descartado.
- El renderer de wakwak ya es paramétrico en `cellSize` → con ~11×13 celdas el
  escalado ×2 sale casi gratis en render; el costo real está en el engine.
- T2 y T3 comparten `SettingsSheet.tsx` y `SerpienteScreen.tsx` (D-7): tocar el
  modal en orden, sin mezclar ambos cambios en un commit.

## Migración de hallazgos al cierre (destinos)

- Lección técnica RN/Reanimated/Jest/Playwright → `docs/GOTCHAS.md`.
- Decisión transversal (D1+D6 récords por clave; D2/D7 controles; D8
  desbloqueo por modo) → ADR nuevo en `docs/adr/`.
- Detalles por juego → `src/games/<id>/README.md`.
- CPU damas + UI/UX multijugador → `docs/ROADMAP.md`.
