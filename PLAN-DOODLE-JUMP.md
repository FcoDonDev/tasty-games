# PLAN-DOODLE-JUMP

Estado: **planificación aprobada, implementación pendiente.**
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

## 2. Decisiones de diseño (aprobadas con el usuario, sept. 2026)

| # | Aspecto | Decisión | Alternativas descartadas |
|---|---|---|---|
| D1 | Alcance v1 | **Completo**: plataformas verde/azul/marrón + springs + propeller hat + 2 monstruos (estático y móvil) con disparo y aplaste tipo Mario | Core+power-ups sin enemigos (~50% menos alcance); ultra-mínima solo plataformas fijas |
| D2 | Controles | **Drag continuo = mover** (delta relativo, tipo joystick invisible); **tap rápido (sin arrastre) = disparar**. Un solo gesto en todo el área de juego | Touch por mitades + teclado web; tilt real (expo-sensors) en nativo — exige permisos y dos paradigmas |
| D3 | Disparo apuntado | Descartado tap-sobre-monstruo (targets minúsculos a 360×640); el disparo sale recto hacia arriba (fiel al original en móvil) | Tap al monstruo dispara hacia él |
| D4 | Récords | **`won: false` siempre** (endless: no hay victoria); `score` = altura alcanzada. Convención "más es mejor" ✓ | `won: true` si supera récord previo (mezcla semántica ganar/récord) |
| D5 | Física/scroll | **Mundo lógico fijo** (360×640 unidades) + escala de render con `useContainerSize` → física determinista independiente del dispositivo, comparable entre seeds E2E | Coordenadas del contenedor real (gameplay varía por pantalla, seeds no comparables) |
| D6 | Amenazas v1 | 2 monstruos: estático (aplastable/disparable) y móvil. **Sin UFO ni black hole** (fase 2, ver §8) | Set completo con UFO (abducción) y black hole (absorción) |
| D7 | Bonus web | Flechas ←/→ en teclado web si sale gratis; no bloquea nada si se difiere | — |

## 3. Arquitectura

Estructura en `src/games/doodle-jump/` (regla dura: nada bajo
`src/games/doodle-jump/` importa de otro juego; solo `src/core/`):

```
src/games/doodle-jump/
├── index.ts              # GameDefinition → GAME_REGISTRY
├── DoodleJumpScreen.tsx  # pantalla (loop rAF, render, gestos, audio)
├── engine/
│   ├── rules.ts          # PURO: física, colisiones, generación, wrap, disparos
│   ├── seed.ts           # sentinelas E2E + RNG seedeado
│   └── state.ts          # zustand: tick(dtMs) con acumulador + drainTickStats
├── __tests__/
│   ├── rules.test.ts     # física/colisiones/generación determinista
│   ├── seed.test.ts
│   └── state.test.ts
└── __e2e__/
    └── doodle-jump.web.spec.ts
```

### Engine puro (`rules.ts`)

- **Estado**: `{ status: 'playing'|'over', height, score, elapsedMs, doodler: {x, y, vx, vy, facing, hatMs?}, platforms[], monsters[], bullets[], camY, rngState }`.
- **Física**: gravedad constante; colisión **solo al caer** (`vy > 0`) contra
  la parte superior de plataformas; impulso fijo al rebotar; spring =
  impulso mayor; propeller hat = ascenso sostenido durante N ms (sin
  disparar, fiel al original).
- **Wrap-around lateral** (regla del original): salir por un lado → aparece
  en el otro.
- **Plataformas**: verde (fija), azul (movilidad horizontal, rebote en
  bordes), marrón (se rompe al pisarla, sin rebote). Las que quedan bajo
  cámara se descartan (no hay descenso).
- **Generación procedural**: RNG seedeado; cada plataforma nueva se genera
  por encima de la cámara con separación vertical acotada al máximo de
  salto; la dificultad (separación, densidad de móviles/rotas/monstruos)
  escala con la altura.
- **Monstruos**: estático (muere por disparo o aplaste) y móvil (oscila
  horizontal). Colisión con el Doodler = fin, salvo aplaste (Doodler cae
  sobre su cabeza → rebote + muerte del monstruo).
- **Disparo**: `shoot()` desde el store; bala recta hacia arriba; colisión
  bala-monstruo lo elimina (+score).
- **Score**: altura acumulada (más es mejor ✓). Eventos discretos
  (`{type:'die'}`, `'bounce'`, `'spring'`, `'hat'`, `'shoot'`, `'kill'`)
  para sonido/haptics, espejo de serpiente.
- **API**: `createGameState(config)`, `advance(game, dtMs) → {state, events, leftoverMs}`, `shoot(game)`.

### Store (`state.ts`)

Espejo de `serpiente/engine/state.ts`: `tick(dtMs)` con acumulador
`tickAccumMs` (única fuente de verdad del tiempo fraccionario), publica
`set()` solo si cambió, stats de tick (`setTickStatsEnabled` /
`drainTickStats`) para la sesión perf ADR 0011, `startRun(seed?)`,
`reset(seed?)`, `shoot()`, `togglePause()`.

### Seeds E2E (`seed.ts`)

- RNG determinista (mismo enfoque `seedConfig` de wakwak); `initialSeed`
  solo propaga con `EXPO_PUBLIC_E2E=1`.
- Sentinelas propuestos: `test-win` (escalera imposible de perder →
  valida score/récord) y `test-monster` (monstruo a altura fija → valida
  disparo/aplaste/muerte).
- La física es continua: en los specs, los inputs de drag se emulan con
  pasos escalonados (protocolo GOTCHAS/ADR 0011) para resultado reproducible.

### Pantalla (`DoodleJumpScreen.tsx`)

- **Render**: shared values de Reanimated (posiciones del mundo escritas
  por el loop rAF, escala contenedor→pantalla vía `useContainerSize`),
  interpolación en UI-thread, cero re-renders por frame (patrón D20 de
  serpiente).
- **Gestos**: Gesture.Pan en todo el área — umbral de activación
  drag-vs-tap (tap = `onEnd` sin movimiento significativo y duración
  corta → dispara; drag = delta relativo mueve al Doodler). Patrón base:
  `src/core/ui/drag/useDraggable.ts`.
- **Loop**: rAF + `tick(dt)` + `handleEvents` → sonido/haptics
  (`src/core/ui/haptics` + players de audio, prime en idle), popups de
  score, hit-stop/animaciones de muerte, auto-pausa (visibilitychange /
  AppState), fin diferido.
- **Récord**: `onGameEnd({ gameId:'doodle-jump', won:false, score: height,
  durationMs, finishedAt })` — una sola vez por partida (ref `endedRef`).
- **Header**: `GameHeader` con score/altura en `center`; restart conserva
  seed E2E; settings si corresponde.
- Responsive D4: todo deriva del contenedor real medido; validado a
  360×640.

### Registro

- `GameDefinition`: `id: 'doodle-jump'`, icono 🟩 (o 🟢), `description`,
  `rules` condensadas. `supportsLandscape`: **no** (juego vertical por
  naturaleza) — mantener portrait lock.
- Una línea en `GAME_REGISTRY` (`src/core/game-registry.ts`). Nada más:
  Home/router intactos.

## 4. Checklist de tareas (orden de ejecución)

- [ ] T1 — Engine puro núcleo: física, colisión plataforma, wrap, springs,
      generación seedeada, score por altura + `__tests__/rules.test.ts`
- [ ] T2 — Power-up propeller hat + eventos + plataforma azul/marrón +
      tests de regresión
- [ ] T3 — Monstruos (2 tipos) + balas + aplaste/disparo + muerte + tests
- [ ] T4 — Store zustand (tick acumulador, stats, shoot) + tests
- [ ] T5 — Seeds E2E (sentinelas `test-win`, `test-monster`) + tests
- [ ] T6 — Pantalla: render Reanimated escalado, loop rAF, gestos
      drag+tap, audio/haptics, popups, overlays, auto-pausa
- [ ] T7 — Integración: GameDefinition + registro + récord vía
      `onGameEnd` + ayuda in-app (`rules` + RULES.md)
- [ ] T8 — E2E web: `doodle-jump.web.spec.ts` (arranque, salto/score con
      seed, disparo con seed, responsive 360×640)
- [ ] T9 — Verificación estándar completa: `pnpm typecheck` →
      `pnpm test` → `node scripts/e2e.mjs` (suite entera verde)
- [ ] T10 — Cierre: migrar hallazgos (GOTCHAS/ADR/ROADMAP si corresponde),
      docs del juego (`src/games/doodle-jump/README.md`), eliminar este
      PLAN en el commit final

## 5. Criterios de aceptación

1. `pnpm typecheck` y `pnpm test` verdes con los tests nuevos.
2. `node scripts/e2e.mjs` completo verde (suite actual + specs nuevos).
3. A 360×640 sin scroll innecesario; el layout deriva del tamaño real
   (`useContainerSize`) — spec `responsive.web.spec.ts` candea.
4. El juego solo depende de `src/core/` (regla dura de aislamiento).
5. Récords escritos solo por `app/juego/[id].tsx` vía `onGameEnd`; score
   alto = mejor; `won: false` en toda partida terminada.
6. Sin seed, la run es aleatoria; con `EXPO_PUBLIC_E2E=1` y sentinela, el
   reparto de plataformas/monstruos es determinista.
7. Drag mueve al Doodler; tap dispara; wrap-around lateral funcional;
   aplaste y disparo eliminan monstruos; caída = fin de partida.

## 6. Riesgos / puntos delicados

- **Determinismo con física continua**: el drag humano no es reproducible;
  los specs E2E validan por semáforos deterministas (seed fija, plataforma
  imposible de perder, monstruo en posición fija) más que por trayectoria.
  Los inputs escalonados siguen el protocolo de ADR 0011/GOTCHAS.
- **Umbral drag-vs-tap**: falsos disparos al arrastrar lento o saltos
  omitidos al tap largo → calibrar con constantes del engine y probar en
  viewport 360×640.
- **Perf**: muchas plataformas/monstruos en shared values → mantener el
  número de nodos animados acotado (reciclar plataformas fuera de cámara,
  cap de entidades activas) y medir con `EXPO_PUBLIC_PERF_METRICS=1`
  (protocolo baseline→fix→delta si aparece jank).
- **Wrap-around visual**: el Doodler debe dibujarse en ambos bordes durante
  el cruce (o clip) para no "teletransportarse" visualmente.

## 7. Notas/hallazgos

(aún vacío — se llena durante la implementación)

## 8. Fuera de alcance v1 (fase 2 candidata — ROADMAP al cierre)

- UFO (abducción), black hole (absorción), trampolín, spring shoes,
  escudo, zapatos/cohete, plataformas gris (vertical) y amarillo-rojo
  (explota), temas visuales, misiones/logros.
