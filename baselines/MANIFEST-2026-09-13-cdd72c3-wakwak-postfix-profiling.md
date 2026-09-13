# Baseline post-fix I-WW-1 — WakWak (instrumented-profiling) — ACEPTADO

Evidencia principal de I-WW-1: `render.board` del commit de pickup
pre (`04d8a2b`, D-WW1) vs post (`cdd72c3`), mediana de p95, n=30.

| Escenario | pre p50Med | post p50Med | pre p95Med | post p95Med |
|---|---|---|---|---|
| wakwak-active-1 | 2.3 ms | **0.2 ms (−91%)** | 7.7 ms | 9.0 ms (*) |
| wakwak-active-8 | 2.4 ms | **0.2 ms (−92%)** | 7.3 ms | 8.7 ms (*) |

(*) Con `count=8`/corrida el p95 es el máximo, y los 8 commits = 1 mount +
7 pickups: el p95 mide el mount, no los pickups (el escenario `paused`,
sin pickups, da 8.5 ms post vs 7.5 ms pre). Tradeoff documentado: mount
~1 ms más típico por las 399 fibras extra (una vez por carga); steady-state
durante el juego −91%. Aceptado por evidencia de steady-state (decisión
2026-09-13); el full §5 no resolvería el confound mount/pickup.

## Identificación

| Campo | Valor |
|---|---|
| Fecha | 2026-09-13 |
| Commit | `cdd72c3` (I-WW-1) |
| Build | **`instrumented-profiling`** (sin throttle) |
| Protocolo | 3 lotes × 10 = 30 por escenario (`-g "wakwak"`) |
| Origen | `tmp/perf_instrumented-profiling/` |

## Archivos

- `2026-09-13-cdd72c3-wakwak-postfix-profiling.tar.xz` (`xz -9e`).
