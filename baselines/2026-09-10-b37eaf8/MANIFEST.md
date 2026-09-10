# Baseline v1 — performance web (instrumentado)

**Primera corrida completa de la Fase 1** del [PLAN-PERFORMANCE.md](../../PLAN-PERFORMANCE.md).
Referencia obligatoria para la regla comparativa (§5): las mejoras futuras se
validan contra esta corrida, siempre instrumentado-vs-instrumentado.

## Identificación

| Campo | Valor |
|---|---|
| Fecha | 2026-09-10 (08:56–11:02 local) |
| Commit | `b37eaf8` (código idéntico a `9d7668c`; la diferencia es solo docs) |
| Build | `instrumented` (`EXPO_PUBLIC_PERF_METRICS=1`, React producción estándar) |
| Protocolo | 5 lotes × 30 corridas = 150 por escenario (`PERF_WARMUP=5 PERF_LOTS=5 PERF_RUNS=30`) |
| Viewport | 360×640 (mobile) en todos los escenarios |
| Duración | ~2.4 h (11 escenarios, 1.650 corridas medidas) |
| Suite | 11 passed, código 0 |

## Entorno

| Campo | Valor |
|---|---|
| OS | WSL2 (Linux 6.18.33.2-microsoft-standard-WSL2, x86_64) |
| CPU | AMD Ryzen 5 3600 (6 cores / 12 hilos) |
| RAM | 7.7 GiB |
| Navegador | Chromium headless vía Playwright 1.62.1 (`chromium-1234`) |
| Nota | Métricas de browser/JS; no representan UI thread/GPU nativos |

## Archivos

- `<scenarioId>.jsonl.xz` — corridas medidas comprimidas con `xz -9e` (1 línea
  JSON = 1 corrida: envelope + snapshot p50/p95/p99/max).
- `summary.json.xz` — agregado del harness: por escenario, timers (mediana de
  p95, máximo de p99 entre corridas) y contadores (mediana por corrida).

```bash
# Descomprimir (ejemplo)
xz -dk solitario-drag.jsonl.xz

# Re-agregar (mediana de p95 por escenario)
node -e '
const fs=require("fs");
for(const f of fs.readdirSync(".").filter(x=>x.endsWith(".jsonl"))){
  const lines=fs.readFileSync(f,"utf8").trim().split("\n").map(JSON.parse);
  const t={};
  for(const l of lines) for(const[k,s]of Object.entries(l.snapshot?.timers??{})) (t[k]??=[]).push(s.p95);
  for(const[k,v]of Object.entries(t)){v.sort((a,b)=>a-b);console.log(f.replace(".jsonl",""),k,"p95Med="+v[Math.floor(v.length/2)]);}
}'
```

## Resultados (mediana de p95 / máximo de p99 entre 150 corridas)

| Escenario | Timer | p95Med | p99Max | Lectura |
|---|---|---|---|---|
| solitario-drag | drag.handler / drag.ui2js | 0.8 / 0.8 ms | 1.3 / 1.3 ms | Excelente |
| solitario-drag | audio.handlerToPlay | 0.4 ms | 0.6 ms | Excelente |
| solitario-endgame | audio.handlerToPlay | 0.3 ms | 0.4 ms | Excelente |
| damas-initial | drag.handler / drag.ui2js | 0.4 / 0.5 ms | 0.6 / 0.7 ms | Excelente |
| damas-kings | drag.handler / drag.ui2js | 0.5 / 0.6 ms | 1.3 / 1.3 ms | Excelente (14 fichas) |
| damas-branching | drag.handler / drag.ui2js | 0.5 / 0.5 ms | 0.7 / 0.8 ms | Excelente (cadena de capturas) |
| wakwak-active-1 | uiFrame.maxDt | 16.8 ms | 33.3 ms | Piso teórico a 60 Hz; 0 frames largos |
| wakwak-active-8 | uiFrame.maxDt | 16.8 ms | 1383.2 ms (*) | Mediana limpia; ver outlier |
| wakwak-paused | uiFrame.maxDt | 16.8 ms | 33.4 ms | Piso teórico; 0 frames largos |
| wakwak-* | jsStall.dt | ~33 ms | (ver (*) ) | 1 stall de arranque por sesión |
| memorice-* | (vacío) | — | — | Esperado: sin instrumentación interna (Fase 5) |
| solitario-persist | (sin timers) | — | — | Esperado: montaje + persistencia, sin drags |

(*) **Outlier ambiental, corrida `wakwak-active-8#154` (lote 4):** `wall=101.8s`,
24 stalls con `maxDt=1383ms` (evento de sistema: suspend/GC masivo/hiccup de la
máquina). Las otras 149 corridas del escenario son limpias (wall mediana 6.9s).
La mediana de p95 (16.8 ms) es inmune; solo el `p99Max` del summary queda
inflado por esta corrida. NO modificar los artifacts: el outlier queda
documentado aquí y la regla comparativa (mediana de p95) lo absorbe.

## Contadores de frecuencia (mediana por corrida)

- Solitario drag: todas las pilas 5–7 renders por sesión (memoización efectiva).
- Damas: 1 render para fichas no tocadas; 2–5 para las involucradas en drags.
- WakWak: `uiFrames.longFrameEvents=0`, `estimatedDroppedFrames=0`,
  `jsStall.count=1` (ruido de arranque).
- `renderFreq` = frecuencia de renders (semántica de frecuencia, ≠ duración).
  La duración (`render.board`) requiere la variante profiling build
  (PLAN §19) — ausente en esta corrida por diseño.
