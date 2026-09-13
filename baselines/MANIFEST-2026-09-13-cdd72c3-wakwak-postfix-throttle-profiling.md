# Baseline post-fix I-WW-1 — WakWak throttle 4× (instrumented-profiling) — ACEPTADO

`render.board` bajo throttle, pre (D-WW2) vs post (mediana de p95, n=30):

| Escenario | pre p50Med | post p50Med | pre p95Med | post p95Med |
|---|---|---|---|---|
| wakwak-active-1 | 9.6 ms | **0.9 ms (−91%)** | 14 ms | **8.0 ms (−43%)** |
| wakwak-active-8 | 8.9 ms | **0.9 ms (−90%)** | 13.5 ms | **8.2 ms (−39%)** |

Bajo throttle el p95 también mejora (los pickups dominan la cola cuando
todo es más lento). Confirma que el commit típico era JS-bound y que el fix
lo recorta en proporción incluso con CPU degradada.

## Identificación

| Campo | Valor |
|---|---|
| Fecha | 2026-09-13 |
| Commit | `cdd72c3` (I-WW-1) |
| Build | **`instrumented-profiling`** + `PERF_THROTTLE=4` |
| Protocolo | 3 lotes × 10 = 30 por escenario (`-g "wakwak"`) |
| Origen | `tmp/perf-throttle_instrumented-profiling/` |

## Archivos

- `2026-09-13-cdd72c3-wakwak-postfix-throttle-profiling.tar.xz` (`xz -9e`,
  incluye 3 `.cpuprofile.json` B1).
