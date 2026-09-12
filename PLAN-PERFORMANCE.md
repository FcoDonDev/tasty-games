# Plan de mejora de performance

**Fecha de propuesta:** 2026-09-09
**Estado:** propuesta, no implementada, decisiones pendientes de aprobación
**Documento base:** [`docs/PERFORMANCE-AUDIT.md`](docs/PERFORMANCE-AUDIT.md)
**Alcance:** performance de gameplay, startup, bundle, persistencia, audio y observabilidad

Este archivo es el PLAN activo del requerimiento. No sustituye los ADRs ni los
READMEs de cada juego. Durante la implementación debe mantenerse commiteado y,
solo después de la verificación completa y la migración de hallazgos, eliminarse
según el flujo de `AGENTS.md`.

## 1. Objetivo

Mejorar y demostrar la performance de los cuatro juegos sin cambiar sus reglas ni romper la arquitectura de aislamiento entre juegos.

El plan prioriza primero la calidad de la medición. Ninguna optimización de alto impacto debe aceptarse únicamente por inspección de código o por resultados en modo desarrollo.

## 2. Principios

- Medir antes y después con el mismo escenario determinista.
- Diagnosticar con build instrumentado web, comparar funcionalidad en release web y validar conclusiones nativas en release Android.
- Mantener los engines aislados y deterministas según su contrato actual. WakWak
  usa un RNG de clausura mutable, por lo que la equivalencia debe probarse dado
  el mismo orden de llamadas, no asumirse como pureza referencial.
- No introducir `setState` o publicaciones React por frame en juegos de tiempo real.
- Mantener animaciones continuas en Reanimated/UI runtime cuando exista.
- No adoptar Skia, React Compiler ni feature flags experimentales como solución por defecto.
- Separar métricas de JS, React render, UI thread, GPU, memoria, audio y almacenamiento.
- Mantener la interfaz async de los repositorios duales.
- Preservar los seeds E2E y los resultados funcionales actuales.

## 3. Decisiones y alternativas

Estas son propuestas, no decisiones aprobadas para implementación.

| Tema | Alternativas | Recomendación provisional | Estado |
|---|---|---|---|
| Build de medición | Instrumentado con `EXPO_PUBLIC_PERF_METRICS=1` / profiling con `EXPO_PUBLIC_PERF_PROFILING=1` / release con gate apagado | Separar los tres perfiles; usar el instrumentado para diagnóstico, profiling para duraciones de render y release para regresión; etiquetar `buildMode` en cada envelope | Decidida e implementada (Fase 1) |
| Ownership de `remainderMs` en WakWak | Mantenerlo en `GameState` / retornarlo separado / mover acumulador al adaptador | Evaluar mover el acumulador al adaptador sin cambiar `advance()` hasta demostrar equivalencia | Pendiente |
| Publicación de poses | Zustand / estado transitorio del adaptador / shared values | Mantener reglas puras y publicar HUD/eventos discretos; poses fuera de React | Pendiente |
| Bundle de juegos | Registro eager / metadata + loader web / loader universal con fallback nativo | Medir Atlas primero; solo introducir loader si supera el presupuesto | Pendiente |
| Legalidad de Damas | Recalcular / mapa cacheado por `board` + `turn` | Mapa cacheado con validación final en store | Pendiente |
| Persistencia Solitario | Mantener debounce / idle web + cola nativa / diffs | Medir primero; cambiar scheduling solo si cruza el presupuesto | Pendiente |
| Audio | Cache permanente / cache con lifecycle / players por pantalla | Cache con lifecycle explícito y configuración de background decidida por producto | Pendiente |

## 4. No objetivos

- No cambiar reglas, scoring, dificultad o timing de gameplay.
- No migrar todos los controles a `@expo/ui` solo por motivos de performance.
- No sustituir `FlatList` por FlashList para la Home actual de cuatro elementos.
- No migrar WakWak a Skia sin una traza que demuestre que Views/Reanimated son el cuello de botella.
- No habilitar React Compiler globalmente sin healthcheck, baseline y revisión de compatibilidad con Reanimated.
- No convertir cada métrica de desarrollo en lógica de producción.

## 5. Presupuesto inicial de referencia

Estos valores son presupuestos de diagnóstico, no todavía criterios definitivos de release:

| Métrica | 60 Hz | 120 Hz | Nota |
|---|---:|---:|---|
| Frame total | 16.67 ms | 8.33 ms | Incluye trabajo necesario para presentar el frame |
| Alerta JS rAF | >16.67 ms | >8.33 ms | Debe registrarse, no confundirse con UI FPS |
| Stall severo | >25 ms | >16.67 ms | Umbral útil para encontrar pausas perceptibles |
| UI frame perdido | `dt > budget` | `dt > budget` | Presupuesto dependiente de refresh rate |
| Drag UI-to-JS | Medir p95 | Medir p95 | Timestamp tomado al entrar al callback |
| Handler JS | Medir p95 | Medir p95 | Validación y commit separados |
| Render React | Medir actual/base | Medir actual/base | No representa pintura ni GPU |

Los umbrales siguientes son una propuesta inicial y deben quedar confirmados en
el primer baseline. La regla comparativa propuesta es ejecutar cinco lotes
independientes del mismo escenario, con 5 warm-up runs y 30 runs medidas por lote.
Aceptar una mejora solo si la mediana de los p95 mejora al menos 10% y ninguna
métrica crítica empeora más de 10%. Si la dispersión impide esa conclusión, el
resultado queda como inconcluso, no como mejora.

`dt > budget` no equivale automáticamente a un frame perdido. El esquema debe
conservar `longFrameEvents` y, si se calcula, `estimatedDroppedFrames` usando el
presupuesto del escenario. Un hueco de 50 ms debe distinguirse de uno de 21 ms.

## 6. Modelo de medición

El modelo de snapshot propuesto debe versionarse antes del baseline:

```text
schemaVersion
gameId
scenarioId
runId
platform
buildMode
commit
viewport
refreshHz
seed
warmupSamples
timers: count/avg/p50/p95/p99/max
uiFrames: total/longFrameEvents/estimatedDroppedFrames/dropRatio
counters
```

El `PerfSnapshot` actual solo contiene count, avg, min y p95. La implementación
de esta fase debe añadir p50/p99/max y definir el método estadístico, por ejemplo
nearest-rank (`ceil(p * n) - 1`). Debe haber tests para muestras pequeñas y para
casos donde p95 no coincida con el máximo.

Las muestras deben estar acotadas o resumirse con histograma/reservoir sampling.
Una sesión larga no puede conservar indefinidamente todos los valores si se
pretende medir memoria. Al cerrar, debe conservarse el snapshot y liberarse la
sesión mutable.

En web, las métricas deben nombrar explícitamente el contexto (`browser.rAF`,
`browser.main`, `react.render`) y no presentarse como UI thread o GPU nativos.

## 7. Fase 0A: inventario y fixtures

**Objetivo:** preparar escenarios reproducibles antes de medir.

### Tareas

- [x] Crear fixtures solo para tests/E2E, siempre detrás de `EXPO_PUBLIC_E2E=1`.
- [x] Definir `memorice:perf-mismatch` y `memorice:perf-match`; ahora Memorice consume `initialSeed` (`perf-match`/`perf-mismatch` → seed numérico fijo, determinista).
- [x] Definir `damas:perf-kings` y `damas:perf-branching` con cantidad de piezas, damas, ramas y movimiento esperado.
- [x] Definir `solitario:perf-stock-empty` y un escenario de persistencia estable.
- [x] Definir `wakwak:perf-level-1` y `wakwak:perf-level-8`, incluyendo estado inicial e input exacto.
- [x] Documentar seed, viewport, duración, número de acciones y resultado funcional de cada fixture (tabla §9 + spec de performance).
- [x] Añadir tests de engine para cada estado nuevo sin importar módulos de UI/performance en los engines.

### Criterios de aceptación

- [x] Cada escenario tiene seed/fixture, input y resultado esperado.
- [x] Ningún fixture existe en producción cuando `EXPO_PUBLIC_E2E` está apagado.
- [x] Las corridas repetidas producen el mismo resultado funcional.

## 8. Fase 0B: correcciones de instrumentación

**Objetivo:** que las mediciones no mezclen causas distintas.

### Tareas

- [x] Memoizar el callback entregado a `useFrameCallback` en `src/core/perf/usePerfFrameMonitor.ts`.
- [x] Separar `frameDt`, p50, p95, p99, máximo, FPS estimado, `longFrameEvents` y frames estimados omitidos. (`uiFrame.maxDt` como muestra por flush + `uiFrames.longFrameEvents` / `uiFrames.estimatedDroppedFrames` / `uiFrames.total` separados; FPS estimado queda como derivable de `uiFrames.total`.)
- [x] Hacer configurable el presupuesto según refresh rate o registrar 60/120 Hz explícitamente. (Presupuesto configurable por parámetro `budgetMs`; la detección de refresh rate real del dispositivo queda como limitación documentada.)
- [x] Calcular `drag.ui2js` como primera operación del callback JS en Solitario y Damas.
- [x] Mantener `drag.handler` como métrica separada del tiempo total de cola.
- [x] Registrar por separado validación previa, commit del store, audio y persistencia. (Parcial: audio y drag separados; la separación fino-grana de validación/commit llega con las fases 3/4.)
- [x] Evitar ejecutar `React.Profiler` cuando `isPerfEnabled()` sea falso, mediante un wrapper estable y no hooks condicionales.
- [x] Mantener el hook del monitor siempre llamado, pero asegurar que callback, intervalos y almacenamiento no se activen con el gate apagado.
- [x] Documentar la comparabilidad de relojes web y Android. (Comentario en `useDraggable.ts` + limitación web etiquetada; validación Android bloqueada por Fase 1N.)
- [x] Decidir si el monitor UI se extiende a Solitario/Damas/Memorice o si la garantía queda explícitamente limitada a WakWak. (Decisión: queda limitado a WakWak en esta fase; extender es tarea de las fases 3-5 si el baseline lo justifica.)
- [x] Añadir tests de la semántica de cada métrica, no solo de acumulación.
- [x] Añadir tests de p50/p95/p99/max y de la conversión de `dt` a frames estimados.
- [x] Acotar las muestras de timers y liberar la sesión mutable al cerrar. (Buffer circular de 512 muestras + `sessions.delete` en `endPerfSession`.)

### Criterios de aceptación

- [x] Un evento `drag.ui2js` no contiene el tiempo de validación ni de spring.
- [x] Los datos reportan claramente JS, React y UI.
- [x] El callback de frame no se vuelve a registrar en renders ordinarios.
- [x] El gate apagado no activa callbacks, intervalos, almacenamiento ni profiling.
- [x] Los tests diferencian latencia de cola, handler y tiempo total.

## 9. Fase 1: protocolo y baseline reproducible

**Objetivo:** obtener una línea base repetible antes de tocar los hot paths.

### Perfiles de build

- **Instrumentado:** `EXPO_PUBLIC_PERF_METRICS=1`; puede usar `EXPO_PUBLIC_E2E=1` para fixtures y debe etiquetarse como `instrumented`, no como release comparable.
- **Instrumentado-profiling:** `EXPO_PUBLIC_PERF_METRICS=1` + `EXPO_PUBLIC_PERF_PROFILING=1` (alias `react-dom` → `react-dom/profiling` en `metro.config.js`); etiquetado `instrumented-profiling`. Variante de medición para la duración de renders (`render.board`); nunca mezclar con el perfil estándar en comparaciones.
- **Release web funcional:** `EXPO_PUBLIC_PERF_METRICS=0`, sin canal E2E; sirve para comprobar que el gate apagado no altera el comportamiento.
- **Release Android:** build profileable/release separado; no se puede inferir desde E2E web.

### Protocolo web

- Fijar viewport de 360x640 para mobile y 1280x900 para desktop.
- Crear un `E2E_PORT` aislado y comprobar con `curl`/`lsof` que está libre antes de exportar.
- No reutilizar un servidor activo que pueda servir un `dist/` anterior.
- Separar las pruebas de performance de la suite funcional.
- Hacer 5 warm-up runs y descartar sus muestras.
- Ejecutar 5 lotes independientes de 30 runs medidas por escenario.
- Realizar drags con `mouse.down`, movimientos escalonados y pausa de 25-30 ms por paso.
- Guardar `scenarioId`, `runId`, seed, commit, build mode, viewport, refresh rate y snapshot JSON.
- Al terminar una sesión, navegar fuera de la pantalla o cerrar explícitamente la sesión para forzar el snapshot.

Comandos propuestos, después de crear el spec de performance (SIN `CI=1`:
e2e.mjs + `CI=1` colisionan —hallazgo §19—; el §9-completado abajo manda):

```bash
EXPO_PUBLIC_PERF_METRICS=1 PERF_BASELINE=1 PERF_WARMUP=5 PERF_LOTS=5 PERF_RUNS=30 \
node scripts/e2e.mjs -- src/core/__e2e__/performance.web.spec.ts
```

Para export funcional sin instrumentación:

```bash
CI=1 EXPO_PUBLIC_PERF_METRICS=0 \
pnpm exec expo export --platform web --clear
```

Para Atlas:

```bash
EXPO_ATLAS=true CI=1 \
pnpm exec expo export --platform web --clear
pnpm dlx expo-atlas .expo/atlas.jsonl
```

### Escenarios versionados

| Scenario ID | Fixture/seed | Secuencia mínima | Salida principal |
|---|---|---|---|
| `wakwak-active-1` | `wakwak:perf-level-1` | movimiento normal durante ventana fija | browser.rAF, tick, snapshot, present |
| `wakwak-active-8` | `wakwak:perf-level-8` | movimiento normal durante ventana fija | mismo conjunto, nivel complejo |
| `wakwak-paused` | fixture estable | pausar 1.5 s y reanudar | callbacks rAF, idle animations |
| `solitario-drag` | `test-move` | válido + inválido | ui2js, handler, render, audio |
| `solitario-persist` | `test-move` | commit, esperar 600 ms, reload | stringify, write, restore |
| `solitario-endgame` | `solitario:perf-stock-empty` | movimiento con stock/waste vacíos | `hasAnyMove`, handler |
| `damas-initial` | setup estándar | drag legal e ilegal | reglas, handler, render |
| `damas-kings` | `damas:perf-kings` | drag con dama voladora | legalidad, ramas, latencia |
| `damas-branching` | `damas:perf-branching` | cadena ramificada | legalidad, allocations |
| `memorice-mismatch` | `memorice:perf-mismatch` | dos cartas no coincidentes | renders y flip |
| `memorice-match` | `memorice:perf-match` | dos cartas coincidentes | renders y flip |

Las fixtures nuevas deben crearse en Fase 0A antes de ejecutar este baseline.

### Salidas

- [x] Snapshot versionado por `scenarioId` y `runId` (envelope `schemaVersion: 1` + `PERF_SCHEMA_VERSION` en el snapshot; `buildMode` distingue `instrumented` de `instrumented-profiling`).
- [x] Guardar artifacts locales bajo `tmp/perf/` y publicarlos como artifacts de CI, sin commitear snapshots. (JSONL por escenario + `summary.json` con timers —mediana de p95 / máximo de p99— y contadores —mediana por corrida—.)
- [x] Tabla baseline con p50/p95/p99/max y dispersión por lote. (Tres baselines versionados en `baselines/`: v1 `b37eaf8` estándar, v2 `e839cbe` estándar —réplica que confirma reproducibilidad—, v3 `300b9f8` profiling con `render.board`. Ver MANIFEST de cada uno.)
- [ ] Bundle Atlas web. (Postergado a Fase 6: comando documentado en esta sección.)
- [ ] Tamaño raw/gzip de chunks web. (Postergado a Fase 6.)
- [ ] Tamaño y cantidad de assets de audio. (Postergado a Fase 6.)
- [x] Registro de hardware/browser, refresh rate, commit y modo de build. (Envelope: commit, viewport, buildMode; hardware/browser en cada MANIFEST; refresh rate queda como limitación conocida web.)

**Estado de la Fase 1 (2026-09-11): COMPLETA en web.** Protocolo implementado,
harness estable y tres baselines versionados en `baselines/`:

| Baseline | Fecha | Commit | Perfil | Contenido |
|---|---|---|---|---|
| v1 | 2026-09-10 | `b37eaf8` | instrumented | 11×150 corridas; referencia de la regla §5 (único outlier ambiental documentado) |
| v2 | 2026-09-10/11 | `e839cbe` | instrumented | Réplica de v1: medianas idénticas → reproducibilidad confirmada, sin regresiones |
| v3 | 2026-09-11 | `300b9f8` | instrumented-profiling | `render.board` en solitario+damas (900/900); referencia para mejoras de render |

Comandos (sin `CI=1`; borrar `tmp/perf` antes de corridas parciales):

```bash
# Perfil estándar
EXPO_PUBLIC_PERF_METRICS=1 PERF_BASELINE=1 PERF_WARMUP=5 PERF_LOTS=5 PERF_RUNS=30 \
node scripts/e2e.mjs -- src/core/__e2e__/performance.web.spec.ts
# Variante profiling (duración de renders)
EXPO_PUBLIC_PERF_METRICS=1 EXPO_PUBLIC_PERF_PROFILING=1 PERF_BASELINE=1 \
PERF_WARMUP=5 PERF_LOTS=5 PERF_RUNS=30 \
node scripts/e2e.mjs -- src/core/__e2e__/performance.web.spec.ts
# Por juego (mismo rigor por escenario): agregar -g "<juego>", ej. -g "solitario"
```

El harness imprime `build=instrumented(-profiling)` al inicio: verificar que
coincida con el perfil deseado antes de dejar correr la suite completa.
Pendientes movidos a Fase 6 (Atlas, tamaños) y a Fase 1N (validación Android,
pospuesta — ver §10).

## 10. Fase 1N: baseline Android POSPUESTA

> **Pospuesta por decisión del usuario (2026-09-11).** Para retomarla a futuro:
> hacer checkout de la rama **`feature/perf-medicion-baseline`** en el commit
> `e839cbe` o posterior (el canal de recolección nativo —`src/core/perf/snapshotSink.ts`,
> tests y runbook en `docs/PERFORMANCE-BASELINE.md` §nativo— ya quedó implementado
> y commiteado en esta rama). Lo que faltará entonces: toolchain (Java 17 +
> Android SDK/ADB), proyecto `android/` (decidir EAS vs prebuild commiteado) y
> la corrida con el runbook documentado. Las conclusiones web (v1/v2/v3) no
> dependen de esta fase.

Esta fase debe ejecutarse inmediatamente después del baseline web y antes de
aceptar optimizaciones nativas. Está bloqueada en el entorno actual porque no
hay Java 17, Android SDK/ADB, proyecto `android/` ni `eas.json`.

### Tareas

- [x] Definir el perfil de build release/profileable y documentar si se usará EAS o prebuild local. (Parcial: comando definido y runbook en `docs/PERFORMANCE-BASELINE.md` §nativo — release local con `expo run:android --variant release` + env inline; falta toolchain para elegir EAS vs prebuild commiteado.)
- [x] Canal de recolección implementado: `src/core/perf/snapshotSink.ts` (+ `.web.ts` no-op, par dual) — nativo escribe `Documents/perf-snapshots/<gameId>-<startedAt>.json` y emite chunks de consola `PERF_SNAPSHOT <gameId> <i>/<n> <chunk>` re-ensamblables (logcat: el canal viable en release, que no es debuggable para `adb pull`). 5 tests unitarios.
- [ ] Definir un Android lento soportado y un dispositivo de alta frecuencia si se validará 120 Hz.
- [ ] Ejecutar la misma matriz de escenarios que en web donde el input sea comparable.
- [ ] Capturar System Trace con Android Studio/Perfetto.
- [ ] Separar JS Thread, UI Thread, Native Modules Thread y RenderThread.
- [ ] Capturar memoria JS/Hermes y memoria nativa.
- [ ] Validar `_getAnimationTimestamp()` contra `performance.now()`.

### Criterios de aceptación

- [ ] Existe un artifact de baseline Android por dispositivo y escenario.
- [ ] El build y el hardware están identificados en el snapshot.
- [ ] Las conclusiones nativas no se derivan de la medición web instrumentada.

## 11. Fase 2: WakWak

**Orden recomendado:** mayor frecuencia de ejecución. La prioridad de retorno se
confirma solo después del baseline.

### 11.0 Estado de partida (2026-09-11)

Baselines v1/v2/v3: `uiFrame.maxDt` en el piso teórico a 60 Hz, 0 frames
largos/descartados en nivel 1, 8 y pausa. Eso descarta jank en la máquina de
medición, pero NO prueba eficiencia. Reporte de usuario real: en **web móvil**
el juego fluye pero con "pausas" o micro-bloqueos irregulares cada cierto
tiempo. Hipótesis de trabajo: GC por asignaciones por frame/step, ráfagas de
steps tras un stall (guard de 8 en `advance`, `rules.ts:352`), o costo en el
main thread (en web no hay UI thread separado). Por eso esta fase es
**profiling completo primero, cambios después**: ningún ítem I-WW se
implementa sin una traza D-WW que lo justifique.

Hueco ciego conocido: WakWak no tiene `PerfProfiler` ni contadores
`renderFreq` — del lado React del juego más caliente no hay ninguna señal en
los baselines. D-WW0 cierra ese hueco antes de medir.

Validación de los claims de la auditoría contra el código actual (2026-09-11):

| Claim | Veredicto | Nota |
|---|---|---|
| F-01 publica Zustand 60×/s | Confirmado (estructura) | `advance` siempre retorna objeto nuevo (`rules.ts:359`) → `set()` por frame; pero los selectores estrechos evitan re-renders. Costo = asignaciones + notificación a suscriptores, a medir. |
| `floatPos(robot)` recalculado por drone | Obsoleto | Ya hoisteado a `robotPosNow` (`rules.ts:529`). |
| F-02 escrituras SV incondicionales | Confirmado (estructura) | `present()` escribe sin comparar; ver observación en I-WW (posible redundancia con `valueSetter`). |
| `threatsOf()` en power descartado | Confirmado, costo menor | Corre sobre el estado pre-tick (1 frame de staleness, irrelevante para feel). |
| F-04 loop/idles vivos en pausa/fin | Confirmado, mayor leverage | El rAF nunca se suspende; `worldSnapshot`+`present` corren en pausa (`WakWakScreen.tsx:398-402`); los `withRepeat` idle ignoran `paused`/`status`. |
| F-05 reconcilia muros+corral+dinámicos | Parcialmente obsoleto | Muros/corral ya están en `MazeStaticLayer` memoizado; solo los edibles (19×21 = 399 celdas) se reconstruyen, y solo en pickups discretos. Falta medir el commit. |
| V-WW reiniciar `last` al reanudar | Ya satisfecho | `last = now` se actualiza cada frame aun en pausa (`:375`); queda como assert de regresión. |

### D-WW: diagnóstico (profiling completo primero)

Orden de ejecución — instrumentar, medir E2E, perfilar manual con throttle,
auditar suscriptores, y recién entonces decidir:

- [x] **D-WW0 instrumentación render-side + engine, gated por `EXPO_PUBLIC_PERF_METRICS`**: montar `PerfProfiler` en `WakWakScreen` (para `render.board` en futuros baselines profiling) y/o `renderFreq` en `MazeLayer`/`Hud`; timers en `advance`, `worldSnapshot`, `present`, `threatsOf` + `tick` (advance+publish); contador de `set()` en `tick()` (publicaciones por callback rAF). Tests unitarios. No toca lógica del juego. Restricción de arquitectura: los engines son funciones puras y no importan performance — los timers del engine se miden en el call-site (pantalla/store) o vía instrumentación de tests (precedente Fase 3), nunca con imports en `rules.ts`. (Implementado 2026-09-11: `perfSample`/`perfCount` en core, stats planos en el store + flush al desmontar, timers `loop.*`, `PerfProfiler` id `maze-pickup`, `renderFreq:maze`/`renderFreq:hud`; 354 tests verdes; smoke wakwak 3/3 con claves verificadas en el snapshot. Nota: sin timer per-`step` — `advance` lo cubre (1 step/frame normal; ráfagas visibles en su duración); per-step solo vía tests si hiciera falta.)
- [ ] Medir publicaciones Zustand por callback rAF y separar cambios de `remainderMs` de cambios semánticos. (Cubierto por el contador de D-WW0; incluye el caso `elapsedMs`-only.)
- [ ] Medir `advance`, `worldSnapshot`, `present`, `threatsOf` y el cálculo repetido de `floatPos(robot)`. (Nota: `floatPos(robot)` ya está hoisteado —`rules.ts:529`—; el timer lo confirma en vez de asumirlo.)
- [ ] **D-WW1 corrida E2E solo-wakwak (`-g "wakwak"`) en ambos perfiles** (estándar + profiling) con protocolo completo, comparada contra v1/v2/v3. Requiere D-WW0 para tener señal del lado React.
- [ ] **D-WW2 throttle automatizado de CPU, rate 4×** (motivado por hitches reportados en móvil real; ref: artículo Medium archivado en `borrame/Medium.mhtml` + docs CDP/Playwright): nueva env `PERF_THROTTLE=4` en `performance.web.spec.ts` — tras `ready`, abrir CDPSession y `Emulation.setCPUThrottlingRate {rate: 4}`; reset a 1 al salir. `e2e.mjs` ya hereda el env, el comando es el mismo + 1 variable. Mide `loop.*`, `jsStall`, `render.board`, `renderFreq` bajo throttle con el mismo protocolo (3×10). Reglas: **throttled solo se compara contra throttled** (nunca contra D-WW1); el presupuesto de stall se reinterpreta (100 ms bajo 4× ≈ 25 ms reales); los conteos por corrida no son comparables (menos ticks por ventana). Bite-check obligatorio: `loop.tick` p95Med debe escalar ~×4 vs D-WW1; si no escala, investigar channel/headless antes de concluir.
- [ ] **D-WW2-B1 atribución por función con dominio `Profiler` (desde el inicio)**: 1 captura por escenario bajo throttle (`Profiler.enable` → `setSamplingInterval` → `start`/`stop` en la ventana de juego) guardada como artifact versionado. Analizar hot spots del commit de pickup + `deoptReason` por nodo (¿desoptimizaciones en el hot path?). **Prohibido `startPreciseCoverage`** (impide código optimizado y contamina la medición).
- [ ] **D-WW2 heap-delta (en alcance)**: `Performance.enable` + `getMetrics` (`JSHeapUsedSize`) antes/después de cada corrida, volcado como contador — proxy barato del churn de asignaciones (hipótesis GC).
- [ ] D-WW2 manual con DevTools (throttle 4×, `Animation Frame Fired`, Bottom-Up, `--trace-gc`) solo si A+B1 no cierran la atribución. B2 (trace completo `.json` a Perfetto vía `browser.startTracing`) queda como opción posterior a considerar, no en este alcance.
- [ ] Comparar juego activo, pausa, interstitial, overlay final y niveles 1/8. (Incluye costo CPU por frame en pausa —los baselines solo muestran frames, no trabajo desperdiciado— y nivel 1 vs 8.)
- [ ] **D-WW3 auditoría de suscriptores**: quién consume qué del store por frame (selectores actuales: score/lives/level/batteries/supers/bonus/status/paused/runLevel; nadie consume `elapsedMs`/progreso). Decide entre gate de publicación en `tick()` (sin tocar el engine) vs cambio de ownership (plan B).
- [ ] **D-WW4 commit de pickup**: medir el render/commit de `MazeLayer` al recoger (con `render.board`/`renderFreq` de D-WW0). Confirma o descarta F-05 antes de tocar capas.
- [ ] Decidir ownership de `remainderMs` antes de cambiar el store. (Requiere aprobación explícita; evaluar primero el gate en `tick()` según D-WW3.)

Notas técnicas D-WW2: Playwright ya lanza Chromium con los flags anti-background (`--disable-background-timer-throttling`, `--disable-backgrounding-occluded-windows`, `--disable-renderer-backgrounding`) — nada que configurar y el rAF headless de los baselines es sano. El throttle es simulación (ralentiza el main thread de forma uniforme; no emula GPU/memoria/thermal de un móvil) y lleva esa etiqueta en los MANIFEST. Efecto lateral favorable: bajo 4×, el clamp de 100 ms + guard de 8 steps fuerza ráfagas post-stall — justo la hipótesis a reproducir.

### I-WW: implementación condicional (ningún ítem sin traza D-WW que lo justifique)

- [ ] Mantener `advance()` aislado y probar equivalencia con seeds antes de modificar el canal de publicación.
- [ ] Si el diagnóstico lo justifica, separar el acumulador de `remainderMs` o cambiar el contrato de forma explícita.
- [ ] Comparar la pose actual con la última pose presentada y omitir shared values sin cambios. (Observación: posiblemente **redundante** — `valueSetter` de Reanimated ya omite escrituras al mismo valor primitivo sin notificar listeners/mappers, en nativo y en web; y en juego activo tx/ty cambian cada frame de todos modos. Solo implementar si D-WW demuestra costo en la llamada misma.)
- [ ] Calcular `robotPos` una sola vez por paso de colisión. (Observación: posiblemente **irrelevante** — ya hoisteado en `rules.ts:529`; el timer de D-WW lo confirma y en ese caso el ítem se cierra sin cambios.)
- [ ] Omitir `threatsOf()` durante power si el resultado funcional sigue siendo equivalente. (Gate de una línea; D-WW1: ≤0.1 ms p95 — ganancia probablemente inmedible, mantener al final de la cola.)
- [ ] Separar capas estáticas y dinámicas del laberinto solo si el commit de pickup supera el presupuesto. (Observación: muros/corral ya separados en `MazeStaticLayer` memoizado; solo D-WW4 puede justificar más.)
- [ ] Suspender loop/`present` en pausa/fin/interstitial si D-WW muestra trabajo desperdiciado (precedente existente: `deathFrozen` ya congela `present`). Incluye gates de idle `withRepeat` por `paused`/`status` + reduced motion.
- [ ] Gate de publicación en `tick()` (omitir `set()` si solo cambió `remainderMs`/`elapsedMs` sin eventos) si D-WW3 confirma que nadie consume progreso por frame. Alternativa de menor riesgo al cambio de ownership.
- [ ] Clones same-ref en `step()` (drones sin cambios retornan la misma referencia) si D-WW1/D-WW2 muestran presión de GC; preservando determinismo y tests.

### V-WW: validación

- [ ] Comparar exactamente los escenarios baseline/post-fix.
- [ ] Verificar score, eventos, vidas, niveles y estados terminales con los mismos seeds.
- [ ] Medir que pausa/fin no mantengan callbacks rAF continuos salvo trabajo pendiente.
- [ ] Reiniciar el reloj `last` al reanudar y comprobar que no aparece un `dt` artificial. (Nota: ya satisfecho por construcción —`last` se actualiza cada frame aun en pausa—; queda como assert de regresión.)
- [ ] Recuperación post-stall: tras un stall, verificar que la ráfaga de steps (guard 8, clamp 100 ms) no produce jank en cascada.
- [ ] Detener/reanudar idle animations según `status`, `paused` y reduced motion.

### Criterios de aceptación WakWak

- [ ] Seeds E2E conservan score, eventos, vidas y niveles.
- [ ] Pausar detiene la simulación y no mantiene trabajo continuo innecesario.
- [ ] La decisión sobre `remainderMs` conserva la equivalencia funcional y temporal del engine.
- [ ] `present()` reduce escrituras por frame solo si el baseline demuestra que son relevantes.
- [ ] La mejora cumple la regla comparativa de la sección 5 en web y, cuando esté disponible, release Android.
- [ ] Si no existe mejora significativa, se documenta la decisión de no migrar a Skia.
- [ ] Si ningún I-WW cruza la regla §5, se documenta la decisión de no-cambio con las trazas D-WW como evidencia.

## 12. Fase 3: Damas

### D-DM: diagnóstico

- [ ] Ejecutar fixtures `damas:perf-kings` y `damas:perf-branching` creadas en Fase 0A.
- [ ] Medir `movablePieceIds`, `legalMovesForPiece`, `applyMove` y `gameOutcome` por separado.
- [ ] Registrar cantidad de ramas y movimientos generados mediante instrumentación de tests, no importando performance en `engine/rules.ts`.
- [ ] Medir latencia desde `onDragEnd` hasta actualización visual.

### I-DM: implementación condicional

- [ ] Definir una representación de movimientos legales para un `board` y `turn` concretos.
- [ ] Calcular una vez los movimientos por pieza al cambiar el turno/tablero.
- [ ] Reutilizar el resultado para `movablePieceIds`, drag start y destinos.
- [ ] Evitar repetir `hasCapture()` global para cada ficha cuando el resultado ya está disponible.
- [ ] Mantener la validación canónica en `applyMove()`.

### V-DM: validación

- [ ] Medir pointer-down a `onDragStart` con 24 fichas montadas.
- [ ] Medir coste de cambiar `enabled` al cambiar el turno.
- [ ] No reemplazar `GestureDetector` sin evidencia de que el hit-testing sea el cuello de botella.
- [ ] Comparar legalidad, destinos y latencia contra el baseline.

### Criterios de aceptación Damas

- [ ] Misma legalidad en todos los tests unitarios.
- [ ] Misma selección de destinos en E2E.
- [ ] Sin regresión en captura obligatoria, multi-salto o coronación.
- [ ] La reducción de ejecuciones redundantes supera el umbral definido en la sección 5 o se documenta como inconclusa.

## 13. Fase 4: Solitario

### D-SL: diagnóstico

- [ ] Medir render de `Pile`, `PileCard` y `PlayingCard` por tipo de pila.
- [ ] Medir validación espejo de pantalla y validación del store.
- [ ] Medir heap JS con 10, 50 y 100 movimientos usando Chrome DevTools en web y Android Studio/Perfetto en nativo.
- [ ] Comparar undo apagado/encendido.
- [ ] Medir `JSON.stringify`, tamaño del payload, tiempo de escritura y tiempo hasta restore.
- [ ] Medir unmount/cierre durante la ventana de debounce.

### I-SL: implementación condicional

- [ ] Precalcular offsets de cada columna una vez por cambio de tableau/layout si el render lo justifica.
- [ ] Precalcular validez de secuencias visibles por columna si el coste supera el umbral.
- [ ] Evaluar si `dragKey` puede vivir parcialmente en shared values sin degradar accesibilidad ni targets.
- [ ] Evaluar transporte de un resultado canónico asociado a una versión del estado.
- [ ] No eliminar la validación final del store.
- [ ] Evaluar `requestIdleCallback` en web y una cola nativa solo si la medición demuestra jank.
- [ ] Evaluar snapshots diferenciales o comandos inversos solo si el crecimiento de undo es significativo.

### V-SL: validación

- [ ] Comparar render, drag, validación, undo y persistencia con el mismo escenario.
- [ ] Mantener drag válido/ilegal, auto-move, doble tap y restore funcionales.
- [ ] Documentar una ventana de pérdida de persistencia inferior a 300 ms si no se implementa flush inmediato.

### Criterios de aceptación Solitario

- [ ] Drag válido/ilegal mantiene el resultado actual.
- [ ] Auto-move y doble tap mantienen su comportamiento.
- [ ] Undo conserva las reglas y el score.
- [ ] Recarga restaura el estado después de la ventana documentada de persistencia.
- [ ] No existe spike de JS que cruce el presupuesto en el escenario de persistencia.

## 14. Fase 5: Memorice y componentes compartidos

- [ ] Instrumentar commits de Memorice antes de cambiarlo.
- [ ] Estabilizar callback y evaluar `React.memo(Card)`.
- [ ] Estabilizar también el objeto de estilos por carta; `memo` no aporta si `onPress` o `style` cambian en cada render.
- [ ] Comparar cantidad de Cards ejecutadas por flip.
- [ ] Mantener la animación Reanimated y `scheduleOnRN` del cruce de 90 grados.
- [ ] Evaluar el impacto de `expo-haptics` en Atlas; no crear un wrapper platform-specific sin evidencia.
- [ ] Mantener `PressableScale` fuera de superficies de alta frecuencia.
- [ ] Mantener `useContainerSize`, `overlayAnimation` y layout responsive actuales.

## 15. Fase 6: startup, bundle y recursos

### Bundle

- [ ] Ejecutar Expo Atlas en baseline y post-cambio.
- [ ] Comparar el bundle contra el presupuesto antes de modificar `GameDefinition` o `game-registry`.
- [ ] Si el presupuesto se supera, aprobar ADR para separar metadatos del registro y loaders; considerar fallback síncrono nativo.
- [ ] Evaluar imports diferidos por ruta en web solo después de Atlas.
- [ ] Activar async routes solo después de confirmar compatibilidad con el hosting estático.
- [ ] Añadir E2E de navegación directa y reload de cada `/juego/<id>` si se introduce lazy loading.
- [ ] Establecer presupuesto de JS raw/gzip y chunks iniciales.

### Estado global y récords

- [ ] Unificar hidratación en un único flujo single-flight.
- [ ] Cachear preferencias en memoria después de la primera lectura.
- [ ] Cachear récords y invalidarlos tras `recordsRepository.save()`.
- [ ] Evitar consulta individual de récord por tarjeta si el número de juegos crece.
- [ ] Medir apertura/migración de SQLite y `JSON.parse`/`sort` web antes de elegir cache o API async.
- [ ] Si se modifica un repositorio de persistencia, editar siempre sus pares `.ts` y `.web.ts`.

### Audio

- [ ] Inventariar primero qué sonidos existen y se usan por juego.
- [ ] Precalentar players solo donde el cold-start supere el umbral.
- [ ] Medir primer play y play caliente.
- [ ] Definir un evento lifecycle concreto para liberar players; no asumir que existe un evento fiable de "salir de la aplicación".
- [ ] Configurar explícitamente `enableBackgroundPlayback` y `recordAudioAndroid` según el requisito real del producto.
- [ ] Verificar permisos, servicio foreground y tamaño del build generado.
- [ ] No declarar mejora de latencia audible basándose solo en `handlerToPlay`.

## 16. Fase 7: revalidación nativa y feel-check

El entorno actual no tiene Java 17 ni Android SDK/ADB. La baseline Android de la
Fase 1N debe ejecutarse antes de aceptar optimizaciones; esta fase repite la
matriz después de los cambios aprobados.

- [ ] Usar el mismo perfil, dispositivos, fixtures y escenarios de la Fase 1N.
- [ ] Capturar System Trace con Android Studio/Perfetto.
- [ ] Separar JS Thread, UI Thread, Native Modules Thread y RenderThread.
- [ ] Capturar memoria JS/Hermes y memoria nativa.
- [ ] Medir WakWak activo, pausa, pickup y combo.
- [ ] Medir drag largo de Solitario y Damas.
- [ ] Verificar audio cold-start y lifecycle.
- [ ] Validar los relojes de `_getAnimationTimestamp()` y `performance.now()`.
- [ ] Ejecutar feel-check de velocity handoff, interrupción de spring y haptics.
- [ ] Comparar cinco lotes post-fix contra la baseline, sin mezclar builds instrumentados y release.

## 17. CI y regression gates

### Verificación estándar

- [ ] `pnpm typecheck`.
- [ ] `pnpm test`.
- [ ] `node scripts/e2e.mjs`.
- [ ] Export web reproducible.
- [ ] Validación visual puntual cuando corresponda.

### Gates propuestos

- [ ] Gate inicial de funcionalidad: typecheck, unit tests y E2E.
- [ ] Instalar Chromium con `pnpm exec playwright install chromium` en el job E2E.
- [ ] Publicar report/trace como artifact cuando falle Playwright.
- [ ] Crear spec separado que exporte snapshots de performance versionados.
- [ ] Reporte informativo de bundle Atlas en pull requests relevantes.
- [ ] Reporte informativo de performance web con baseline estable.
- [ ] Gate nativo separado para release Android, no simulado con Jest/web.
- [ ] Umbrales hard-fail solo después de disponer de varias corridas y hardware estable.

## 18. Riesgos y rollback

| Riesgo | Mitigación |
|---|---|
| El estado transitorio diverge del contrato del engine | Tests de seeds, score/eventos y comparación frame a frame |
| Cache de movimientos legales queda obsoleta | Invalidar por referencia/version de tablero y mantener validación final |
| Persistencia diferida pierde una jugada ante cierre abrupto | Documentar ventana de pérdida aceptable y flush al background/unmount |
| Lazy loading rompe deep links web | E2E de rutas directas y fallback de carga |
| Feature flags Reanimated alteran hit testing | Activar solo en build experimental y probar Gesture Handler |
| Liberar audio provoca cold-start posterior | Política de cache por juego y medición de primer play |
| React Compiler cambia comportamiento de worklets | Healthcheck, adopción incremental y exclusión explícita si es necesario |
| Profiler/metrics alteran el resultado medido | Separar build instrumentado de release y etiquetar snapshots |
| `TimerStats.samples` crece sin límite | Reservoir/histograma acotado y cleanup al cerrar sesión |
| Web no representa UI thread/GPU nativos | Etiquetar métricas web como browser/main y exigir baseline Android |
| `_getAnimationTimestamp()` no es comparable en Android | Validación explícita antes de usar umbrales absolutos |
| Cache de récords/preferencias queda obsoleta | Invalidation tras save/clear y tests de consistencia |
| Reutilización de `dist` o storage contamina escenarios | Puerto aislado, export `--clear`, storage limpio por run |
| Repositorios web/nativo divergen | Cambiar siempre los dos pares y ejecutar tests de ambos |

Cada cambio de performance debe poder revertirse sin modificar reglas de juego ni formato persistido.

## 19. Notas/hallazgos

- Hallazgo: los resultados de `docs/adr/0011-metricas-performance.md` son históricos, dev web y no sustituyen la baseline de este plan.
- Hallazgo: el comentario `PLAN 1.6` en gestos y la referencia `Fase 2` en audio son numeración histórica y deben actualizarse junto con la implementación.
- Hallazgo: la pureza referencial de WakWak no está garantizada mientras `GameState.rng` sea una clausura mutable.
- Hallazgo: `uiFrames.dropped` requiere una semántica nueva, diferenciando evento de frame largo de frames estimados omitidos. (Resuelto en Fase 0B: `uiFrames.longFrameEvents` + `uiFrames.estimatedDroppedFrames` + `uiFrame.maxDt` por flush.)
- Hallazgo (Fase 0A): el layout de `perf-kings` original atrapaba a los peones del jugador 2 en las filas 6-7 (p2 avanza hacia abajo) → `gameOutcome` declaraba fin inmediato y el modal bloqueaba el drag. Rediseñado con p1 en filas 2-3 y p2 en filas 5-6; el test de fixture ahora aserta `gameOutcome(board, 2)` también no-terminado. Lección: los fixtures de damas deben validar la movilidad de AMBOS jugadores, no solo del que arrastra.
- Hallazgo (Fase 1): con seed E2E, Solitario deshabilita el auto-resume por diseño (`initialSeed ? null : get()` + `clear`) → el escenario `solitario-persist` corre SIN seed: la restauración solo es medible en partida normal.
- Hallazgo (Fase 1): la lectura del snapshot exige salir por SPA (`salir-<id>`), no con `goto`: el `requestIdleCallback` de la escritura muere si la página se descarga. Un snapshot sobrescribe al anterior: en escenarios con reload (persist), el snapshot persistido es el de la sesión POST-reload (lado restore).
- Hallazgo (Fase 1): la duración de render (`render.board` via `<Profiler>`/`onRender`) NO está disponible en el production build ESTÁNDAR (React elimina su instrumentación de Profiler en prod): el timer nunca aparece en los snapshots del baseline instrumentado. Obtenerla exige un **profiling build específico** (React con profiling activado): introduciría overhead y debe tratarse como **variante de medición aparte, no como build de producción representativo del UX real** (corrige la conclusión inicial de que "no puede existir" — sí puede, en ese build dedicado). Corolario histórico: explica por qué los números de ADR 0011 eran dev-only.
- Decisión (Fase 1): los contadores de renders se renombran a **`renderFreq:*`** con semántica de FRECUENCIA (cuántas veces se renderizó un componente), explícitamente separada de la duración (`render.board`). Frecuencia ≠ performance de render: 100 renders de 2ms pueden ser mejores que 20 renders de 10ms. En el perfil instrumentado estándar, `renderFreq:*` es la señal de render disponible; la duración queda para el profiling build.
- Hallazgo (Fase 1): Memorice registra sesión (begin/end) pero aún no tiene métricas internas → su snapshot queda vacío hasta instrumentar renders en Fase 5.
- Hallazgo (Fase 1): el timeout fijo del spec (300s) cortaba el protocolo completo a mitad de las corridas: cada test procesa 155 corridas × ~6-20s ≈ 15-25 min por escenario. Fix: timeout dinámico `(WARMUP + LOTS×RUNS) × 30s + margen`; las corridas escritas antes del corte eran válidas (datos truncados, no corrompidos).
- Hallazgo (Fase 1): tras el commit de una captura, la ficha puede estar desmontada un instante durante la reconciliación de RNW → `boundingBox()` devuelve null sin reintentar. Fix: `stableBox()` con espera de visibilidad + 5 reintentos en `dragByLabel`.
- Hallazgo (Fase 1): e2e.mjs + `CI=1` no combinan con el spec de perf (la config de Playwright intenta levantar su propio server y colisiona con el del orquestador): correr el baseline SIN `CI=1`.
- **Baseline v1 capturado (2026-09-10, commit `b37eaf8`, 11 escenarios × 150 corridas, suite 11/11 en 2.4h)**: artifacts versionados en un único archivo comprimido (`xz -9e`, 24.5KB) [`baselines/2026-09-10-b37eaf8.tar.xz`] + MANIFEST legible en [`baselines/MANIFEST-2026-09-10-b37eaf8.md`](baselines/MANIFEST-2026-09-10-b37eaf8.md). Es la referencia de la regla comparativa §5 (los `tmp/perf/` siguen gitignored; esta copia es una decisión deliberada de versionado).
- Hallazgo (baseline v1): outlier ambiental en `wakwak-active-8#154` (wall=101.8s, 24 stalls, maxDt=1383ms — evento de sistema de la máquina). La mediana de p95 es inmune (16.8ms en las 149 corridas limpias); solo el p99Max del summary queda inflado. Documentado en el MANIFEST; no se alteran los artifacts.
- Resultado clave del baseline v1: drag/audio excelentes (drag.handler p95 0.4-0.8ms en solitario y damas; audio 0.3-0.4ms); WakWak en el piso teórico a 60Hz (uiFrame.maxDt p95=16.8ms, 0 frames largos/descartados); memoización efectiva (renderFreq bajo). No hay señales de jank que corregir en los flujos medidos — los fixes de fases siguientes se priorizan con el profiling build.
- Decisión (Fase 1): la variante profiling build se implementa vía **alias de Metro** (nuevo `metro.config.js`, gated por `EXPO_PUBLIC_PERF_PROFILING=1`): `react-dom` y `react-dom/client` → `react-dom/profiling`. Validado con smoke test: `render.board` aparece (p95 4.4ms en solitario-drag, 2 corridas) y el build estándar queda intacto (smoke damas-branching sin profiling, typecheck + 344 unit).
- Hallazgo (profiling build): el cjs con profiling (`react-dom-profiling.profiling.js`) hace `require("react-dom")` para leer `__DOM_INTERNALS_*`; si el alias re-mapea esa dependencia a sí mismo queda un **ciclo de Metro con exports parciales** → `Cannot read properties of undefined (reading 'd')` en runtime. Fix: excluir del alias los requires con origen en `react-dom/cjs/` (via `context.originModulePath`) — los internals vienen del índice estándar de react-dom.
- Hallazgo (profiling build): el alias debe aplicarse **solo en entornos client** (`context.customResolverOptions.environment` ≠ 'node'/'react-server'); en el bundle SSR de router-server (SSG) el profiling bundle rompe el render estático.
- Hallazgo (no-bug): React #418 (hydration text mismatch en export estático) es **preexistente del build estándar** (reproducido sin profiling); React cae a client render y la app funciona. No lo introduce el profiling build; tratarlo es deuda separada.
- Hallazgo (Fase 1N, web research + verificado en node_modules): el profiling nativo (`render.board`) tiene variante en RN 0.86.3 (`ReactFabric-profiling.js`, ~425KB vs prod) pero el swap manual del shim está roto en RN reciente ([facebook/react-native#52675](https://github.com/facebook/react-native/issues/52675) — `_jsxDEV is not a function`). Candidato: `@callstack/inspector` (`withInspector(config, enabled)` en metro.config.js) — habilita `React.Profiler`/`onRender` en release builds. A validar en Fase 1N con toolchain Android.
- Hallazgo (Fase 1N): en builds release Android la app no es debuggable → `adb pull` del storage interno NO funciona; por eso el sink nativo emite los snapshots también por consola en chunks re-ensamblables (`PERF_SNAPSHOT`, chunk 3500 < límite de ~4KB de logcat): ese es el canal viable en release. Runbook en `docs/PERFORMANCE-BASELINE.md` §nativo.
- **Baseline v2 capturado (2026-09-10/11, commit `e839cbe`)**: versionado como [`baselines/2026-09-10-e839cbe.tar.xz`] + [`baselines/MANIFEST-2026-09-10-e839cbe.md`](baselines/MANIFEST-2026-09-10-e839cbe.md). Hallazgo de revisión: la corrida se ejecutó SIN `EXPO_PUBLIC_PERF_PROFILING=1` (envelopes `instrumented`, 0/1650 corridas con `render.board`) — es una réplica válida del perfil estándar (v1→v2 confirma reproducibilidad: medianas idénticas, el outlier de v1 no se repitió) pero NO la variante profiling; esa corrida (para `render.board`) queda pendiente.
- **Baseline v3 capturado (2026-09-11, commit `300b9f8`)**: primera corrida profiling completa, versionada como [`baselines/2026-09-11-300b9f8-profiling.tar.xz`] + [`baselines/MANIFEST-2026-09-11-300b9f8-profiling.md`](baselines/MANIFEST-2026-09-11-300b9f8-profiling.md). `render.board` medido en 900/900 corridas de solitario+damas (drag 3.0ms, damas 4.6–7.0ms, persist 12.9ms montaje, endgame 20.0ms — candidato a revisión en fase solitario). Handlers/audio/frames idénticos al perfil estándar: el overhead del profiling no distorsiona el resto de métricas. Sin outliers.
- **Baseline D-WW1 capturado (2026-09-11, commit `04d8a2b`, solo WakWak, 3 escenarios × 30 corridas)**: versionado como [`baselines/2026-09-11-04d8a2b-wakwak.tar.xz`] + profiling [`baselines/2026-09-11-04d8a2b-wakwak-profiling.tar.xz`] (MANIFEST respectivos). Hallazgos: publicación Zustand 100% (calls == published en 180/180 corridas); engine frío (`loop.*` p95Med 0.1 ms = piso de resolución, nivel 1 = 8); **primer `render.board` de WakWak: commit de pickup p95 ~7.5 ms, p99 11–16 ms** — principal sospechoso de los hitches en móvil real (D-WW4 respondido afirmativamente); pausa con ~93 frames de solo-`present` por episodio y `renderFreq:maze=1` (el memo aguanta). Protocolo reducido: solo `p95Med`/contadores comparables, `p99Max` no.
- Decisión pendiente: `remainderMs`, lazy loading, persistencia y background audio requieren aprobación antes de implementar.
- Decisión tomada (Fase 0B, dentro del alcance de medición): percentiles nearest-rank; buffer circular de 512 muestras (determinista, sin reservoir aleatorio); sesión mutable se libera en `endPerfSession`; monitor UI queda limitado a WakWak hasta que el baseline justifique extenderlo; `PerfProfiler` gatea el React Profiler sin hooks condicionales.

## 20. Actualización documental de cierre

- [ ] Migrar lecciones reproducibles a `docs/GOTCHAS.md`.
- [ ] Migrar decisiones transversales aprobadas a ADRs.
- [ ] Actualizar `src/games/<id>/README.md` para los detalles específicos de cada juego.
- [ ] Actualizar `docs/ROADMAP.md` para deuda pendiente y validación Android.
- [ ] Actualizar `docs/ARCHITECTURE.md` y `docs/UI-UX.md` si cambian ownership de estado, render o motion.
- [ ] Enlazar `docs/PERFORMANCE-AUDIT.md` desde el documento definitivo que corresponda.
- [ ] Eliminar este PLAN solo después de la verificación completa.

## 21. Criterios de cierre

El requerimiento de performance podrá considerarse cerrado cuando:

- [ ] Exista baseline y post-fix con protocolo versionado.
- [ ] WakWak tenga mediciones separadas de simulación, presentación y UI.
- [ ] Damas tenga medición de reglas en posiciones normales y complejas.
- [ ] Solitario tenga medición de drag, render, undo y persistencia.
- [ ] Memorice tenga una decisión basada en su coste real.
- [ ] Exista bundle reportado para web.
- [ ] Exista validación de release Android.
- [ ] Los seeds E2E mantengan resultados funcionales.
- [ ] CI ejecute al menos los gates funcionales completos.
- [ ] Los hallazgos técnicos reproducibles se migren a `docs/GOTCHAS.md`.
- [ ] Las decisiones transversales se documenten en ADRs.
- [ ] La deuda restante quede en `docs/ROADMAP.md`.
- [ ] Este `PLAN-PERFORMANCE.md` se elimine en el cierre final, siguiendo el flujo de `AGENTS.md`.
- [ ] Ejecutar la verificación estándar en este orden: `pnpm typecheck` → `pnpm test` → `node scripts/e2e.mjs`.
