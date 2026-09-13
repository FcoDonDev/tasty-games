# Baseline v2 — performance web (instrumentado estándar)

Segunda corrida completa de la Fase 1 del [PLAN-PERFORMANCE.md](../PLAN-PERFORMANCE.md).
Permite la primera comparación instrumentado-vs-instrumentado (v1 → v2).

## Identificación

| Campo | Valor |
|---|---|
| Fecha | 2026-09-10/11 (14:41–16:45; archivos por mtime) |
| Commit | `e839cbe` (código entre v1 y v2: metro.config.js —inactivo sin env—, sink nativo, docs) |
| Build | **`instrumented` estándar** — NO es la variante profiling (ver § Perfil) |
| Protocolo | 5 lotes × 30 corridas = 150 por escenario (`PERF_WARMUP=5 PERF_LOTS=5 PERF_RUNS=30`) |
| Viewport | 360×640 (mobile) en todos los escenarios |
| Duración | ~2.1 h (11 escenarios, 1.650 corridas medidas, 11/11 tests) |

## Archivos

- `2026-09-10-e839cbe.tar.xz` (21.5KB) — corridas medidas comprimidas con
  `xz -9e` en un único archivo tar: `summary.json` + 11 `<scenarioId>.jsonl`
  (1 línea JSON = 1 corrida: envelope + snapshot p50/p95/p99/max).

```bash
# Descomprimir y re-agregar (ver MANIFEST del baseline v1 para el script)
mkdir -p /tmp/baseline-v2 && tar -xJf 2026-09-10-e839cbe.tar.xz -C /tmp/baseline-v2
```

## Perfil de esta corrida (IMPORTANTE)

Todos los envelopes reportan **`buildMode: 'instrumented'`** y **0 de 1.650
corridas contienen `render.board`**: la corrida se ejecutó SIN
`EXPO_PUBLIC_PERF_PROFILING=1` (misma configuración que el baseline v1). La
variante profiling para la duración de renders queda **pendiente de ejecutar**.

## Resultados (mediana de p95 / máximo de p99 entre 150 corridas)

| Escenario | Timer | p95Med | p99Max | Lectura |
|---|---|---|---|---|
| solitario-drag | drag.handler / drag.ui2js | 0.8 / 0.8 ms | 1.2 / 1.5 ms | Excelente |
| solitario-drag | audio.handlerToPlay | 0.4 ms | 0.7 ms | Excelente |
| solitario-endgame | audio.handlerToPlay | 0.3 ms | 0.4 ms | Excelente |
| damas-initial | drag.handler / drag.ui2js | 0.4 / 0.4 ms | 0.6 / 0.7 ms | Excelente |
| damas-kings | drag.handler / drag.ui2js | 0.5 / 0.5 ms | 0.7 / 0.8 ms | Excelente (14 fichas) |
| damas-branching | drag.handler / drag.ui2js | 0.5 / 0.5 ms | 0.8 / 0.8 ms | Excelente |
| wakwak-active-1 | uiFrame.maxDt | 16.8 ms | 16.8 ms | Piso teórico a 60 Hz; 0 frames largos |
| wakwak-active-8 | uiFrame.maxDt | 16.8 ms | 33.4 ms | Piso teórico; sin outlier (ver §) |
| wakwak-paused | uiFrame.maxDt | 16.8 ms | 33.3 ms | Piso teórico; 0 frames largos |
| wakwak-* | jsStall.dt | ~33 ms | 33.3–33.4 ms | 1 stall de arranque por sesión |
| memorice-* | (vacío) | — | — | Esperado (Fase 5) |
| solitario-persist | (sin timers) | — | — | Esperado: montaje + persistencia |

Contadores de frecuencia: idénticos a v1 (solitario 5–7 renders/pila en drag;
damas 1 para no tocadas, 2–5 para involucradas; WakWak 0 frames largos/
descartados).

## Comparación v1 (`b37eaf8`) → v2 (`e839cbe`) — mismo perfil

| Métrica | v1 p95Med | v2 p95Med | Delta | Veredicto |
|---|---|---|---|---|
| solitario drag.handler / ui2js | 0.8 / 0.8 | 0.8 / 0.8 | 0% | Sin cambio |
| solitario audio | 0.4 | 0.4 | 0% | Sin cambio |
| damas drag.handler / ui2js | 0.4–0.6 | 0.4–0.5 | 0% | Sin cambio |
| wakwak uiFrame.maxDt | 16.8 | 16.8 | 0% | Sin cambio |
| wakwak-active-8 p99Max | 1383.2 (outlier) | 33.4 | — | v2 limpia, sin el evento de sistema de v1 |

- **Sin regresiones ni mejoras** (esperado: entre v1 y v2 no hubo cambios de
  código con efecto en runtime web — metro.config.js solo actúa con
  `EXPO_PUBLIC_PERF_PROFILING=1`, el sink es nativo-only en esta plataforma).
- **Reproducibilidad del protocolo confirmada**: dos corridas independientes de
  1.650 corridas producen las mismas medianas — el harness es determinista y
  estable (dispersión wall ±3%).
- El outlier de v1 **no se repitió**: fue un evento puntual de la máquina, no
  un efecto del juego.
