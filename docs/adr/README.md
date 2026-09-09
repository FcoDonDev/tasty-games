# Decisiones de diseño (ADRs)

Registro de decisiones de arquitectura **transversales** del proyecto. Cada archivo
documenta una decisión con su contexto, la decisión tomada y sus consecuencias.

Las decisiones **específicas de un juego** (ajustes, reglas, seeds, fórmula de score)
viven en el README de ese juego (`src/games/<id>/README.md`), no acá.

Para proponer un cambio que contradiga un ADR: crear un nuevo ADR que lo reemplace
(manteniendo el historial) o marcar el existente como `Superada` con referencia.

## Índice

| ADR | Estado | Tema |
|---|---|---|
| [0001](0001-render-sin-skia.md) | Aceptada | Render con Views nativos, sin Skia |
| [0002](0002-persistencia-dual.md) | Aceptada | Persistencia dual: sqlite nativo + localStorage |
| [0003](0003-e2e-android-dev-build.md) | Aceptada (ejecución pendiente) | E2E Android contra dev build, no Expo Go |
| [0004](0004-mobile-first-responsive.md) | Aceptada | Mobile-first y responsive con medición real |
| [0005](0005-convencion-score.md) | Aceptada | Convención de score: más es mejor |
| [0006](0006-seeds-e2e-sentinelas.md) | Aceptada | Seeds E2E sentinelas, gated por `EXPO_PUBLIC_E2E` |
| [0007](0007-damas-mvp-local.md) | Aceptada (revisable con IA) | Damas: 2 jugadores locales, MVP sin récord |
| [0008](0008-persistencia-estado-en-curso.md) | Aceptada | Persistencia del estado en curso de una partida (auto-resume) |
| [0009](0009-landscape-movil-por-juego.md) | Aceptada (validación device pendiente) | Landscape móvil por juego: `supportsLandscape`, header vertical, orientación nativa |
| [0010](0010-wakwak-motor-agnostico.md) | Aceptada | Wak Wak: núcleo lógico agnóstico al motor + adaptador Views/Reanimated |
| [0011](0011-metricas-performance.md) | Aceptada | Métricas de performance gated por `EXPO_PUBLIC_PERF_METRICS` |
| [0012](0012-previews-diseno-dev-only.md) | Aceptada | Previews de diseño dev-only dentro del módulo del juego (ruta dev-only, componentes reales, aprobación antes de tocar el render) |
| [0013](0013-pwa-instalable-sin-service-worker.md) | Aceptada | PWA instalable (manifest standalone + metas Apple) sin Service Worker |
