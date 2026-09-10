# Baseline de performance (web)

Harness de medición de la Fase 1 del [PLAN-PERFORMANCE.md](../PLAN-PERFORMANCE.md).
Diagnostica (no reemplaza la verificación funcional: `pnpm e2e:web`).

## Comando

```bash
EXPO_PUBLIC_PERF_METRICS=1 PERF_BASELINE=1 PERF_WARMUP=5 PERF_LOTS=5 PERF_RUNS=30 \
node scripts/e2e.mjs -- src/core/__e2e__/performance.web.spec.ts
```

- El spec está **gated**: sin `PERF_BASELINE=1` los tests se saltean (la suite
  funcional estándar nunca los corre).
- `EXPO_PUBLIC_PERF_METRICS=1` se inlinea al build del export (perfil
  **instrumentado**, etiquetado así en los artifacts — NO es un release
  comparable; PLAN §2/§3/§9: las comparaciones antes/después se hacen
  instrumentado-vs-instrumentado).
- **No combinar con `CI=1`**: la config de Playwright levantaría su propio
  server y colisionaría con el del orquestador.
- Duración con los defaults: ~15-25 min por escenario (155 corridas) →
  **3-4 h en total**. Correr en máquina idle.

## Variables del protocolo

| Variable | Default | Significado |
|---|---|---|
| `PERF_WARMUP` | 1 | Corridas de calentamiento, descartadas (no se escriben) |
| `PERF_LOTS` | 1 | Lotes independientes de corridas medidas |
| `PERF_RUNS` | 3 | Corridas medidas por lote |
| `PERF_WINDOW_MS` | 4000 | Ventana de juego de los escenarios activos (WakWak) |
| `PERF_VIEWPORT` | `360x640` | `1280x900` para desktop |
| `E2E_PORT` | 4173 | Puerto del servidor (usar otro si está ocupado) |

## Resultados

| Ubicación | Contenido |
|---|---|
| `tmp/perf/<scenarioId>.jsonl` | 1 línea = 1 run medida, envelope versionado: `schemaVersion`, `scenarioId`, `runId`, `lot`, `seed`, `commit`, `viewport`, `wallMs` + snapshot completo (p50/p95/p99/max por timer) |
| `tmp/perf/summary.json` | Agregado por escenario: timers (mediana de p95, máximo de p99 entre runs) y contadores (mediana de valor por run) |
| `playwright-report/` / `test-results/` | Reporte HTML y trazas si algún test falla |

Ambos directorios son gitignored (artifacts locales, nunca commitearlos).

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

Contadores: `renderFreq:*` (frecuencia de renders por componente — semántica de
frecuencia, ≠ duración), `uiFrames.*` (longFrameEvents / estimatedDroppedFrames
/ total), `jsStall.count`.

## Interpretación

1. **Regla comparativa** (PLAN §5): aceptar una mejora solo si la mediana de los
   p95 mejora ≥10% entre baseline y post-fix y ninguna métrica crítica empeora
   >10%. Con 5 lotes × 30 runs; si la dispersión impide concluir, el resultado
   queda como inconcluso.
2. `uiFrame.maxDt ≈ 16.8ms` a 60 Hz es el piso (un frame por flush): no es jank.
3. Memorice reporta snapshot vacío hasta instrumentar sus renders (Fase 5).
4. Limitaciones web: las métricas son browser/JS, no UI thread/GPU nativos;
   validación nativa = Fase 1N (pendiente, ver PLAN §10).
