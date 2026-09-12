# Baseline D-WW2 — WakWak con throttle 4× (instrumented-profiling)

Réplica throttled en variante profiling: `render.board` del laberinto bajo
4×. Solo contra otras corridas profiling+throttle, nunca contra D-WW1 ni
contra profiling sin throttle.

## Identificación

| Campo | Valor |
|---|---|
| Fecha | 2026-09-12 (~11:37–11:48) |
| Commit | `cc05e05` (spec con D-WW2) |
| Build | **`instrumented-profiling`** (`EXPO_PUBLIC_PERF_METRICS=1` + `EXPO_PUBLIC_PERF_PROFILING=1` + `PERF_THROTTLE=4`) |
| Protocolo | 3 lotes × 10 corridas = 30 por escenario (`PERF_WARMUP=5`, solo `-g "wakwak"`) |
| Viewport | 360×640 (mobile) |
| Origen | `tmp/perf-throttle_profiler/` (copia de trabajo del operador) |

## Archivos

- `2026-09-12-cc05e05-wakwak-throttle-profiling.tar.xz` — `summary.json` + 3
  `<scenarioId>.jsonl` + 3 `<scenarioId>.cpuprofile.json`, comprimidos con `xz -9e`.

```bash
mkdir -p /tmp/dww2p && tar -xJf 2026-09-12-cc05e05-wakwak-throttle-profiling.tar.xz -C /tmp/dww2p
```

## Resultados — render.board bajo throttle (mediana de p95)

| Escenario | countMed | p50Med | p95Med | p99Max | Factor vs D-WW1-profiling |
|---|---|---|---|---|---|
| wakwak-active-1 | 8 | 9.6 ms | **14 ms** | 19.9 ms | p50 ×4.2 ✓ / p95 ×1.8 |
| wakwak-active-8 | 8 | 8.9 ms | **13.5 ms** | 18.2 ms | p50 ×3.7 ✓ / p95 ×1.8 |
| wakwak-paused | 3 | 0.1 ms | 7.8 ms | 16.4 ms | (mount + bail-outs) |

Lectura: el commit **típico es JS-bound** (p50 escala ×4, atacable en JS);
la **cola p95 es mixta** (×1.8 — componente no-JS: style/layout/paint en el
proceso GPU/compositor; headless usa compositor por software, en móvil real
será distinto — no sobredimensionar la cola, el objetivo es el p50/p95 típico).

## Resultados — loop, publicación, frames

Idénticos en estructura al perfil estándar throttled: `loop.tick` p95Med
0.4–0.6 ms; publicación 100%; `renderFreq` 8/8/1 y 10/10/5 (outliers
puntuales en level 8: maze hasta 16× — inputs wall-clock vs sim-time);
frames largos med 2–9 con p99 de mount ~1 s. El overhead del profiling no
distorsiona las métricas no-render.

## Notas metodológicas

- Mismas reglas que el MANIFEST estándar throttled (comparación,
  presupuesto de stall, conteos, heap ruidoso).
- B1 en ambos perfiles; el análisis fino vive en el reporte de la sesión.
