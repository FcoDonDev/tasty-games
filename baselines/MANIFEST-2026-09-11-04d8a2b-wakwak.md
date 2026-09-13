# Baseline D-WW1 — WakWak reducido (instrumented estándar)

Primera medición con la instrumentación D-WW0 (PLAN-PERFORMANCE §11): timers
`loop.*`, contadores de publicación `loop.tick.*` y `renderFreq:maze`/`hud`.
Solo WakWak, protocolo reducido acordado (3 lotes × 10 corridas).

## Identificación

| Campo | Valor |
|---|---|
| Fecha | 2026-09-11 (~18:09–18:16) |
| Commit | `04d8a2b` (D-WW0 implementado) |
| Build | **`instrumented`** (`EXPO_PUBLIC_PERF_METRICS=1`, sin profiling) |
| Protocolo | 3 lotes × 10 corridas = 30 por escenario (`PERF_WARMUP=5 PERF_LOTS=3 PERF_RUNS=10`, solo `-g "wakwak"`) |
| Viewport | 360×640 (mobile) |
| Duración | ~7 min (3 escenarios, 90 corridas medidas, 3/3 tests) |
| Origen | `tmp/perfil_instrumented/` (copia de trabajo del operador) |

## Archivos

- `2026-09-11-04d8a2b-wakwak.tar.xz` (2.8KB) — `summary.json` + 3
  `<scenarioId>.jsonl` comprimidos con `xz -9e`.

```bash
mkdir -p /tmp/dww1 && tar -xJf 2026-09-11-04d8a2b-wakwak.tar.xz -C /tmp/dww1
```

## Resultados — loop (NUEVO, D-WW0)

Mediana de p95 por corrida (p95Med), 30 corridas por escenario. `p50Med=0`
significa costo típico bajo la resolución del snapshot (redondeo a 0.01 ms).

| Escenario | loop.tick | loop.advance | loop.threats | loop.worldSnapshot | loop.present |
|---|---|---|---|---|---|
| wakwak-active-1 | p95Med 0.1 ms | p95Med 0.1 ms | p95Med 0.1 ms | p95Med 0.1 ms | p95Med 0.1 ms |
| wakwak-active-8 | p95Med 0.1 ms | p95Med 0.1 ms | p95Med 0.1 ms | p95Med 0.1 ms | p95Med 0.1 ms |
| wakwak-paused | p95Med 0.1 ms | p95Med 0.1 ms | p95Med 0.1 ms | p95Med 0.1 ms | p95Med 0.1 ms |

Dispersión por lote: nula (p95 = 0.10 en los 3 lotes de los 3 escenarios).
Nivel 1 vs 8: idénticos — la complejidad del nivel no escala el costo JS
en esta máquina.

## Resultados — publicación y renders (NUEVO, D-WW0)

Mediana por corrida:

| Escenario | loop.tick.calls | loop.tick.published | tasa | renderFreq:maze | renderFreq:hud |
|---|---|---|---|---|---|
| wakwak-active-1 | 248 | 248 | **100%** | 8 | 10 |
| wakwak-active-8 | 248 | 248 | **100%** | 8 | 10 |
| wakwak-paused | 71 | 71 | **100%** | 1 | 5 |

- Tasa de publicación 100% en las 90 corridas: cada tick publica (F-01
  confirmado medible; `advance` siempre retorna objeto nuevo por `remainderMs`).
- `renderFreq:maze` determinista (8/8 en activo = mount + 7 commits de pickup;
  1 en pausa = solo mount → el memo aguanta en pausa).
- En pausa: 164 `present`/`worldSnapshot` contra 71 `tick` → ~93 frames de
  solo-presentación durante 1.5 s de pausa (F-04 cuantificado: ~0.1 ms c/u,
  desperdicio puro).

## Frames y stalls (comparación con v1/v2)

| Métrica | v1/v2 | D-WW1 | Lectura |
|---|---|---|---|
| uiFrame.maxDt p95Med (los 3 esc.) | 16.8 ms | 16.8 ms | Sin cambio; piso teórico |
| uiFrames.longFrameEvents | 0 | 0 | Sin cambio |
| jsStall | 1 × ~33 ms/arranque | 1 × ~33 ms (intermitente) | Mismo orden; no aparece en todas las corridas |

## Notas metodológicas

- Protocolo reducido: solo `p95Med` y contadores (mediana) son comparables;
  `p99Max` NO se compara contra v1/v2 (n=30 vs n=150).
- `jsStall.dt` aparece en un subconjunto de corridas (stall de arranque
  intermitente); sus agregados son sobre ese subconjunto.
- `render.board` no existe en este perfil (esperado: requiere profiling).
