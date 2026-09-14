# ADR 0014: Juegos de acción en tiempo real — timestep fijo con acumulador en el store e interpolación de renderer

- Estado: Aceptada
- Contexto: PLAN-SERPIENTE (D8/D20/D21/D22, cerrado 2026-09-14)
- Referencias: [ADR 0001](0001-render-sin-skia.md) (render Views), [ADR 0010](0010-wakwak-motor-agnostico.md) (motor agnóstico), [ADR 0011](0011-metricas-performance.md) (presupuestos)

## Contexto

Serpiente necesita simulación en tiempo real determinista (velocidad
progresiva 140→70 ms por paso) con render fluido a 60 fps sobre Views +
Reanimated. Dos approaches extremos tienen defectos conocidos:

- **Publicar estado cada frame (estilo WakWak en movimiento suave)**:
  re-render de React ~60 veces/s aunque el juego no cambie — inviable para
  un tablero de cientos de Views (§9.1 del presupuesto de performance).
- **Timestep discreto sin interpolar**: el movimiento salta de celda en
  celda; funciona, pero el cruce de bordes (wrap) y la calidad de feel quedan
  limitados.

Además, el cruce de bordes en toro (wrap) tiene el problema clásico de
"desarmarse" al cruzar la costura si se interpola con una sola copia por
nodo.

## Decisión

Para cualquier juego de acción en tiempo real futuro (el patrón ya está en
`src/games/serpiente/`):

1. **Timestep fijo en el engine**: `advance(state, dtMs)` consume `dtMs` en
   pasos de `stepMs(eaten)` (tope anti-espiral por llamada) y devuelve
   `{ state, events, leftoverMs }`. El estado NO persiste el sobrante: la
   alcancía de fracciones de frame vive SOLO en el store (`tickAccumMs`),
   única fuente de verdad (D21). El store publica `set()` solo cuando el
   estado cambió (§9.1) — cero re-renders por frames sin paso.
2. **Progreso expuesto para el render**: el store expone
   `getStepProgress()` = acumulador / paso en curso (0..1).
3. **Interpolación en el renderer (UI-thread)**: el engine queda intacto;
   el renderer desliza cada nodo hacia su posición upstream con un
   SharedValue escrito desde el loop rAF de la pantalla (cero re-renders JS
   extra). Congelado en pausa/hit-stop/muerte; reduced motion = saltos
   discretos. Los selectores E2E (testID/labels) anclan a la celda LÓGICA.
4. **Render toroidal en el wrap**: cada nodo cuyo slide cruza/emerge de la
   costura se dibuja en sus DOS posiciones congruentes del toro (base +
   gemela desplazada ±ancho/alto del tablero); el contenido del tablero va
   clipado (`overflow: 'hidden'`) en su propio wrapper y los indicadores
   (anillos, vignettes, popups) quedan fuera del clip. Las gemelas van sin
   `accessibilityLabel` (el a11y candea solo la copia base).

## Consecuencias

- El engine queda autocontenido y portable (no pierde fracciones si se
  reusa standalone); el estado es más chico y serializable.
- Corrigió de paso un doble conteo del sobrante (el híbrido previo lo sumaba
  en `state.remainderMs` y en el acumulador del store): la cadencia era
  levemente más rápida que la nominal; hay test de cadencia exacta.
- Presupuesto medido (baseline instrumentada): `loop.advance` p95 0.1 ms,
  `uiFrame.maxDt` p95 16.8 ms, 0 frames dropeados con ~100 segmentos.
- Alternativa descartada: SVG/Skia solo para el juego (mejor draw-time
  teórico, pero +2.9 MB CanvasKit en web, a11y/tests por reconstruir y
  contradice ADR 0001). Si un juego futuro lo amerita, evaluar con un PoC
  aislado en la galería de preview del juego, no con el juego en producción.
