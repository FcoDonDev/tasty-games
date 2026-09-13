# Baseline post-fix I-WW-1 — WakWak throttle 4× (instrumented) — ACEPTADO

Post-fix bajo throttle (commit `cdd72c3`). Comparar solo contra D-WW2
throttled.

| Métrica (p95Med) | pre (D-WW2) | post |
|---|---|---|
| loop.tick (activos) | 0.5–0.6 ms | 0.5–0.6 ms (sin cambio) |
| longFrameEvents / dropped (med) | 1–4 / 1–4 | 1–2 / 1–3 (igual o mejor) |
| renderFreq / publicación | 8/8/1, 10/10/5, 100% | idénticos |

Sin regresiones bajo throttle.

## Identificación

| Campo | Valor |
|---|---|
| Fecha | 2026-09-13 |
| Commit | `cdd72c3` (I-WW-1) |
| Build | **`instrumented`** + `PERF_THROTTLE=4` |
| Protocolo | 3 lotes × 10 = 30 por escenario (`-g "wakwak"`) |
| Origen | `tmp/perf-throttle_instrumented/` |

## Archivos

- `2026-09-13-cdd72c3-wakwak-postfix-throttle.tar.xz` (`xz -9e`, incluye
  3 `.cpuprofile.json` B1).
