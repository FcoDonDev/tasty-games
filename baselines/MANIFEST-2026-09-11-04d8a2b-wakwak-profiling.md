# Baseline D-WW1 — WakWak reducido (instrumented-profiling)

Réplica en variante profiling de la medición D-WW0: habilita `render.board`
para el laberinto (`PerfProfiler` id `maze-pickup`) — **primeras duraciones de
render de WakWak**. Solo contra otras corridas profiling, nunca contra el
perfil estándar.

## Identificación

| Campo | Valor |
|---|---|
| Fecha | 2026-09-11 (~18:22–18:29) |
| Commit | `04d8a2b` (D-WW0 implementado) |
| Build | **`instrumented-profiling`** (`EXPO_PUBLIC_PERF_METRICS=1` + `EXPO_PUBLIC_PERF_PROFILING=1`) |
| Protocolo | 3 lotes × 10 corridas = 30 por escenario (`PERF_WARMUP=5 PERF_LOTS=3 PERF_RUNS=10`, solo `-g "wakwak"`) |
| Viewport | 360×640 (mobile) |
| Duración | ~7 min (3 escenarios, 90 corridas medidas, 3/3 tests) |
| Origen | `tmp/perf_instrumented-profiling/` (copia de trabajo del operador) |

## Archivos

- `2026-09-11-04d8a2b-wakwak-profiling.tar.xz` (3.7KB) — `summary.json` + 3
  `<scenarioId>.jsonl` comprimidos con `xz -9e`.

```bash
mkdir -p /tmp/dww1p && tar -xJf 2026-09-11-04d8a2b-wakwak-profiling.tar.xz -C /tmp/dww1p
```

## Resultados — duración de commits del laberinto (NUEVO)

`render.board` (Profiler sobre `MazeLayer`), mediana de p95 por corrida:

| Escenario | countMed | p50Med | p95Med | p99Max | Lectura |
|---|---|---|---|---|---|
| wakwak-active-1 | 8 | 2.3 ms | **7.7 ms** | 11.2 ms | commit de pickup: el costo React-side más alto medido en WakWak |
| wakwak-active-8 | 8 | 2.4 ms | **7.3 ms** | 11.2 ms | idéntico a nivel 1 |
| wakwak-paused | 3 | 0 ms | 7.5 ms | 15.9 ms | mount + re-renders del Profiler con bail-out (~0 ms) + 1 commit real |

`countMed=8` coincide con `renderFreq:maze=8`: cada commit de pickup se mide.
Un commit p95 de ~7.5 ms ≈ medio presupuesto de frame a 60 Hz, en el main
thread web (sin UI thread separado) y a ~2 Hz mientras se come — **principal
sospechoso de los hitches reportados en móvil real** (D-WW4 respondido).

## Resultados — loop y publicación (réplica del estándar)

Idénticos al perfil estándar: `loop.*` p95Med 0.1 ms en los 5 timers y los
3 escenarios; publicación 100% (249/249, 248/248, 71/71); `renderFreq`
idénticos (maze 8/8/1, hud 10/10/5). El overhead del profiling **no
distorsiona** las métricas no-render (consistente con el hallazgo del
baseline v3).

## Frames y stalls

`uiFrame.maxDt` p95Med 16.8 ms en los 3 escenarios, 0 frames largos
(1 frame largo aislado en 1/30 corridas de pausa, maxDt 33.3 ms — ruido).
`jsStall` de arranque intermitente (~33–50 ms, no en todas las corridas).

## Notas metodológicas

- Comparar `render.board` solo contra futuras corridas profiling.
- `p99Max` no comparable contra v3 (n=30 vs n=150).
- En pausa, el Profiler dispara 3× (mount + 2 re-renders con bail-out del
  memo a ~0 ms); el p50Med=0 lo refleja.
