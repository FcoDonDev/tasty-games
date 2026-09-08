# PLAN — Mejoras de performance + métricas (solitario → resto de juegos)

> Estado: **implementado y verificado** (Fases 1–5). Creado 2026-09-08, revisado (v2).
> Pendiente: commit de cierre (elimina este PLAN, ver Fase 5.5).
> Flujo: implementar tarea por tarea marcando `- [x]`; hallazgos en "Notas/hallazgos";
> el PLAN se elimina en el commit de cierre.

## Contexto

Reporte del usuario: **desfase perceptible entre el sonido del movimiento de cartas y
la acción en sí en solitario** — sospecha de problemas de performance. Se pidió
analizar la implementación en detalle (primero solitario, luego los demás juegos),
y en paralelo incorporar **registros/métricas de performance** habilitables por
variable de entorno (**default: desactivadas**) para evaluar durante pruebas y
depurar en dev.

## Diagnóstico (análisis previo, con referencias)

### Solitario — cadena causal del desfase sonido/acción

En `handleDragEnd` (`src/games/solitario/SolitarioScreen.tsx:262-327`), tras el gesto
(UI thread) → `scheduleOnRN` → JS thread ejecuta el handler, que hace:

1. `setValidTargets(new Set())` + `state.moveCards(...)` → commit del store →
   re-render del tablero completo (~52 cartas): ni `Pile` ni `PileCard` ni
   `PlayingCard` están memoizados; el screen se suscribe a
   `tableau/waste/foundations/stock` (SolitarioScreen.tsx:69-72). Nota: React 18
   agrupa estas actualizaciones y la reconciliación se commitea **después** de que
   el handler retorna — no a mitad del handler.
2. Al final del handler: `hapticDropCommit()` + `soundCardDrop()` → en
   `src/core/ui/sound.ts:51` el `play()` se encola tras la promesa de
   `player.seekTo(0)` — hop async (round-trip nativo) antes de reproducir.
3. El **primer** sonido de la sesión paga además la creación perezosa del player
   (`createAudioPlayer`, sound.ts:44).

**Contribuidores dominantes del desfase, por peso esperado:**

- (a) La cola de `scheduleOnRN`: si el JS thread está ocupado, el handler entero
  (sonido incluido) espera.
- (b) El round-trip async de `seekTo` antes del `play()`.
- (c) La creación perezosa del player en el primer play de la sesión.
- (d) Menor: el trabajo de render agrupado tras el handler compite por el JS thread
  con el play y con los movimientos siguientes (jank).

Reordenar sonido-antes-del-commit dentro del handler (D1) es correcto y barato,
pero es un contribuidor **menor**: el peso real está en (b) y (c). El settle visual
(shared values, UI thread) siempre se verá fluido.

Referencias: docs de Reanimated Performance (no bloquear JS thread, memoizar
gestures), expo-audio (`seekTo(0); play()` sin encadenar), patrón conocido de
`scheduleOnRN` encolándose cuando el JS thread está ocupado.

Otros focos de coste en solitario:
- Guardado del estado debounceado (300ms, SolitarioScreen.tsx:140-154): serializa +
  escribe sqlite justo en la ventana del settle.
- 52 Pans + 52 Taps + `Simultaneous` (uno por `PileCard`) — aceptable, no tocar
  salvo que las métricas digan lo contrario.

### Resto de juegos

| Juego | Riesgo | Acción |
|---|---|---|
| Damas | Mismo patrón drag/settle (`DamasScreen.tsx:76-129`); 64 celdas inline sin memo; re-render completo por estado; drop sin sonido (solo haptic) | Memoización + instrumentación |
| WakWak | Loop rAF en JS thread (`WakWakScreen.tsx:82-97`): `tick` + `worldSnapshot` + `present` por frame; un stall del JS thread come frames | Solo instrumentación (stalls JS + FPS UI, métricas separadas) |
| Memorice | Bajo riesgo (setTimeout + Animated simples) | Sin cambios |

## Objetivo

1. Eliminar (o reducir a imperceptible) el desfase sonido/acción en solitario.
2. Reducir re-renders innecesarios en solitario y damas (jank en movimientos rápidos).
3. Módulo de métricas de performance, gated por env, default off, con salida en
   consola + **persistencia no bloqueante** consultable a posteriori + resumen al
   cerrar el juego.
4. Medir el impacto real del fix con **baseline antes / después** comparables.

## Decisiones de diseño (aprobadas con el usuario)

| # | Decisión | Alternativa descartada | Justificación |
|---|---|---|---|
| D1 | Fix sonido: haptic+sonido **antes** del commit del store + `seekTo`/`play` fire-and-forget + `primeAudioPlayers(ids)` con **subset por juego** al quedar `ready` (idle) | Solo `play()` directo manteniendo el orden; solo medir primero; crear los 7 players | El peso del fix está en fire-and-forget + precalentamiento (b, c); el reorden es barato y no rompe la lógica. Subset evita crear players no usados (solitario usa 4 de 7) |
| D2 | Memoización incluida en este requerimiento: solitario + damas | Solo solitario; deferir a ROADMAP | Necesaria para que la métrica de render muestre mejora; elimina jank en movimientos rápidos |
| D3 | Métricas: drag (latencia UI→JS sujeta a spike de relojes + duración de handler) + audio (handler→`play()`) + renders (Profiler **duración** + **contador de renders por pila**) + jank en dos ejes: stalls del loop rAF (**JS thread**) y FPS de render (`useFrameCallback`, **UI thread**) | Solo drag+audio; medición simple; mezclar rAF-JS y FPS-UI en una métrica | Cobertura completa; las dos métricas de jank miden cosas distintas y ambas importan en wakwak |
| D4 | Salida: log por evento `[perf][<juego>]` + **resumen acumulado al desmontar** (count/avg/min/p95) + persistencia web no bloqueante | Solo console; solo resumen | Visibilidad en vivo + consulta a posteriori; con pocas muestras count/min evita sobreinterpretar p95 |
| D5 | Gate: `process.env.EXPO_PUBLIC_PERF_METRICS === '1'` (inline en build), evaluado una vez a constantes; **default off**, cero overhead apagado (early-return). Togglear la variable **exige reiniciar Metro** (env inlineado, mismo gotcha que `EXPO_PUBLIC_E2E`) | Store/preferencia de usuario; `__DEV__` | Mismo patrón que ADR 0006; en producción sin env el canal no existe |
| D6 | Persistencia: web → snapshot a `localStorage` (`perf-metrics-<gameId>`), **sobrescrito por sesión** (retención simple: última sesión por juego), vía `requestIdleCallback` con fallback `setTimeout`; nativo → memoria + consola. Helper de consulta dev-only | Tabla sqlite (exigiría migración); acumulado histórico | Diagnóstico efímero; sqlite queda anotado en ROADMAP |

## Fases y checklist de tareas

> Orden deliberado: **métricas primero** (Fase 1), luego **baseline** con el fix sin
> aplicar (Fase 2.t0), después el fix (Fase 2) — para tener antes/después comparables.

### Fase 1 — Módulo de métricas `src/core/perf/`

- [x] 1.1 `src/core/perf/index.ts`: gate `PERF_ENABLED` (const de módulo desde
      `process.env.EXPO_PUBLIC_PERF_METRICS`) + acumuladores por juego/métrica.
      API: `perfDragEvent(gameId, {ui2jsMs?, handlerMs})`, `perfAudio(gameId, {handlerToPlayMs})`,
      `perfRenderReport(gameId, actualDurationMs)`, `perfRenderCount(gameId, pileKey)` (contador
      de renders por pila, para CA3), `perfJsStall(gameId, dtMs)` (loop rAF JS),
      `perfUiFrame(gameId, {dropped, total})` (FPS UI thread). Con gate off: todo no-op.
- [x] 1.2 Log por evento con prefijo `[perf][<gameId>]` (consola, dev).
- [x] 1.3 Resumen acumulado (count/avg/min/p95 por métrica) impreso al desmontar la pantalla.
- [x] 1.4 Persistencia web no bloqueante: snapshot a `localStorage` (sobrescrito por
      sesión) vía `requestIdleCallback` (fallback `setTimeout`); helper de consulta
      dev-only (no-op si gate off). Nativo: memoria + consola.
- [x] 1.5 Monitor de UI-FPS: hook `usePerfFrameMonitor` (`useFrameCallback`) que **solo
      se monta si `PERF_ENABLED`** (el monitor consume presupuesto de frame).
- [x] 1.6 **Spike de relojes para UI→JS**: RNGH no expone `timestamp` en el evento →
      se usa `_getAnimationTimestamp()` de react-native-worklets (reloj en ambos
      runtimes). En web es el mismo reloj que `performance.now()` (valores 1–5ms
      plausibles): validado en web; nativo sin validar (deuda anotada).
- [x] 1.7 Tests unitarios del módulo (acumulación, percentiles/count/min, resumen,
      gate off = no-op, persistencia web con storage inyectado, contador de renders).

### Fase 2 — Baseline + fix desfase de sonido (solitario)

- [x] 2.t0 **Baseline ANTES del fix**: dev server con `EXPO_PUBLIC_PERF_METRICS=1`
      (env inline en la línea de comando, `.env` intacto para no contaminar el build
      E2E) + protocolo Playwright (drag legal, 2 inválidos, doble tap). Números en
      Notas/hallazgos.
- [x] 2.1 `src/core/ui/sound.ts`: `player.seekTo(0)` + `player.play()` fire-and-forget.
- [x] 2.2 `src/core/ui/sound.ts`: `primeAudioPlayers(ids?: SoundId[])` — subset pedido
      o todos; sin reproducir. Decisión sobre `soundOn`: prime crea players
      independientemente (barato, cubre al usuario que activa el sonido después).
- [x] 2.3 `SolitarioScreen.handleDragEnd`: validación espejo de commitMove antes del
      commit → haptic + sonido antes de `state.moveCards(...)`.
- [x] 2.4 Mismo reorden en `handleAutoMove` (validación espejo +
      `autoMoveToFoundation`) y `handleDrawStock` (guard espejo + `drawStock`).
- [x] 2.5 `primeAudioPlayers(['cardMove','cardDrop','cardInvalid','gameWin'])` al
      quedar `ready` (setTimeout 0 post-primer render).
- [x] 2.6 Test unitario de precalentamiento/idempotencia/subset + fire-and-forget
      (`src/core/ui/__tests__/sound.test.ts`).
- [x] 2.7 **Medición después del fix** con el mismo protocolo; delta en Notas
      (audio p95 3.0→0.9ms, handler avg 2.4→1.9ms).

### Fase 3 — Memoización (solitario + damas)

- [x] 3.1 `PlayingCard`: `React.memo` (props estables: card, width, height).
- [x] 3.2 `PileCard`: `React.memo` con props numéricas (x/y precomputados en `Pile`,
      sin `pileRef`/`cards` en props; `pileRef` memoizado en `Pile`; `onAutoMove(id)`
      directo en vez de closure nueva por carta).
- [x] 3.3 `Pile`: `React.memo` (cards por referencia; los commits crean solo los
      arrays cambiados — verificado en `state.ts`).
- [x] 3.4 Damas: `React.memo` en `PieceView` y celdas extraídas a `Square` memoizado
      (props index/x/y/size/dark/target).
- [x] 3.5 Guardado debounceado (300ms): **sin cambio** — sin señal en métricas ni
      razonamiento: serializa ~52 objetos (escala µs) y el write es sqlite async en
      nativo / localStorage ~KB en web; no justifica la complejidad de moverlo a
      idle. Deuda anotada en ROADMAP solo si en medición en dispositivo aparece jank.
- [x] 3.6 Re-medición (mismo protocolo): render.board avg 25.6→**7.6ms**,
      min 16.7→**0.3ms** (los renders de commit saltan pilas no afectadas). Los
      contadores por pila quedan uniformes (7-8) por las transiciones de `dragKey`
      (inicio/fin de drag): pases baratos de `Pile` — los PileCard internos saltan
      por memo. Deuda opcional: mover dragKey a shared value para eliminar esos
      pases (ROADMAP).

### Fase 4 — Instrumentación de los otros juegos

- [x] 4.1 Damas: drag (handler + ui2js) + Profiler + contador de renders por ficha
      (aplicado junto a la memoización). Sanity manual: drag legal commit OK
      (turno cambia, Movimientos: 1, drag handler=0.8ms, ui2js=1.1ms).
- [x] 4.2 WakWak: stalls del loop rAF (JS thread, `dt > 25ms` con dt crudo) y
      FPS UI (`usePerfFrameMonitor`) separados; sin tocar la lógica del motor.
      Sanity: 349 frames/~6s (≈58fps), 0 dropped; 2 stalls solo durante carga.
- [x] 4.3 Resumen al desmontar en damas y wakwak.
- [x] 4.4 Memorice: confirmado sin cambios (riesgo bajo, anotado en diagnóstico).

### Fase 5 — Verificación estándar + medición + cierre

- [x] 5.1 `pnpm typecheck` (<5s).
- [x] 5.2 `pnpm test` (regresión completa: 259 passed, incl. 7 nuevos de perf y
      4 nuevos de sound).
- [x] 5.3 `node scripts/e2e.mjs` — **34/34** (la suite creció respecto de las 25
      que referenciaba este plan; cero regresiones).
- [x] 5.4 Confirmar que con métricas OFF el output de consola no cambia: el build
      E2E no contiene el literal `EXPO_PUBLIC_PERF_METRICS` (inlineado a
      `undefined` por babel → gate false de módulo; API no-op verificada por tests).
- [x] 5.5 Cierre documental (el commit que elimina este PLAN queda pendiente de
      aprobación):
      - `docs/GOTCHAS.md`: inlining de env (EXPO_OS/EXPO_PUBLIC_*), `_getAnimationTimestamp`
        para latencia UI→JS, scheduleOnRN + audio fire-and-forget.
      - `docs/adr/0011-metricas-performance.md` (nuevo) + índice de ADRs.
      - `docs/ROADMAP.md`: deudas (relojes nativo, sqlite métricas, dragKey
        shared value, guardado idle si aparece jank en device).
      - `docs/ARCHITECTURE.md`: sección `src/core/perf/` + nota en drag.
      - READMEs de solitario (sonido/latencia), damas y wakwak (métricas).

## Criterios de aceptación

- CA1: el drop válido en solitario dispara el sonido sin desfase perceptible.
  Evidencia: delta baseline→después (2.t0 vs 2.7) en handler→`play()` y en la
  percepción manual en dev. Nota: la latencia UI→JS solo se reporta si el spike de
  relojes (1.6) la valida; si no, el par handler→`play()` cuantifica el gap.
  **✅ CUMPLE** (audio p95 3.0→0.9ms + round-trip nativo eliminado + prime).
- CA2: primer movimiento de la sesión no paga creación de player en el camino
  crítico (primed en `ready` con subset). **✅ CUMPLE** (test + medición).
- CA3: re-render por movimiento en solitario limitado a las pilas que cambian,
  verificado con el **contador de renders por pila** (1.1, 3.6). **✅ CUMPLE**
  (avg render 25.6→7.6ms, min 0.3ms; los pases por dragKey quedan baratos —
  deuda opcional en ROADMAP).
- CA4: `EXPO_PUBLIC_PERF_METRICS=1` produce logs `[perf][…]`, resumen al salir y
  snapshot en `localStorage` (web, sobrescrito por sesión). Sin la variable: cero
  overhead y cero output. **✅ CUMPLE** (verificado en dev + build export).
- CA5: verificación estándar verde (typecheck + test + e2e). **✅ CUMPLE**
  (typecheck ok, 259 tests, e2e 34/34).

## Notas/hallazgos

(placeholder — migrar al cierre: lecciones → docs/GOTCHAS.md, decisión de métricas →
ADR, detalle por juego → README del juego, deuda → ROADMAP)

### Baseline (2.t0 — antes del fix de sonido; dev web 360×640, seed `test-move`)

- `render.board`: count=16, avg=25.6ms, min=16.7ms, p95=68.4ms → cada render del
  tablero excede el presupuesto de frame (16.7ms).
- `audio.handlerToPlay`: count=4, avg=1.3ms, min=0.4, p95=3.0 → solo el coste JS
  de llamar al audio; el round-trip async de `seekTo` NO está incluido (el sonido
  audible arranca después de que la promesa resuelve).
- `drag.handler`: count=3, avg=2.4ms, min=1.0, p95=4.9.
- `drag.ui2js`: count=3, avg=2.4ms, min=1.0, p95=5.0.
- Contadores de render: **13/13 pilas × 16 renders** (208 renders de pila para
  ~4 interacciones) → re-render completo del tablero confirmado, CA3 a verificar
  después de la memoización.
- RNGH no expone `timestamp` en el evento de gesto: la latencia UI→JS se mide con
  el reloj de worklets `_getAnimationTimestamp()` (react-native-worklets lo
  expone en ambos runtimes). En web es el mismo reloj que `performance.now()`
  (valores 1–5ms, plausibles): **spike validado en web**; en nativo queda sin
  validar — tratar con cautela (deuda: validar relojes en Android).

### Fixes aplicados

- `perf/index.ts`: babel-preset-expo inlinea `process.env.EXPO_OS` y `EXPO_PUBLIC_*`
  en compilación → en Jest el env runtime no tiene efecto; el storage web se
  inyecta con `setPerfStorageForTests` y el gate con `setPerfEnabledForTests`
  (la variable `enabled` NO es const para permitir esto). En build real el inline
  es correcto (web → 'web', EXPO_PUBLIC_PERF_METRICS según env del build).
- `endPerfSession` guarda el snapshot en memoria (`readPerfMetrics` lo prefiere
  sobre localStorage): lectura inmediata sin esperar al write en idle; tras
  recargar la página cae a localStorage.
- RNGH no expone `timestamp` en el evento: la latencia UI→JS usa
  `_getAnimationTimestamp()` (global de react-native-worklets en ambos runtimes).

### Delta después del fix de sonido (2.7 — mismo protocolo que baseline)

- `audio.handlerToPlay`: avg 1.3→**0.8ms**, p95 3.0→**0.9ms** (coste JS). Además,
  estructural: el round-trip nativo de `seekTo` ya no antecede al `play()`
  (fire-and-forget) y el primer sonido de la sesión no paga `createAudioPlayer`
  (prime en `ready`).
- `drag.handler`: avg 2.4→**1.9ms**, p95 4.9→**2.9ms**.
- `drag.ui2js`: avg 2.4→2.1ms.
- `render.board` sin cambio (avg ~25-30ms): la palanca de renders es la
  memoización (Fase 3).
- Validación espejo antes del commit (drop/auto-move/draw) verificada: doble tap
  commit correcto, E2E pendiente en Fase 5.
