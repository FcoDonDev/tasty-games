# Baseline de performance (web)

Harness de medición de performance de la aplicación. 
Diagnostica, mas no reemplaza la verificación funcional: `pnpm e2e:web`.

## Comando

```bash
PERF_BASELINE=1 PERF_WARMUP=5 PERF_LOTS=5 PERF_RUNS=30 \
node scripts/e2e.mjs -- src/core/__e2e__/performance.web.spec.ts
```

- El spec está condicionado: sin `PERF_BASELINE=1` los tests la omiten saltean (la suite funcional estándar nunca los corre).
- **`PERF_PROFILE`** (default `instrumented-profiling`): el orquestador deriva de aquí los envs de export (`EXPO_PUBLIC_PERF_METRICS=1` + `EXPO_PUBLIC_PERF_PROFILING=1`); no hay que escribirlos a mano. `PERF_PROFILE=instrumented` corre el build estándar (sin `render.board`).
- **No combinar con `CI=1`**: la config de Playwright levantaría su propio server y colisionaría con el del orquestador.
- Duración con los defaults: ~15-25 min por escenario (155 corridas) → **3-4 h en total**. Correr en máquina idle.

## Perfil por defecto y rutas de artifacts

Con `PERF_BASELINE=1` el default es **`instrumented-profiling`** (decisión
2026-09-14): es el perfil con la señal más completa (`render.board` + resto de
timers), así que la corrida de validación habitual solo necesita
`PERF_BASELINE=1`. Los otros 3 combos se corren solo cuando la comparación lo
exige (p.ej. replicar baselines históricos v1/v2 en build estándar). Cada
condición escribe en su propia ruta — **nunca mezclar corridas de
condiciones distintas**:

| `PERF_PROFILE` | `PERF_THROTTLE` | Ruta artifacts | `buildMode` del envelope |
|---|---|---|---|
| `instrumented-profiling` (default) | — | `tmp/perf-profiling/` | `instrumented-profiling` |
| `instrumented-profiling` (default) | `>1` | `tmp/perf-throttle-profiling/` | `instrumented-profiling` |
| `instrumented` | — | `tmp/perf/` | `instrumented` |
| `instrumented` | `>1` | `tmp/perf-throttle/` | `instrumented` |

(`tmp/perf/` conserva el build estándar por continuidad con los baselines v1/v2.)

## Variante profiling build (`render.board`)

El perfil por defecto (`instrumented-profiling`) ya la incluye. Para correr el
build estándar (sin `render.board`, comparable contra v1/v2) usar
`PERF_PROFILE=instrumented`. El alias lo activa `EXPO_PUBLIC_PERF_PROFILING=1`
en `metro.config.js` (`react-dom` → `react-dom/profiling`). Introduce overhead
(variante de medición, NO build de producción representativo — PLAN §2/§3/§9):

```bash
PERF_PROFILE=instrumented PERF_BASELINE=1 \
PERF_WARMUP=5 PERF_LOTS=5 PERF_RUNS=30 \
node scripts/e2e.mjs -- src/core/__e2e__/performance.web.spec.ts
```

- El envelope registra `buildMode: 'instrumented-profiling'` (trazabilidad en
  cada línea del `.jsonl`): nunca mezclar corridas de perfiles distintos.
- Con profiling, además de los timers estándar aparece `render.board`
  (duración p50/p95/p99/max del subtree del board por render).
- Siempre comparar profiling-vs-profiling; el build instrumentado estándar
  solo tiene la señal de frecuencia (`renderFreq:*`).

## Baseline nativo (Android — Fase 1N)

Estado: **canal de recolección implementado** (snapshotSink.ts); falta toolchain
(Java 17 + Android SDK/ADB en la máquina del operador) y proyecto nativo
(`expo prebuild` → `android/`). Nota clave: en builds **release** la app no es
debuggable y `adb pull` del storage interno NO funciona — por eso el canal
primario es el **logcat** (chunks re-ensamblables), implementado justamente para
el release.

### Ejecución de la prueba nativa (runbook)

```bash
# 0. Prerequisito (una vez): Java 17 + Android SDK/ADB + dispositivo/emulador
#    conectado y visible con `adb devices`.
# 1. Build release instrumentado (env inline; los seeds E2E exigen
#    EXPO_PUBLIC_E2E=1 al compilar):
EXPO_PUBLIC_PERF_METRICS=1 EXPO_PUBLIC_E2E=1 pnpm exec expo run:android --variant release
# 2. Antes de cada escenario, limpiar el buffer de logcat:
adb logcat -c
# 3. En el dispositivo: abrir el juego, correr el escenario determinista
#    (seed, ver tabla de escenarios web; usar el mismo orden y duración) y
#    salir con el botón Salir (dispara endPerfSession → escribe el snapshot).
# 4. Rescatar el snapshot del logcat:
adb logcat -d | grep "PERF_SNAPSHOT " > tmp/perf-native-<scenario>.log
# 5. Re-ensamblar a JSON (concatenar chunks ordenados por <i>/<n>):
node -e '
const fs=require("fs");
const lines=fs.readFileSync(process.argv[1],"utf8").split("\n").filter(l=>l.includes("PERF_SNAPSHOT "));
const byGame={};
for(const l of lines){const m=l.match(/PERF_SNAPSHOT (\S+) (\d+)\/(\d+) (.*)$/);if(!m)continue;(byGame[m[1]]??=[]).push(m);}
for(const[game,chunks]of Object.entries(byGame)){
  const full=chunks.sort((a,b)=>+a[2]-+b[2]).map(m=>m[4]).join("");
  const meta=chunks[0][0];
  console.log(game,"chunks=",chunks.length,"startedAt=",JSON.parse(full).startedAt);
  fs.writeFileSync(`tmp/perf-${game}-${JSON.parse(full).startedAt}.json`,full);
}' tmp/perf-native-<scenario>.log
# 6. Envolver en envelope (el operador agrega metadatos manualmente) y
#    comprimir con la corrida: mismo formato JSONL que la web
#    (platform:'android', viewport del dispositivo, commit, seed).
```

- El canal primario también escribe el archivo en
  `Documents/perf-snapshots/<gameId>-<startedAt>.json` — rescatable con
  `adb pull` solo en builds debuggable (dev build), no en release.
- **Profiling nativo** (`render.board`): React RN tiene variante profiling
  (`ReactFabric-profiling.js`, presente en RN 0.86.3) pero el swap manual del
  shim está roto en RN reciente (facebook/react-native#52675). Candidato a
  validar: `@callstack/inspector` (`withInspector(config, enabled)` en
  metro.config.js) — habilita `React.Profiler`/`onRender` en release. Pendiente
  de investigación y validación en Fase 1N (overhead = variante de medición).

## Variables del protocolo

| Variable | Default | Significado |
|---|---|---|
| `PERF_PROFILE` | `instrumented-profiling` | Perfil de build (`instrumented` \| `instrumented-profiling`); `e2e.mjs` deriva los envs de export |
| `PERF_WARMUP` | 1 | Corridas de calentamiento, descartadas (no se escriben) |
| `PERF_LOTS` | 1 | Lotes independientes de corridas medidas |
| `PERF_RUNS` | 3 | Corridas medidas por lote |
| `PERF_WINDOW_MS` | 4000 | Ventana de juego de los escenarios activos (WakWak) |
| `PERF_VIEWPORT` | `360x640` | `1280x900` para desktop |
| `E2E_PORT` | 4173 | Puerto del servidor |

## Resultados

La ruta base depende del perfil y del throttle (ver tabla "Perfil por defecto
y rutas de artifacts"; abajo `<dir>` = esa ruta):

| Ubicación | Contenido |
|---|---|
| `<dir>/<scenarioId>.jsonl` | 1 línea = 1 run medida, envelope versionado: `schemaVersion`, `scenarioId`, `runId`, `lot`, `seed`, `commit`, `viewport`, `wallMs` + snapshot completo (p50/p95/p99/max por timer) |
| `<dir>/summary.json` | Agregado por escenario: timers (mediana de p95, máximo de p99 entre runs) y contadores (mediana de valor por run) |
| `playwright-report/` / `test-results/` | Reporte HTML y trazas si algún test falla |

Ambos directorios son gitignored (artifacts locales, nunca commitearlos).

### Limpieza entre corridas

- **Corrida completa (los 11 escenarios): no hay que borrar nada manualmente.**
  Al iniciar cada escenario, el harness trunca su propio `<dir>/<scenarioId>.jsonl` y `summary.json` se sobrescribe al final de la corrida.
- **Corrida parcial (filtro `-g`): sí conviene borrar antes** (`rm -rf <dir>`):
  los `.jsonl` de los escenarios que NO corrieron quedan con datos de corridas anteriores y el `summary.json` los mezclaría con los frescos (contaminación).
- Cambiar de perfil/throttle **no requiere limpieza**: cada condición escribe
  en su propia ruta (ver tabla de perfiles).

## Métricas

Timers (percentiles nearest-rank sobre buffer circular de 512 muestras):

| Timer | Mide |
|---|---|
| `drag.handler` | Duración del handler JS del drag end (validación + commit) |
| `drag.ui2js` | Latencia UI thread → JS del drag end (sin validar ni spring) |
| `audio.handlerToPlay` | Latencia handler → primer play de sonido |
| `jsStall.dt` | Stalls del loop rAF de WakWak (JS thread) |
| `uiFrame.maxDt` | Peor dt de frames de UI thread por intervalo de flush |
| `render.board` | **Solo en builds con profiling de React** — ausente en el build instrumentado estándar |

Contadores: `renderFreq:*` (frecuencia de renders por componente — semántica de frecuencia, ≠ duración), `uiFrames.*` (longFrameEvents / estimatedDroppedFrames/ total), `jsStall.count`.

## Interpretación

1. **Regla comparativa**: aceptar una mejora solo si la mediana de los p95 mejora ≥10% entre baseline y post-fix y ninguna métrica crítica empeora >10%. Con 5 lotes × 30 runs; si la dispersión impide concluir, el resultado queda como inconcluso.
2. `uiFrame.maxDt ≈ 16.8ms` a 60 Hz es el piso (un frame por flush): no es jank.
3. Memorice reporta snapshot vacío hasta instrumentar sus renders (pendiente).
4. Limitaciones web: las métricas son browser/JS, no UI thread/GPU nativos; validación nativa = Fase 1N (pendiente).

## Glosario

| Término | Significado |
|---|---|
| **Jank** | Interrupción perceptible de la fluidez: la app no presenta un frame a tiempo (la imagen "se congela" o salta) por trabajo que excede el presupuesto del frame. |
| **Frame / dt** | Un frame es cada imagen que la app presenta (~16.7ms a 60 Hz). `dt` (delta time) es el tiempo transcurrido entre un frame y el siguiente: si `dt` supera el presupuesto, hubo un frame largo. |
| **rAF** | `requestAnimationFrame`: API del navegador que agenda una función para ejecutarse justo antes de dibujar el siguiente frame. El loop del juego WakWak corre sobre rAF: cada tick de simulación + presentación es un callback de rAF. Un **stall del loop rAF** = un callback que demoró demasiado (dt muy grande): señal de jank en el JS thread. |
| **JS thread / UI thread** | Dos hilos separados en React Native: el JS thread ejecuta la lógica (React, stores, handlers); el UI thread presenta los frames y ejecuta animaciones de Reanimated. En web ambos son "el navegador": por eso las métricas web se etiquetan como browser/JS, no como UI thread/GPU nativos. |
| **Máquina idle** | Equipo sin otra carga de trabajo (sin apps pesadas, sin builds, sin pestañas activas). Requisito del baseline: el CPU freón afecta `dt` y los tiempos, contaminando la comparación. |
| **Build instrumentado** | Build normal de producción al que se le añade nuestro código de medición (`EXPO_PUBLIC_PERF_METRICS=1`). Introduce un overhead mínimo, pero permite métricas reales; solo se compara contra otro build instrumentado. |
| **Profiling build** | Variante de build con la instrumentación de React Profiler activada. Mide la duración de renders, pero al costo de overhead adicional: es variante de medición, no representativa de la experiencia real. |
| **Warm-up / lote / run** | `warm-up`: corridas previas para estabilizar caches/compilación, descartadas. `lote`: grupo independiente de corridas medidas. `run`: una ejecución del escenario con acciones deterministas. |
| **Percentiles p50/p95/p99/max** | Resumen de una distribución de muestras ordenadas: `p50` = valor mediano; `p95` = el 95% de las muestras está debajo; `p99` = el 99% debajo; `max` = el peor valor. Los percentiles altos (p95/p99) muestran lo que "sufre el usuario" en los peores casos, no el promedio. |
| **Nearest-rank** | Método para elegir el percentil: índice `ceil(p × n) - 1` sobre la lista ordenada. |
| **Mediana** | Valor central de las muestras ordenadas: robusto frente a outliers (una corrida atípica no distorsiona la mediana). |
| **Buffer circular** | Cola de tamaño fijo (512 muestras): al llenarse, cada muestra nueva descarta la más antigua. Acota la memoria y percentiles sobre las últimas muestras. |
| **Snapshot** | Foto de las métricas de una sesión al cerrar el juego (timers + contadores). |
| **Envelope** | Envoltorio que el harness agrega alrededor del snapshot: metadatos de la corrida (scenarioId, runId, seed, commit, viewport). |
| **JSONL** | Archivo de texto con un objeto JSON por línea. 1 línea = 1 corrida medida. |
| **Commit** | En el envelope: hash de git del código medido (trazabilidad). No confundir con "commit de React" (aplicación de un render al árbol de UI). |
| **Spring / snap-back** | Animación de muelle de Reanimated. `snap-back`: la carta/ficha vuelve animada a su origen tras un drop inválido. |
