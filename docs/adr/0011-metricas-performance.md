# 0011 — Métricas de performance gated por EXPO_PUBLIC_PERF_METRICS

**Estado:** Aceptada

## Contexto

El desfase sonido/acción en solitario reveló que no había forma de medir performance
de los juegos (latencias de drag, coste de render, jank). Se necesitan métricas
para evaluar durante pruebas y depurar en dev una vez desplegado, sin coste en
producción.

## Decisión

- Módulo único `src/core/perf/` con API por evento (`perfDragEvent`, `perfAudio`,
  `perfRenderReport`, `perfRenderCount`, `perfJsStall`, `perfUiFrame`) y ciclo de
  sesión (`beginPerfSession`/`endPerfSession`) por pantalla de juego.
- Gate: `process.env.EXPO_PUBLIC_PERF_METRICS === '1'`, inlineado por babel en
  build (mismo patrón que `EXPO_PUBLIC_E2E`, ADR 0006). **Default OFF: cero
  overhead** (early-return en toda la API; el monitor de frames ni siquiera
  arranca). Togglear la variable exige reiniciar Metro/export (env inlineado).
- Métricas:
  - Drag: duración del handler JS + latencia UI→JS (`_getAnimationTimestamp()` de
    react-native-worklets; en web mismo reloj que `performance.now()`; en nativo
    sin validar).
  - Audio: handler→`play()` (coste JS; el round-trip nativo no es observable).
  - Render: duración (`React.Profiler` sobre el tablero) + **contador de renders
    por pila/ficha** (verifica memoización).
  - Jank en dos ejes separados: stalls del loop rAF del juego (JS thread) y FPS
    de render (`useFrameCallback`, UI thread, solo montado con gate ON).
- Salida: log por evento `[perf][<gameId>]` + resumen acumulado (count/avg/min/p95)
  al desmontar la pantalla.
- Persistencia (web): snapshot a `localStorage` (`perf-metrics-<gameId>`),
  sobrescrito por sesión, vía `requestIdleCallback` (fallback `setTimeout`) —
  nunca en el camino crítico. `readPerfMetrics(gameId)` para consultar a
  posteriori (dev-only). En nativo: memoria + consola.

## Resultados medidos (cierre del requerimiento, dev web 360×640)

Protocolo: dev server con la env activa + Playwright (`mouse.down` → moves
escalonados → `up`); misma secuencia en baseline y post-fix (drag legal,
2 inválidos, doble tap).

| Métrica | Baseline | Post fix sonido | Post memoización |
|---|---|---|---|
| audio.handlerToPlay (avg/p95) | 1.3 / 3.0 ms | **0.8 / 0.9 ms** | 0.8 / 1.0 ms |
| drag.handler (avg/p95) | 2.4 / 4.9 ms | **1.9 / 2.9 ms** | 1.9 / 3.1 ms |
| drag.ui2js (avg) | 2.4 ms | 2.1 ms | 2.0 ms |
| render.board (avg/min) | 25.6 / 16.7 ms | ~estable | **7.6 / 0.3 ms** |
| renders por pila (cont.) | 13 pilas × 16 | 13 × 12 | 7-8 (pases por `dragKey`) |

Notas de lectura: (1) la mejora estructural del audio (round-trip de `seekTo`
eliminado + primer player precalentado) no es capturable por el reloj JS —
el delta de la tabla solo cubre el coste de invocación; (2) el p95 de render
restante (~50-68ms) es el render de montaje inicial, no los renders por
movimiento; (3) los contadores uniformes por pila post-memoización son pases
baratos por transición de `dragKey` (los PileCard internos saltan por memo) —
deuda opcional en ROADMAP (dragKey a shared value).

## Consecuencias

- Evaluar performance en pruebas y depurar en despliegues no requiere herramientas
  externas: activar la env y leer consola/localStorage.
- La escritura en idle evita contaminar las métricas que ella misma mide.
- Deuda conocida (ver `docs/ROADMAP.md`): validar relojes UI→JS en Android,
  persistir métricas en sqlite para sesiones nativas, y el gate exige rebuild al
  togglear (inline en compilación).
