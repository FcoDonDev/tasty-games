# PLAN-DOODLE-JUMP

Estado: **remediación implementada (T11-T16 verdes); pendiente playtest de
cierre (T17) y migración de hallazgos (T10).**
Rama: `feat/doodle-jump` (creada desde `main` @ `0d15f3b`).

## 1. Contexto y objetivo

Incorporar **Doodle Jump** como nuevo juego de la colección: platformer
arcade vertical endless donde "The Doodler" salta sobre plataformas
procedurales ascendiendo lo más posible. Referencia: el original de Lima
Sky (2009) — Wikipedia, Fandom (Doodle Jump Wiki) y clones web consultados
(sept. 2026).

El repo ya tiene dos precedentes técnicos directos para este género:

- **serpiente / wakwak**: arcade con loop continuo → engine puro con
  `advance(game, dtMs)`, store zustand con acumulador de fracciones
  (`tickAccumMs`), loop rAF en la pantalla, stats de tick para métricas
  (ADR 0011), seeds sentinelas E2E.
- **solitario / damas**: drag & drop con el patrón de
  `src/core/ui/drag/useDraggable.ts` (Pan + shared values, `scheduleOnRN`).

**Divergencia clave con los precedentes**: serpiente/wakwak avanzan en
pasos discretos y publican el estado por paso; Doodle Jump es física
continua → cambia CADA frame. La arquitectura de publicación debe
rediseñarse (D8), no copiarse tal cual.

## 2. Decisiones de diseño (aprobadas con el usuario, sept. 2026)

| # | Aspecto | Decisión | Alternativas descartadas |
|---|---|---|---|
| D1 | Alcance v1 | **Completo**: plataformas verde/azul/marrón + springs + propeller hat + 2 monstruos (estático y móvil) con disparo y aplaste tipo Mario | Core+power-ups sin enemigos (~50% menos alcance); ultra-mínima solo plataformas fijas |
| D2 | Controles | **Drag continuo = mover** (delta relativo, tipo joystick invisible); **tap rápido (sin arrastre) = disparar**. Un solo gesto en todo el área de juego | Touch por mitades + teclado web; tilt real (expo-sensors) en nativo — exige permisos y dos paradigmas |
| D3 | Disparo apuntado | Descartado tap-sobre-monstruo (targets minúsculos a 360×640). **Dirección: horizontal según `facing`** del Doodler (fiel al original — el muñeco dispara hacia donde mira; la dirección cambia con el movimiento). Revisa la decisión v0 ("recto hacia arriba") tras el playtest del 15-9: un disparo vertical no sirve contra monstruos laterales y no es el comportamiento del original | Tap al monstruo dispara hacia él; disparo hacia el punto de tap (web) — más control pero diverge del original y complica móvil |
| D4 | Récords | **`won: false` siempre** (endless: no hay victoria); `score` = altura máxima alcanzada en metros. Convención "más es mejor" ✓ | `won: true` si supera récord previo (mezcla semántica ganar/récord) |
| D5 | Física/scroll | **Mundo lógico fijo** (360×640 unidades) + escala de render con `useContainerSize` → física determinista independiente del dispositivo, comparable entre seeds E2E | Coordenadas del contenedor real (gameplay varía por pantalla, seeds no comparables) |
| D6 | Amenazas v1 | 2 monstruos: estático (aplastable/disparable) y móvil. **Sin UFO ni black hole** (fase 2, ver §8) | Set completo con UFO (abducción) y black hole (absorción) |
| D7 | Teclado web | **En alcance T6**: ←/→ mueven (velocidad horizontal fija), Espacio o ↑ dispara. Clave para desktop web (drag con mouse incómodo) + accesibilidad. Barato (~1 handler keydown) | Diferirlo (quedaría sin control cómodo en desktop) |
| D8 | Publicación del store | **Publicación discreta/throttled** (no espejo literal de serpiente): el engine vive como snapshot mutable interno del store; el rAF lo lee (`getGame()`) para escribir shared values; zustand publica SOLO eventos discretos (die/kill/hat...) y score/status throttled ≤5 Hz. Cero re-renders React por frame | Publicar `set({game})` cada frame (60 re-renders/s — prohibido por skill expo-animation) |
| D9 | Paso físico fijo | **Sub-pasos a paso fijo (8 ms)** con acumulador en el store (misma técnica `tickAccumMs` del repo): `advance` consume dt en sub-pasos deterministas con guard anti-espiral (`MAX_SUBSTEPS/frame`) → resultado independiente de la varianza del rAF, condición para seeds E2E honestos | Física con dt variable (no reproducible: el resultado dependería del framerate) |
| D10 | Haptics | Solo en eventos raros y causales: **spring → light, kill → medium, die → heavy**. El rebote normal NO vibra (frecuencia ~1/s: spam) — skill expo-animation: "one per user action, never per frame" | Haptic por rebote (spam: se apaga el sistema y pierde valor) |
| D11 | Score | `score = round(maxHeight / 10)` (metros enteros); **sin bonus por kill/spring** (recompensa del kill = despejar la vía + rebote físico). Display "X m" | Bonus de puntos por kill (contamina la métrica "altura"; la competencia por récord deja de ser comparable) |
| D12 | Aplaste y hat vs monstruos | Fiel al original: aplaste SOLO cayendo (`vy > 0`) sobre la cabeza del monstruo → rebote + muerte; el propeller hat destruye monstruos al atravesarlos y anula el disparo mientras dura | Hat no letal (desvía del original sin beneficio de simplicidad) |
| D13 | Identidad visual | **Doodle sketch con Views**: fondo papel cuadriculado (grid sutil de Views memoizadas, patrón damero de serpiente), Doodler/monstruos/plataformas dibujados con shapes/text, paleta propia del juego sobre el ThemeProvider. Sin assets de imagen (convención del repo) | Assets generados con AI (skill design: introduce pipeline que ningún juego usa); minimalista sin cuadrícula (pierde la identidad doodle) |
| D14 | Ajustes in-game | **Sin sheet de ajustes en v1**: sonido/dark mode ya son globales del app; el teclado (D7) cubre desktop; sensibilidad de drag se calibra fija en `tuning.ts` | Sheet espejo de serpiente con sensibilidad de drag (suma UI+persistencia+tests sin necesidad demostrada) |
| D15 | Potenciadores (playtest 2, 16-sept) | Hat: 4 s @ 200 u/s (ascenso ~80 m); spring 950 u/s (pico ~320 u); el hat se CONSUME al recogerlo (ícono fuera de la plataforma, spring no); sombrero visible solo con `hatMs > 0` | Mantener 2 s @ 160 (débil: ~320 u total) / ícono persistente en plataforma |
| D16 | Generación alcanzable (playtest 2) | Ventana horizontal por física: x nueva a ≤ `KEY_VX·t_land(gap)+PLATFORM_W−2·BLUE_AMP` de la x previa; brown siempre con compañera verde ±50 u; pool re-candeado | x uniforme aleatoria (tramos imposibles: gap 85 deja ~0.2 s de aire ≈ 53 u de alcance vs mundo 360 u) |
| D17 | Renombre | `doodle-jump` → `robo-jump` + reskin leve (Doodler robot, "¡Turbo!", 🤖); récords dev huérfanos aceptados (app no publicada, sin migración) | Mantener nombre doodle (mismatch con la identidad del catálogo) / re-tematización completa (fase 2) |

## 3. Arquitectura

Estructura en `src/games/doodle-jump/` (regla dura: nada bajo
`src/games/doodle-jump/` importa de otro juego; solo `src/core/`):

```
src/games/doodle-jump/
├── index.ts              # GameDefinition → GAME_REGISTRY
├── RULES.md              # fuente QA de reglas (convención del repo)
├── README.md             # detalle técnico del juego (convención del repo)
├── DoodleJumpScreen.tsx  # pantalla (loop rAF, render, gestos, audio)
├── components/
│   └── Renderer.tsx      # capa de entidades animadas (shared values)
├── engine/
│   ├── rules.ts          # PURO: física, colisiones, generación, wrap, disparos
│   ├── tuning.ts         # tabla de constantes (§3.2) — única fuente de tuning
│   ├── seed.ts           # sentinelas E2E + RNG seedeado
│   └── state.ts          # zustand: tick con sub-pasos + publicación D8
├── __tests__/
│   ├── rules.test.ts     # física/colisiones/generación determinista
│   ├── rules-perf.test.ts # fixture de perf de advance (convención repo)
│   ├── tuning.test.ts    # invariantes de la tabla (alcanzabilidad, caps)
│   ├── seed.test.ts
│   └── state.test.ts
└── __e2e__/
    └── doodle-jump.web.spec.ts
```

### 3.1 Engine puro (`rules.ts`)

- **Estado**: `{ status: 'playing'|'over', height, score, elapsedMs,
  doodler: {x, y, vx, vy, facing, hatMs}, platforms[], monsters[],
  bullets[], camY, rngSeed }` — serializable (rng como transición de
  estado, sin closures, patrón mulberry32 de serpiente).
- **Física** (paso fijo, D9): gravedad constante; colisión **solo al caer**
  (`vy > 0`) contra la parte superior de plataformas; impulso fijo al
  rebotar; spring = impulso mayor; propeller hat = ascenso sostenido
  `HAT_MS` (anula disparo, destruye monstruos al atravesar, D12).
- **Cámara** (regla del original, faltaba en la v0 del plan): scrollea
  hacia arriba SOLO cuando el Doodler cruza la línea de umbral
  (`doodler.y < camY + 0.4 * WORLD_H`); **nunca baja** al caer (las
  plataformas bajo cámara se descartan → no hay descenso).
- **Muerte**: (a) Doodler cruza el borde inferior de la cámara; (b) colisión
  con monstruo sin aplaste ni hat; con hat activo el monstruo muere al
  atravesarlo (D12). Aplaste: `vy > 0` + Doodler por encima de la cabeza
  del monstruo → rebote + evento `'kill'`.
- **Wrap-around lateral** (regla del original): salir por un lado →
  aparece en el otro. Para el render se duplica la copia visual durante el
  cruce (ver riesgos).
- **Plataformas**: verde (fija), azul (movilidad horizontal senoidal con
  rebote en bordes), marrón (se rompe al pisarla: no rebota y se elimina).
- **Generación procedural**: RNG seedeado; cada plataforma nueva se genera
  por encima de la cámara con separación vertical ∈ [minGap, maxGap
  escalado por altura] SIEMPRE ≤ `maxJumpHeight * 0.8` (margen de
  seguridad). **Test de alcanzabilidad (T1)**: la generación completa debe
  verificar que toda plataforma es alcanzable desde la anterior (gap
  vertical ≤ margen de salto) — test automatizado de la secuencia completa.
  La dificultad (proporción azul/marrón, separación media, probabilidad de
  monstruo) escala por bandas de altura.
- **Monstruos**: estático (flota en posición fija del aire) y móvil
  (oscilación horizontal senoidal). Spawn anclado a la generación de
  plataformas (probabilidad por banda); máx `MAX_MONSTERS` simultáneos en
  ventana de cámara.
- **Disparo** (D3): `shoot()` desde el store/gesto; bala **horizontal según
  `facing`** (~700 u/s), máx `MAX_BULLETS` activas, despawn al salir de
  cámara (tope O bordes laterales); colisión bala-monstruo lo elimina
  (evento `'kill'`).
- **Eventos discretos**: `{type:'die'}`, `'bounce'`, `'spring'`, `'hat'`,
  `'shoot'`, `'kill'` — sonido/haptics espejo de serpiente.
- **API**: `createGameState(config)`, `advance(game, dtMs) → {state,
  events, leftoverMs}` (consume dt en sub-pasos de `STEP_MS` con guard
  `MAX_SUBSTEPS`), `shoot(game)`, `applyDragX(game, deltaUnits)`.

### 3.2 Tabla de tuning (`tuning.ts`) — única fuente de constantes

Valores iniciales **a calibrar en playtest** (T6); los tests de
invariantes (§3.3) candean relaciones, no valores exactos:

| Constante | Valor inicial | Relación candenada en tests |
|---|---|---|
| `WORLD_W` / `WORLD_H` | 360 / 640 | — |
| `GRAVITY` | 1400 u/s² | — |
| `JUMP_V` | 560 u/s | `maxJump = JUMP_V²/(2·GRAVITY) ≈ 112 u` |
| `SPRING_V` | 820 u/s | `springJump ≈ 240 u` > `maxGap` |
| `MAX_GAP_FACTOR` | 0.8 · maxJump | todo gap ≤ factor (alcanzabilidad) |
| `MIN_GAP` | 48 u (v1: 30 — retuneada, ver R2) | ≥ 0 |
| `MAX_GAP_BASE` | 85 u (v1: 55 — retuneada, ver R2) | ≤ `MAX_JUMP_MARGIN·maxJump` (89.6) |
| `HAT_MS` | 2000 | — |
| `HAT_VY` | -160 u/s | ascenso sostenido |
| `BULLET_SPEED` / `MAX_BULLETS` | 700 u/s / 3 | — |
| `MAX_MONSTERS` | 3 | — |
| `KEY_VX` (teclado) | 260 u/s | ≤ drag clamp |
| `DRAG_CLAMP_VX` | 520 u/s | anti-teletransporte |
| `STEP_MS` / `MAX_SUBSTEPS` | 8 / 8 | estabilidad + determinismo |
| `CAM_LINE` | 0.4 · WORLD_H | cámara solo sube |
| `SPAWN_AHEAD` | 320 u (v1: 640 — retuneada, ver R2) | > ascenso máx por ventana (hat: 160 u/s·100 ms guard = 16 u/frame) |
| `PLATFORM_POOL` | 24 (v1: 22 — insuficiente, ver R0) | ≥ plataformas vivas máx (span vivo / MIN_GAP) |
| Dificultad | bandas cada 1000 u | gaps/monstruos ↑ monotónico |

### 3.3 Tests de invariantes (nuevo — hallazgo de la revisión)

- **Alcanzabilidad**: para N seeds aleatorias, la secuencia completa de
  plataformas cumple gap ≤ maxGap escalado (nunca hay muro imposible).
- **Determinismo**: misma seed + misma secuencia de inputs → mismo
  estado final (hash de snapshot) sin importar cómo se particione el dt.
- **Cámara monotónica**: `camY` nunca decrece.
- **Anti-espiral**: un frame de 1000 ms no ejecuta más de `MAX_SUBSTEPS`
  sub-pasos (guard) y no congela el loop.
- **Caps**: balas/monstruos nunca exceden sus máximos.
- **Perf fixture** (convención repo): `advance` con N entidades ≤ umbral ms.

### 3.4 Store (`state.ts`) — publicación D8

- El `GameState` vive como **snapshot mutable interno** del store (igual
  que `tickAccumMs` en serpiente); NO se publica cada frame.
- `tick(dtMs)`: acumulador → `advance` en sub-pasos → mutaciones internas;
  publica `set()` solo en: (a) eventos discretos (die/kill/spring/hat —
  inmediato), (b) score/status **throttled ≤ 5 Hz** (display del header),
  (c) start/reset/pausa.
- La pantalla escribe shared values cada frame leyendo `getGame()`
  (acceso sincrónico, sin suscripción zustand) — cero re-renders React por
  frame. Componentes React se suscriben por selector a campos discretos
  (`status`, `paused`, `score` throttle).
- `startRun(seed?)`, `reset(seed?)`, `shoot()`, `applyDrag(delta)`,
  `setDirection(dir)` (teclado), `togglePause()`, stats de tick
  (`setTickStatsEnabled` / `drainTickStats`) para ADR 0011.

### 3.5 Seeds E2E (`seed.ts`) — sentinelas rediseñados

- RNG determinista (patrón `seedConfig` de wakwak); `initialSeed` solo
  propaga con `EXPO_PUBLIC_E2E=1`. El sentinela fija config del mundo
  (plataformas/monstruos), no trayectorias.
- La clave del diseño: **el auto-rebote es determinista sin input** (el
  Doodler rebotando en una plataforma no se mueve horizontalmente) → los
  sentinelas explotan eso y evitan depender del drag humano:
  - `test-win` — **torre central**: plataformas verdes apiladas en el eje
    X del inicio → sin input el Doodler asciende solo; el spec valida
    score creciente, luego drag lateral fuera de pantalla → muerte →
    récord escrito con score previo (D4/D11).
  - `test-lose` — **monstruo en el eje del rebote**: un monstruo estático
    anclado sobre el eje X → colisión tras N rebotes sin input; valida
    muerte, overlay fin y récord con score parcial.
  - Disparo: en `test-win` un tap dispara (bala en el árbol de
    accesibilidad) y una bala mata un monstruo colocado a altura fija.
- En los specs, el drag se emula con pasos escalonados 25-30 ms
  (protocolo GOTCHAS/ADR 0011); el determinismo del engine lo vuelve
  reproducible (D9).

### 3.6 Pantalla (`DoodleJumpScreen.tsx`)

- **Render** (hallazgo skill expo-animation): Views nativos + shared
  values con API **`.get()`/`.set()`** (compiler-safe; no `.value`), solo
  `transform`/`opacity`; escala contenedor→mundo con `useContainerSize`;
  cero re-renders por frame (D8). Entidades: ~10-15 nodos animados
  (doodler + copia wrap + plataformas + monstruos + balas) — muy por
  debajo del umbral Skia; escalado a Skia solo si perf-metrics muestra
  jank (decisión documentada en notas).
  Cap de entidades activas + reciclaje de plataformas fuera de cámara.
- **Línea gráfica (D13)**: fondo papel cuadriculado (grid sutil de Views
  memoizadas — patrón `BoardGrid` de serpiente), entidades dibujadas con
  shapes/text (Doodler, monstruos, balas), paleta propia del juego sobre
  `useTheme`; las plataformas heredan la semántica de color del original
  (verde/azul/marrón). Todo sobre ThemeProvider light/dark.
- **Gestos**: `Gesture.Pan` en todo el área (mouse incluido en web) —
  umbral drag-vs-tap: tap = `onEnd` con desplazamiento < 10 u y duración
  < 250 ms → dispara; drag = delta relativo 1:1 con clamp de velocidad
  (`DRAG_CLAMP_VX`). `useDraggable` como **referencia de patrón** (no
  import directo: su settle/snap-back no aplica a un jugador en
  movimiento continuo). `scheduleOnRN` en `onEnd` (nunca por frame).
- **Teclado (D7)**: ←/→ (vx fija), Espacio/↑ dispara; un solo listener
  `keydown` web con `Platform.OS === 'web'`.
- **Loop**: rAF + `tick(dt cap 100 ms)` + `handleEvents` → sonido/haptics
  al momento causal (D10), popups de score, hit-stop y freeze+shake de
  muerte (sin shake con `useReducedMotion()`: "menos y más suave, no
  cero"), auto-pausa (visibilitychange / AppState), fin diferido.
- **Pausa con dueño** (hallazgo): botón pausa en header (`left`), overlay
  de pausa con Reanudar/Reiniciar (labels E2E propios); abrir la ayuda
  in-app auto-pausa y reanuda sola al cerrar (patrón D3 serpiente). Sin
  sheet de ajustes en v1 (D14).
- **Sonido** (reuse de players del repo, patrón rate de `soundCombo`):

  | Evento | Player | Nota |
  |---|---|---|
  | bounce | `cardDrop` (rate ~0.9) | suave; alternar cada 2º rebote si molesta (playtest) |
  | spring | `powerUp` | barrido ascendente |
  | hat | `powerUp` rate 1.2 | |
  | shoot | `cardMove` | blip corto |
  | kill | `hit` | |
  | die | `explosion` | |

  Assets nuevos solo si el playtest no convence (patrón PLAN-WAK-POLISH F5).
- **Récord**: `onGameEnd({ gameId:'doodle-jump', won:false, score: metros,
  durationMs, finishedAt })` — una sola vez por partida (`endedRef`).
  T7 verifica en `recordsRepository` que ordena score DESC y no filtra
  partidas `won:false`.
- **Header**: `GameHeader` con score/altura ("X m") en `center`; restart
  conserva seed E2E.
- **Responsive D4**: todo deriva del contenedor real medido; validado a
  360×640.

### 3.7 Accesibilidad / labels E2E (catalogados desde el diseño)

Selectores estables (selectores de Maestro/Playwright — convención AGENTS):

`doodle-jump-escena` (área de juego), `doodle-jump-pausa`,
`doodle-jump-reiniciar`, `overlay-pausa`, `overlay-fin`,
`doodle-jump-score`.

### 3.8 Registro

- `GameDefinition`: `id: 'doodle-jump'`, icono 🟩, `description`,
  `rules` condensadas, `minDurationHint: "1-5 min"` (endless),
  `supportsLandscape`: **no** (vertical por naturaleza) — portrait lock.
- Una línea en `GAME_REGISTRY` (`src/core/game-registry.ts`). Nada más:
  Home/router intactos.

## 4. Checklist de tareas (orden de ejecución)

- [x] T1 — Engine puro núcleo: física con sub-pasos fijos (D9), colisión
      plataforma, wrap, springs, cámara (D-cámara), generación seedeada
      con test de alcanzabilidad + `tuning.ts` + `rules.test.ts` +
      `tuning.test.ts`
- [x] T2 — Power-up propeller hat + eventos + plataforma azul/marrón +
      tests de regresión *(landió dentro de T1: engine completo con hat,
      azul, marrón y sus tests de regresión)*
- [x] T3 — Monstruos (2 tipos) + balas + aplaste/disparo/hat-letal +
      muerte + tests (determinismo por partición de dt incluido)
      *(landió dentro de T1: TDD reveló que premisas de simulación ciega
      eran falsas — ver notas)*
- [x] T4 — Store zustand con publicación D8 (discreta/throttled),
      stats de tick, shoot/drag/key + tests + `rules-perf.test.ts`
- [x] T5 — Seeds E2E (sentinelas `test-win` torre central, `test-lose`
      monstruo en eje) + tests
- [x] T6 — Pantalla: render Reanimated (`.get()/.set()`), loop rAF,
      gestos drag+tap, teclado web (D7), audio/haptics (D10/D11),
      popups, overlays pausa/fin, auto-pausa; calibración de tuning en
      playtest
- [x] T7 — Integración: GameDefinition + registro + récord vía
      `onGameEnd` (verificar orden score DESC con `won:false`) + RULES.md
      + ayuda in-app (`rules`) + README.md del juego
- [x] T8 — E2E web: `doodle-jump.web.spec.ts` (arranque y labels;
      test-win: ascenso sin input + disparo + récord; test-lose: muerte
      y overlay; responsive 360×640)
- [x] T9 — Verificación estándar completa: `pnpm typecheck` →
      `pnpm test` → `node scripts/e2e.mjs` (suite entera verde:
      typecheck ✓, 474 tests unit ✓, E2E 66 passed + 14 perf-skips ✓;
      specs doodle-jump 7/7 en corrida filtrada)
- [x] T11 — R1: disparo direccional según facing (`Bullet.vx`, avance
      x+y, despawn horizontal, colisión con `bx`); RULES.md R9 + tests
      *(refinamiento del plan aplicado: la bala viaja horizontal a ALTURA
      CONSTANTE — "nose ball" sin gravedad, fiel al original; la bala v1
      subía mientras avanzaba y no golpeaba al lado)*
- [x] T12 — R2: retuning (`MIN_GAP 48`, `MAX_GAP_BASE 85`,
      `SPAWN_AHEAD 320`) + `PLATFORM_POOL 24` + ajuste de invariantes de
      `tuning.test.ts` (span vivo / gap peor caso ≤ pool)
- [x] T13 — R3+R5+revisión: fix referencia stale en el frame; offsets/magic
      numbers por constantes de tuning; sombrero dibujado con Views (no
      emoji); gap fijo en ojos; spring alineado al borde de colisión; bala
      offset de centro; gestos `Gesture.Exclusive(pan, tap)` +
      `maxDistance` del tap; botón pausa ≥ 44 px con hitSlop; `.set()`
      consistente; `computeScale` muerto eliminado
- [x] T14 — R4: tolerancia de aplaste escalada al desplazamiento del
      sub-paso + test de aplaste rápido
- [x] T15 — R6: test anti-regresión de capacidad (invariante
      `(CLEAN_MARGIN+WORLD_H+SPAWN_AHEAD)/MIN_GAP ≤ PLATFORM_POOL` en
      `tuning.test.ts`)
- [x] T16 — E2E: smoke `perf-long` (mundo denso banda alta, score 2000 m
      desde arranque); verificación estándar completa verde: typecheck ✓,
      478 tests unit ✓, `node scripts/e2e.mjs` 67 passed ✓ (specs
      doodle-jump 8/8)
- [x] T17a — **Fixtures de validación** (pedido del usuario): catálogo
      `engine/fixtures.ts` (8 mecánicas: spring, hat, squish, squish-fast,
      aim, blue-brown, wrap, density) con mundo CERRADO (`closed: true`,
      `doodler` override en config) + guiones de input; unit
      `fixtures.test.ts` (9 tests, determinismo incluido); E2E
      `doodle-jump.fixtures.web.spec.ts` vía seeds `?seed=fix-<id>` (5
      specs visibles). Hallazgos: (a) doble desalineación de nombres
      seed↔catálogo (`spring` vs `fix-spring`) — la clave del catálogo es
      el id SIN prefijo; (b) export manual SIN `EXPO_PUBLIC_E2E=1` deja
      los seeds muertos en dist (el gate vive en `app/juego/[id].tsx`);
      (c) hook `window.__doodleDebug` (gated E2E) para diagnóstico
      engine↔render en Playwright — verificó consistencia total
      (15 engine ↔ 15 nodos DOM) tras R7: el blanco NO se reprodujo en el
      build actual. **Documentación de uso en el README del juego**
      (gate + comandos + salida de ejemplo).
- [x] T17 — Playtest manual del usuario (16-sept): **blanco corregido**,
      disparo y potenciadores funcionan. Pendientes que definen la fase 4:
      potenciadores (duración/potencia + ícono del hat no desaparece de la
      plataforma al usarlo), tramos imposibles por generación (x sin
      ventana de alcance), renombre a robo-jump.
- [x] T18 — **D15 Potenciadores**: `HAT_MS 4000` @ `HAT_VY 200`
      (ascenso ~80 m/uso), `SPRING_V 950` (pico ~322 u); consumo del hat
      (`p.hat = false` al recoger) + key de sync de escena con flags
      spring/hat; sombrero del Doodler dibujado con Views (DoodlerSlot
      ganó `hatOpacity`, visible solo con `hatMs > 0`, heredado por la
      copia de wrap); tests vy por constante (`HAT_VY`).
- [x] T19 — **D16 Generación alcanzable**: escáner estadístico (40 seeds ×
      5 bandas) DIJO que el dead-end era 100% **brown como única ruta**
      (la cadena verde/azul era alcanzable incluso con modelo
      conservador). Fix: (a) ventana `reachForGap` (x nueva a ≤
      `KEY_VX·t_land(gap)+PLATFORM_W/2−oscilaciones` de la x previa); (b)
      brown con **compañera verde** a 36 u por debajo y ≤ 90 u de
      distancia + **cap del gap post-brown** (`maxGap−COMPANION_DROP`)
      para cerrar la cadena desde la compañera; (c) pool 24→28 con
      invariante companion-aware; (d) `isCompanionPlatform` para los
      invariantes (compañera fuera de la escalera). Test de regresión
      `reachability.test.ts` (0/40 bloqueos en 5 bandas).
- [x] T20 — **D17 Renombre** `doodle-jump` → `robo-jump` + reskin leve:
      `git mv` folder + specs; entidad `doodler`→`robo` (campo, tipos,
      `DOODLER_W/H`→`ROBO_W/H`); labels `robo-jump-*` (robot/escena/pausa/
      score); seeds `__robo_*`; hook `__roboDebug`; registry (id/name/
      icon 🤖/descripción); reskin: cuerpo acero + visor cian + antena
      con punta encendida; popup "¡Turbo!". Récords dev huérfanos
      aceptados (sin migración). RULES.md R3/R5/R10 + README actualizados.
- [ ] T21 — Verificación estándar: `pnpm typecheck` → `pnpm test` →
      `node scripts/e2e.mjs`.
- [ ] T10 — Cierre: migrar hallazgos (GOTCHAS/ADR/ROADMAP si corresponde),
      eliminar este PLAN en el commit final — **solo con OK del usuario**

## 5. Criterios de aceptación

1. `pnpm typecheck` y `pnpm test` verdes con los tests nuevos (incluye
   invariantes de §3.3: alcanzabilidad, determinismo por partición de dt,
   cámara monotónica, caps, perf fixture).
2. `node scripts/e2e.mjs` completo verde (suite actual + specs nuevos).
3. A 360×640 sin scroll innecesario; el layout deriva del tamaño real
   (`useContainerSize`) — spec `responsive.web.spec.ts` candea.
4. El juego solo depende de `src/core/` (regla dura de aislamiento).
5. Récords escritos solo por `app/juego/[id].tsx` vía `onGameEnd`; score
   alto = mejor; `won: false` en toda partida terminada; los récords
   con `won:false` aparecen en la tabla (verificado en T7).
6. Sin seed, la run es aleatoria; con `EXPO_PUBLIC_E2E=1` y sentinela, el
   mundo es determinista Y el resultado no depende de la partición de dt.
7. Drag mueve al Doodler (con clamp); tap dispara; teclado ←/→/Espacio
   funciona en web; wrap-around lateral funcional; aplaste y disparo
   eliminan monstruos; caída/monstruo = fin de partida con récord único.
8. Cero re-renders React por frame (D8): el render corre en shared values
   y el loop no ejecuta `setState` por frame.
9. Haptics solo en spring/kill/die (D10); rebote silencioso de haptics.

## 6. Riesgos / puntos delicados

- **Determinismo con física continua** (mitigado por D9/D8): paso fijo +
  test de partición de dt + sentinelas sin input. El drag humano solo se
  emula con pasos escalonados (ADR 0011).
- **Umbral drag-vs-tap**: falsos disparos al arrastrar lento o disparos
  perdidos al tap largo → constantes en `tuning.ts` + calibración a
  360×640 en T6.
- **Perf / nodo animado**: el Doodler wrap-duplicado y las balas montan/
  desmontan Views → usar `entering/exiting` perezosos-memoizados
  (`overlayAnimation`) y reciclar plataformas; medir con
  `EXPO_PUBLIC_PERF_METRICS=1` (baseline→fix→delta si hay jank); escalar a
  Skia SOLO si las métricas lo justifican (el skill lo reserva para
  escenas enormes; tras R2 hay ~15-21 nodos vivos, bajo presupuesto).
- **Nativo pendiente de medición** (revisión sept-2026): las escrituras de
  shared values desde el rAF JS son asíncronas cross-thread en nativo;
  el diseño actual (D8) está verificado en web y es barato (benchmark
  Expo), pero ANTES de afirmar "perf OK en Android viejo" hay que medir
  con ADR 0011 en dispositivo real. Alternativas si fallara: snapshot
  único del frame en 1 shared value + worklets por entidad, o
  `useFrameCallback` (no implementar sin métrica). También: gestos con
  `runOnJS(true)` cruzan a JS por evento de gesto — aceptable (eventos
  discretos, no por frame), medir en dispositivo.
- **Wrap-around visual**: durante el cruce se renderizan DOS copias del
  Doodler (nodo extra pre-creado con opacity condicionada al cruce) para
  no teletransportarlo visualmente; verificación puntual con
  `getComputedStyle(el).transform` mid-gesto si el spec no lo cubre.
- **`CADisableMinimumFrameDurationOnPhone`** (skill expo-animation):
  verificar en `app.json` si llega el momento de medir en dispositivo iOS
  real (entorno actual no lo permite; anotar en hallazgos).
- **Playtest de tuning**: los valores de §3.2 son semilla; el "feel"
  (gravedad, clamp, umbral tap) solo se valida jugando (skill
  expo-animation: release build; aquí: export + viewport 360×640).

## 7. Notas/hallazgos

### T1 (engine puro) — hallazgos de implementación

- **Bug de cámara detectado en TDD**: la primera fórmula
  (`camY = max(camY, y - línea)` invertía la dirección del scroll — la
  cámara "bajaba" mientras el Doodler subía). La regla correcta: camY es el
  tope de la vista en coords y-down; subir = camY DECRECE;
  `camY = min(camY, doodler.y - CAM_LINE·WORLD_H)` y el test candea
  monotonicidad no-creciente (no no-decreciente). Coordenadas y-down
  invierten la intuición de "subir": candear dirección, no solo magnitud.
- **El test de alcanzabilidad por simulación ciega era una premisa
  falsa**: sin input horizontal el Doodler rebota en una sola plataforma
  para siempre (el apex no cruza la línea de cámara), y un "walker"
  aleatorio con drag muere tarde o temprano. El invariant reales son
  (a) gap estructural de la generación (test de secuencia completa por
  seed/banda) y (b) sobrevivencia validada por sentinela E2E, no por
  simulación ciega.
- **Partición de dt**: el harness del test debe acumular `leftoverMs`
  entre llamadas de `advance`; de lo contrario el "determinismo por
  partición" falla aunque el engine sea correcto (el sobrante es propiedad
  del llamador, D21 del repo).
- Los setups de muerte deben anular la generación además de vaciar
  plataformas (`nextSpawnY: -700`): solo quitar plataformas deja que el
  generador repueble el mundo en el primer sub-paso.
- Cap efectivo de monstruos: el guard de spawn usa el conteo vivo
  (`monstersOut.length < MAX_MONSTERS`); la limpieza bajo cámara corre en
  el mismo sub-paso, así que el techo real por ventana es estable.

### T4/T5 (store + seeds) — hallazgos de implementación

- **El guard anti-espiral define el contrato del tick en producción**:
  `tick(6000)` avanza solo 8 sub-pasos (64 ms). Los tests del store deben
  simular el loop rAF (frames de 16 ms vía helper `loopTick`) — llamar
  `tick` con ms grandes mide el guard, no el gameplay. La pantalla nunca
  llama `tick` con dt > 100 ms (cap del loop rAF de serpiente).
- La publicación throttled D8 verificada: 2 s de gameplay → ~10
  publicaciones (≤5 Hz) y la muerte publica inmediato. Pausa congela
  también la referencia interna (`getGame()` estable) — el render no
  necesita chequeos extra.
- Sentinelas: la torre central debe verificarse solo en el tramo visible
  (`y > 0`) — la generación continua encima añade reparto aleatorio por
  encima de la torre, que es el comportamiento correcto. El E2E usa
  6 s de tick (5 rebotes) para no entrar en zona de monstruos
  (`MONSTER_START_HEIGHT`).

### Revisión crítica (sept. 2026) — hallazgos aplicados a esta versión

- **Store rediseñado (D8)**: la v0 copiaba el patrón de publicación de
  serpiente ("set solo si cambió") que en física continua habría producido
  60 re-renders/s. División: snapshot mutable interno + publicación
  discreta/throttled; el render fluye por shared values.
- **Sub-pasos físicos (D9)**: la v0 tenía física continua con dt del rAF →
  no determinista. El repo ya resuelve el patrón con acumulador; se
  generaliza a sub-pasos de 8 ms.
- **Sentinelas rediseñados (§3.5)**: la v0 prometía "escalera imposible de
  perder" sin definir cómo se sube sin drag humano. La clave es el
  auto-rebote sin input (determinista por naturaleza).
- **`useDraggable` no es drop-in**: su contrato (lift, settle, snap-back)
  es para elementos estáticos; el Doodler es control continuo. Referencia
  de patrón, no import.
- **Convenciones repo confirmadas**: RULES.md + README.md por juego
  (existen en los 5); perf fixture test solo en damas/solitario/memorice
  (los arcades lo derivan de state.test) → se sumó como tarea T4.
- **Comparación skills**: expo-animation confirma shared values
  (`.get()/.set()`), haptics causales (D10), reduced motion y
  `scheduleOnRN` (ya convención del repo); design skill: decisión D13
  descarta assets AI (los juegos se dibujan con Views) — el cuadriculado
  se resuelve con el patrón `BoardGrid` de serpiente.
- **Decisiones confirmadas en la revisión**: D13 (doodle sketch con
  Views), D14 (sin ajustes v1) y D11 confirmada (score = altura pura).

### Playtest 2 del usuario (16-sept) + fase de ajustes — hallazgos T18-T20

- **Potenciadores (D15)**: hat se recogía pero el ícono QUEDABA en la
  plataforma (`p.hat` nunca se limpiaba) — además re-activable al
  re-caer. Fix: consumo al recoger + key de sync de escena por flags
  (ids solos no detectan el cambio). El Doodler ahora SÍ lleva el
  sombrero (DoodlerSlot.hatOpacity) mientras `hatMs > 0`.
- **Dead-end de generación (T19) — lección de método**: la matemática
  "a ojo" (window REACH por gap) daba bloqueos imposibles (75% de spans)
  que el MODELO CORRECTO desmintió: mi primer escáner restaba
  `BLUE_AMP` sin condicional y con eso sobre-bloqueaba; corregido,
  la cadena verde/azul es alcanzable 40/40 en toda banda. El culpable
  REAL: **brown como única ruta** (no se puede parar: se rompe → rebote
  eterno abajo = el "imposible avanzar" del usuario). Diseño iterativo
  de la compañera: drop 40 avanzando el cursor por ella dejaba gaps
  post-brown < MIN_GAP; drop 40 con cap dejaba compañera→siguiente >
  salto máx en banda 0 (40+48 = 88 > 85). **Solución: drop 36 + cap del
  gap post-brown `maxGap−36`** — todos los cierres de cadena quedan
  dentro de `maxGapFor`. Si se retoca el tuning: MIN_GAP + COMPANION_DROP
  ≤ MAX_GAP_BASE debe sostenerse (candearlo si se mueven).

### Playtest manual (15-sept-2026) + análisis post-implementación — hallazgos que definen la fase de remediación

Síntomas reportados por el usuario tras un playtest breve: disparo fijo
vertical, escenario que "se corrompe" (queda en blanco mientras los popups
de potenciadores siguen apareciendo), potenciadores deformados y problemas
generales de ubicación. Análisis del código (con números):

- **R0 — CRÍTICO: overflow del pool de plataformas (causa raíz del
  escenario en blanco)**. Span de entidades vivas = limpieza bajo
  `camY+692` y generación hasta `camY-SPAWN_AHEAD` → 1332 u (v1). Con gaps
  v1 [30, 55] (prom 42.5) hay **~31 plataformas vivas** (peor caso 44) y
  `PLATFORM_POOL=22`. El array se ordena de abajo hacia arriba: los
  índices ≥ 22 son las plataformas NUEVAS de arriba — justo donde va el
  jugador. Existen en el engine (colisionan, dan spring/hat → popup) pero
  el Renderer no las monta → "corrupción", escenario que se vacía y
  potenciadores que se recolectan sin verse. La torre `test-win` (gap 89 ≈
  15 vivas) no lo pisa: por eso el E2E quedó verde. *Remediación: R2
  (retuning) + pool 24 + test anti-regresión (R6).*
- **R1 — Disparo solo vertical**: `shoot()` crea bala `{x,y}` y `advance`
  la mueve solo vertical. Decisión del usuario: **facing** (D3 revisada).
- **R3 — Referencia stale del estado en el frame del loop**: `const game =
  getGame()` se captura ANTES de `tick(dt)` y `tick` reasigna el módulo
  `game`; el sync de escena (`key`/`setScene`) usa el estado pre-tick
  (lag de 1 frame). Inofensivo hoy, pero fragilidad real si se toca el
  renderer.
- **R4 — Aplaste con tolerancia insuficiente**: exige
  `prevBottom <= m.y - MONSTER_H/2 + 2`; con caída ~1000 u/s el Doodler
  baja ~8 u por sub-paso de 8 ms > 2 → cruces rápidos se leen como muerte
  en vez de aplaste. Escalar la tolerancia al desplazamiento del propio
  sub-paso.
- **R5 — Visual**: (a) sombrero = emoji 🧢 con fontSize derivado — glifo de
  fuente, inconsistente (debe ser dibujado con Views, D13); (b) `gap:
  '18%'` porcentual en los ojos de monstruos (frágil en RNW); (c) spring
  dibujado flotando encima vs colisión en el borde superior; (d) bala sin
  offset de medio alto (`-3*s`); (e) números mágicos duplicados en la
  pantalla (24/64/26/3) en vez de constantes de tuning (con
  imports sin usar).
- **R6 — Falta test anti-regresión de capacidad**: subir con hat/springs a
  20000 u y assertion `platforms.length ≤ PLATFORM_POOL` en todo momento
  (candea R0/R2 para siempre).
- Otras debilidades menores catalogadas: `computeScale` exportado sin uso
  (la pantalla recalcula inline); disparo con Espacio sin auto-fuego
  (`!event.repeat` — decisión válida a revisar con facing); monstruo
  spawneado a mitad de gap puede quedar en trayectoria obligada (mitigable
  con disparo/aplaste, aceptable).

**Decisiones del usuario (15-sept-2026)**: R1 → horizontal según facing;
R2 → opción recomendada (retuning de gaps + SPAWN_AHEAD + pool, no solo
agrandar el pool).

### Revisión técnica con skills + web (15-sept-2026) — refinamientos al plan

- **Fidelidad al original confirmada con fuentes** (GameFAQs iOS FAQ,
  Fandom Doodle Jump Wiki, Play Store): el disparo sale "de la nariz"
  (horizontal según facing) ✓ D3 revisada; el hat "no permite disparar y
  destruye enemigos al atravesarlos" ✓ D12 exacta; brown = caes al
  instante ✓; dificultad = gaps más anchos arriba ✓. Diferencias v1
  aceptadas y documentadas: (a) monstruos del original aguantan 2-4
  disparos — v1 los mata de 1 (simplicidad; el aplaste sigue siendo 1);
  (b) en algunas versiones se puede APUNTAR al tap ("laser") — D3
  descartó apuntado. **Ideas para fase 2** (→ §8): marcador del récord
  propio "dibujado en el margen del papel" (mecánica firma del original),
  trampolín/backflip.
- **Hilo de escritura del render (skill expo-animation + docs
  Reanimated)**: escribir shared values desde el rAF JS es asíncrono
  cross-thread en nativo (JSI, sin bridge, pero cada write es un mensaje)
  — en web es directo. Con ~30 writes/frame el costo es bajo (benchmark
  Expo SDK 55: 10-100 views bajo presupuesto). **Decisión: mantener el
  diseño D8 actual; NO migrar el loop a `useFrameCallback`/worklet** (el
  engine/zustand/sonido viven en JS; por frame habría `scheduleOnRN` —
  anti-patrón). Queda pendiente de medición nativa con ADR 0011 si algún
  día hay dispositivo: alternativa documentada (1 shared value snapshot
  del frame + worklets por entidad, o frame callback en UI thread). Nota
  en §6/ROADMAP.
- **Escrituras `.value` vs `.set()`**: alinear todo a `.set()` /
  asignación para iniciar animaciones; los READS en worklets de
  `useAnimatedStyle` son el uso correcto. Cambio de estilo, no de
  comportamiento (T13).
- **Composición de gestos Pan+Tap (docs RNGH)**: con `Gesture.Simultaneous`
  un drag rápido de <280 ms que termina tras pasar el umbral del Pan puede
  disparar el Tap (disparo accidental al terminar de dirigir). Remediación
  (T13): `Gesture.Exclusive(pan, tap)` con prioridad del Pan + `.maxDist(
  TAP_MAX_DISTANCE)` explícito en el Tap (hoy el umbral es implícito).
  Verificado en E2E con drag escalonado.
- **Checks ui-ux-pro-max aplicables**: emoji como icono estructural
  prohibido → refuerza R5a (sombrero dibujado con Views, no 🧢); botón
  pausa ~35×30 px < target 44 → agrandar o `hitSlop` (T13); feedback de
  press ya cubierto por `PressableScale`; dark mode: paleta del papel es
  light fija (decisión D13 "papel es papel") — verificar contraste de
  overlays en playtest, no bloquea.
- **Performance adicional revisada**: re-render React de la escena al
  cambiar el set de ids (~1-2 Hz, todos los nodos del pool re-renderizan
  por shift de índice) — aceptable; si perf-metrics lo señala, diff por id
  de entidad. El build del key-string por frame (map/join sobre ~30
  items) es churn menor — tolerable. Cámara/pool tras R2: ~15-21 nodos
  vivos, muy por debajo del presupuesto del benchmark (10-100 views
  < frame budget).
- **Referencias**: [useFrameCallback](https://docs.swmansion.com/react-native-reanimated/docs/advanced/useFrameCallback),
  [Shared values](https://docs.swmansion.com/react-native-reanimated/docs/core/useSharedValue),
  [Gesture composition](https://docs.swmansion.com/react-native-gesture-handler/docs/legacy-gestures/gesture-composition),
  [benchmark Expo animaciones](https://expo.dev/blog/the-real-cost-of-react-native-animations-benchmarking-every-approach),
  [Doodle Jump FAQ (iOS)](https://gamefaqs.gamespot.com/iphone/969788-doodle-jump/faqs/69666),
  [Doodle Jump Wiki](https://doodlejumpsky.fandom.com/wiki/Doodle_Jump_(game)).

## 8. Fuera de alcance v1 (fase 2 candidata — ROADMAP al cierre)

- UFO (abducción), black hole (absorción), trampolín (con backflip que
  anula disparo), spring shoes, escudo, cohete, plataformas gris
  (vertical) y amarillo-rojo (explota), tilt nativo (expo-sensors), sheet
  de ajustes/sensibilidad de drag, temas visuales, misiones/logros.
- **Marcador de récord "dibujado en el margen del papel"** (mecánica firma
  del original: el mejor score propio aparece garabateado en el margen a
  la altura que alcanzaste — motivación para superarlo).
- Monstruos multi-golpe (2-4 disparos según tamaño, fiel al original;
  v1 mata de 1).
- Apuntado de disparo al tap (versiones con "laser"); medir si aporta
  frente a facing.
