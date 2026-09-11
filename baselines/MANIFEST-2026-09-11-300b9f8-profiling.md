# Baseline v3 — performance web (instrumented-profiling)

Primera corrida completa de la **variante profiling** (Fase 1): habilita la
duración de renders (`render.board`) vía `react-dom/profiling`. Referencia
para comparar mejoras de render — **solo contra otras corridas profiling**
(nunca contra v1/v2 estándar).

## Identificación

| Campo | Valor |
|---|---|
| Fecha | 2026-09-11 (10:41–12:46) |
| Commit | `300b9f8` |
| Build | **`instrumented-profiling`** (`EXPO_PUBLIC_PERF_METRICS=1` + `EXPO_PUBLIC_PERF_PROFILING=1`) |
| Protocolo | 5 lotes × 30 corridas = 150 por escenario (`PERF_WARMUP=5 PERF_LOTS=5 PERF_RUNS=30`) |
| Viewport | 360×640 (mobile) en todos los escenarios |
| Duración | ~2.1 h (11 escenarios, 1.650 corridas medidas, 11/11 tests) |

## Archivos

- `2026-09-11-300b9f8-profiling.tar.xz` (27.5KB) — corridas medidas comprimidas
  con `xz -9e` en un único archivo tar: `summary.json` + 11 `<scenarioId>.jsonl`
  (1 línea JSON = 1 corrida: envelope + snapshot p50/p95/p99/max).

```bash
# Descomprimir (ver MANIFEST del baseline v1 para el script de re-agregado)
mkdir -p /tmp/baseline-v3 && tar -xJf 2026-09-11-300b9f8-profiling.tar.xz -C /tmp/baseline-v3
```

## Resultados — duración de renders (NUEVO)

| Escenario | render.board p95Med | p99Max | Dispersión por corrida (p95 med/p90/max) | Lectura |
|---|---|---|---|---|
| solitario-drag | 3.0 ms | 4.3 ms | 3.0 / 3.6 / 4.3 | Renders estables baratos |
| solitario-persist | 12.9 ms | 23.4 ms | 12.9 / 14.7 / 23.4 | Costo de montaje inicial |
| solitario-endgame | 20.0 ms | 49.9 ms | 20 / 28 / 49.9 | Auto-moves a foundation; >1 frame a 60Hz — candidato a revisión en fase solitario |
| damas-initial | 7.0 ms | 10.7 ms | 7.0 / 8.1 / 10.7 | Estable |
| damas-kings | 6.2 ms | 9.2 ms | 6.2 / 7.1 / 9.2 | Estable (14 fichas) |
| damas-branching | 4.6 ms | 13.0 ms | 4.6 / 5.6 / 13.0 | Estable (1 corrida más lenta) |

- Ausente en WakWak y Memorice **por diseño**: solo Solitario y Damas montan
  `<PerfProfiler>` (WakWak tiene otra arquitectura; Memorice se instrumenta en
  Fase 5).
- `renderFreq:*` (frecuencia) sigue disponible junto a la duración: ambas
  señales conviven en este perfil.

## Resultados — resto de timers (control de overhead del profiling)

| Métrica | v3 (profiling) p95Med | v1/v2 (estándar) p95Med | Lectura |
|---|---|---|---|
| drag.handler solitario / damas | 0.8 / 0.4–0.5 ms | 0.8 / 0.4–0.5 ms | Idéntico: el profiling no distorsiona handlers |
| drag.ui2js | 0.5–0.8 ms | 0.5–0.8 ms | Idéntico |
| audio.handlerToPlay | 0.3–0.4 ms | 0.3–0.4 ms | Idéntico |
| uiFrame.maxDt (wakwak) | 16.8 ms | 16.8 ms | Piso teórico; 0 frames largos/descartados |
| jsStall.dt | ~33 ms (1 por sesión) | ~33 ms | Ruido de arranque |

- Sin outliers (muros estables ±3%, sin eventos de sistema como el de v1).
- Comparación válida de handlers entre perfiles (el overhead del profiling no
  es visible en ellos), pero la regla §5 exige comparar profiling-vs-profiling
  para las conclusiones de render.
