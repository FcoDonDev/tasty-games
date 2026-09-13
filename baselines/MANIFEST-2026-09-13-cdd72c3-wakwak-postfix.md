# Baseline post-fix I-WW-1 — WakWak (instrumented estándar) — ACEPTADO

Post-fix de `EdibleDot` memoizado (commit `cdd72c3`). Sin `render.board` en
este perfil (esperado); valida ausencia de regresiones funcionales y de loop.
La evidencia de mejora vive en el MANIFEST profiling.

## Identificación

| Campo | Valor |
|---|---|
| Fecha | 2026-09-13 |
| Commit | `cdd72c3` (I-WW-1) |
| Build | **`instrumented`** (sin throttle) |
| Protocolo | 3 lotes × 10 = 30 por escenario (`-g "wakwak"`) |
| Origen | `tmp/perf_instrumented/` |

## Archivos

- `2026-09-13-cdd72c3-wakwak-postfix.tar.xz` (`xz -9e`).

## Resultados

`loop.*` p95Med 0.1 ms idénticos al pre-fix; 0 frames largos; `renderFreq`
8/8/1 y 10/10/5 clavados; publicación 100%. Sin regresiones.
