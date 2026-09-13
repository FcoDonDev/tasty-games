# Baseline D-WW2 — WakWak con throttle 4× (instrumented estándar)

Primera medición throttled (PLAN-PERFORMANCE §11, D-WW2): `PERF_THROTTLE=4`
vía CDP tras el `ready` de cada corrida. Incluye heap-delta por envelope y
1 CPU profile (dominio `Profiler`) por escenario. Solo WakWak, protocolo
reducido (3 lotes × 10). **Comparar solo contra corridas throttled.**

## Identificación

| Campo | Valor |
|---|---|
| Fecha | 2026-09-12 (~11:22–11:33) |
| Commit | `cc05e05` (spec con D-WW2) |
| Build | **`instrumented`** (`EXPO_PUBLIC_PERF_METRICS=1` + `PERF_THROTTLE=4`) |
| Protocolo | 3 lotes × 10 corridas = 30 por escenario (`PERF_WARMUP=5`, solo `-g "wakwak"`) |
| Viewport | 360×640 (mobile) |
| Origen | `tmp/perf-throttle_standard/` (copia de trabajo del operador) |

## Archivos

- `2026-09-12-cc05e05-wakwak-throttle.tar.xz` — `summary.json` + 3
  `<scenarioId>.jsonl` + 3 `<scenarioId>.cpuprofile.json`, comprimidos con `xz -9e`.

```bash
mkdir -p /tmp/dww2 && tar -xJf 2026-09-12-cc05e05-wakwak-throttle.tar.xz -C /tmp/dww2
```

## Resultados — bite-check (p95Med vs D-WW1 sin throttle)

| Métrica | D-WW1 | throttle 4× | Factor |
|---|---|---|---|
| loop.tick | 0.1 ms | 0.5–0.6 ms | ×5–6 ✓ muerde |
| loop.present | 0.1 ms | 0.6 ms | ×6 ✓ |
| loop.advance | 0.1 ms | 0.3–0.4 ms | ×3–4 ✓ |
| loop.worldSnapshot | 0.1 ms | 0.3 ms | ×3 ✓ |
| loop.threats | 0.1 ms | 0.2 ms | piso de resolución |

## Resultados — hitches reproducidos

Sin throttle: 0 frames largos. Con 4× (mediana por corrida):

| Escenario | longFrameEvents | estimatedDroppedFrames | uiFrame.maxDt p99Max |
|---|---|---|---|
| wakwak-active-1 | 4 | 4 | 983 ms (mount) |
| wakwak-active-8 | 3 | 3 | 1000 ms (mount) |
| wakwak-paused | 2 | 2 | 1217 ms (mount) |

El main thread no está saturado en promedio (B1: ~57% idle, JS ~13%) —
los hitches son colas episódicas, el patrón reportado en móvil real.

## Resultados — publicación y renders

`loop.tick.calls == published` en 90/90 (100%); `renderFreq:maze` 8/8/1 y
`hud` 10/10/5 como en D-WW1 (determinismo conservado salvo outliers
puntuales en level 8 bajo throttle — inputs wall-clock vs sim-time).

## Heap-delta (ruidoso, no concluyente)

`JSHeapUsedSize` post-ready → post-run: mediana −8 MB (activo) / +6 MB
(pausa), rango −30 MB…+17 MB. Dominado por basura de mount + timing de GC;
las medianas sugieren colecciones durante el juego y crecimiento del
present-path en pausa, pero requiere muestreo post-warmup para concluir.

## B1 — CPU profiles

`<scenarioId>.cpuprofile.json` (ventana de juego, 1 ms). Límite conocido:
bundle minificado impide atribución por nombre; ~3–5% del wall es código
inyectado de Playwright (filtrar del análisis); GC self menor (~9 ms/5 s);
`deoptNodes=0`. Ver desglose completo en el reporte de la sesión D-WW2.

## Notas metodológicas

- `jsStall` p99 ~1 s = stalls de mount bajo throttle (ruido de carga).
- Presupuesto de stall reinterpretado (100 ms throttled ≈ 25 ms reales).
- Conteos por corrida no comparables contra D-WW1 (menos ticks por ventana).
