# Auditoría de performance

**Fecha:** 2026-09-09
**Estado:** análisis estático documentado
**Alcance:** aplicación web y Android basada en Expo SDK 57; iOS solo fue inspeccionado estáticamente, no validado
**Cambios de código realizados durante la auditoría:** ninguno

## 1. Resumen ejecutivo

La aplicación tiene una base técnica razonable para juegos 2D interactivos:

- Expo SDK 57, React Native 0.86, React 19 y React Native Web.
- Reanimated 4 + Worklets para animaciones y gestos.
- Gesture Handler para drag and drop.
- Zustand con stores independientes por juego.
- Engines aislados y testeables para reglas, layout y simulación; la pureza referencial debe distinguirse por juego.
- Layout responsive basado en `onLayout` mediante `useContainerSize`.
- Instrumentación de performance opcional mediante `EXPO_PUBLIC_PERF_METRICS`.

Los riesgos más importantes no provienen de una elección incorrecta de librería. Se concentran en la frecuencia con que se publican datos al estado/UI y en la falta de una medición suficientemente fiable para distinguir JS, React, UI thread, GPU y almacenamiento.

### Prioridades

| ID | Prioridad | Área | Evidencia estática | Impacto potencial |
|---|---|---|---|---|
| F-01 | P0 | WakWak, estado por frame | E-static: alta | CPU, GC, JS jank y batería |
| F-02 | P0 | WakWak, presentación por frame | E-static: alta | Trabajo UI y frames perdidos |
| F-03 | P0 | Métricas de frames, drag y memoria | E-static: alta | Diagnóstico incorrecto y regresiones invisibles |
| F-04 | P1 | WakWak, loop durante pausa/fin | E-static: alta | Trabajo continuo innecesario |
| F-05 | P1 | WakWak, reconciliación del laberinto | E-static: alta | Picos de commit al recoger elementos |
| F-06 | P1 | Damas, reglas legales repetidas | E-static: alta | Latencia en drag y posiciones complejas |
| F-07 | P1 | Solitario, validación duplicada | E-static: alta | Coste extra por interacción |
| F-08 | P1 | Solitario, undo y persistencia | E-static: alta | Bloqueos puntuales, memoria creciente |
| F-09 | P1 | Solitario, render y recognizers | E-static: media-alta | Coste de interacción y reconciliación |
| F-10 | P1 | Bundle inicial eager | E-static: alta | Startup y descarga web |
| F-11 | P1 | Persistencia/hidratación/récords | E-static: alta | Startup y navegación |
| F-12 | P1 | Audio y lifecycle nativo | E-static: alta | Cold start audible, memoria y configuración nativa |
| F-13 | P2 | Memorice sin memoización | E-static: alta | Coste pequeño pero evitable |
| F-14 | P2 | Imports platform-specific | E-static: media | Bundle web potencialmente mayor |

Las prioridades indican orden de investigación y corrección. `E-static` significa que el mecanismo se observa en el código; no significa que el impacto esté medido. P0 incluye problemas de hot path y de validez de instrumentación que deben resolverse antes de comparar resultados.

## 2. Metodología

Se inspeccionaron:

- `app/` y la resolución de rutas de Expo Router.
- `src/core/`, incluyendo registro de juegos, persistencia, audio, haptics, gestos, layout, tema y métricas.
- `src/games/memorice/`.
- `src/games/solitario/`.
- `src/games/damas/`.
- `src/games/wakwak/`.
- `package.json`, `pnpm-lock.yaml`, `app.json`, configuración de Playwright, mocks y CI.
- ADRs, `GOTCHAS.md`, `ROADMAP.md`, `ARCHITECTURE.md`, `UI-UX.md` y READMEs de cada juego.

También se cargaron y aplicaron como criterio de evaluación las skills disponibles:

- `expo-animation`: separación entre RN runtime y UI runtime, propiedades no-layout, memoización de gestos/frame callbacks, reduced motion y release builds.
- `expo-native-ui`: evaluación de componentes y controles nativos, lifecycle y responsive layout.
- `expo-router`: rutas, carga asíncrona y relación entre estructura de rutas y bundle.

No se ejecutaron `pnpm typecheck`, `pnpm test`, `node scripts/e2e.mjs`, exports web ni builds Android. No se realizaron mediciones nuevas de FPS, memoria, bundle, GPU o audio. Los resultados históricos de `docs/adr/0011-metricas-performance.md:37-57` son dev web a 360x640 y no constituyen el baseline de release de este plan.

## 3. Arquitectura revisada

### 3.1 Registro y rutas

`src/core/game-registry.ts:1-14` importa eager las cuatro definiciones de juego y sus pantallas. El registro se consume desde:

- `app/index.tsx:7,65-78` para Home.
- `app/juego/[id].tsx:5,19,63-85` para montar la pantalla seleccionada.
- `src/core/ui/GameHeader.tsx:4,73-76` para resolver las reglas.

Esto ofrece una arquitectura simple para agregar juegos, pero convierte todas las pantallas en dependencias alcanzables desde Home y la ruta dinámica.

### 3.2 Estado

Cada juego tiene un store Zustand privado:

- `src/games/memorice/engine/state.ts`.
- `src/games/solitario/engine/state.ts`.
- `src/games/damas/engine/state.ts`.
- `src/games/wakwak/engine/state.ts`.

La separación por juego cumple la regla de aislamiento del repositorio. El problema no es Zustand en sí, sino usar una actualización inmutable de store como canal de publicación de una simulación de 60 Hz en WakWak.

### 3.3 Render y animación

Solitario y Damas utilizan `src/core/ui/drag/useDraggable.ts`:

- `Gesture.Pan()` con umbrales de activación.
- shared values para `tx` y `ty`.
- `.set()` en `onUpdate` sin cruzar al runtime JS por frame.
- `scheduleOnRN` solo para callbacks discretos.
- velocity handoff para settle y snap-back.
- `cancelAnimation` al comenzar un nuevo drag.

WakWak utiliza un adaptador propio:

- loop `requestAnimationFrame` en `WakWakScreen`.
- simulación aislada y determinista dado el orden de llamadas en `engine/rules.ts`.
- snapshot de mundo por frame.
- presentación imperativa en `EntitiesLayer` mediante shared values.
- capa estática/dinámica separada parcialmente en `MazeLayer`.

La dirección general es correcta, pero WakWak todavía publica y asigna más información de la necesaria por frame.

### 3.4 Persistencia

El repositorio mantiene pares nativo/web:

- SQLite síncrono en `src/core/db/repositories/*.ts`.
- `localStorage` en `src/core/db/repositories/*.web.ts`.

La interfaz es async, pero varias implementaciones nativas ejecutan `getFirstSync`, `runSync` o `execSync` antes de devolver la Promise. En web, `localStorage` y JSON son síncronos por naturaleza.

### 3.5 Instrumentación

`src/core/perf/index.ts` mantiene sesiones por juego con:

- timers de drag, audio, render y stalls JS.
- contadores de render y frames UI.
- p95, promedio y mínimo; todavía no p50/p99/máximo ni metadata de escenario.
- snapshot web en `localStorage`.

Cada timer conserva todas sus muestras en memoria (`src/core/perf/index.ts:80-86`) y la sesión queda retenida después de cerrarse. Esto puede contaminar una medición larga de memoria y debe formar parte de F-03.

La instrumentación es útil como punto de partida, pero no constituye todavía una medición de performance de release ni un gate automático.

## 4. Matriz de librerías y componentes

| Librería/componente | Versión o ubicación | Evaluación |
|---|---|---|
| Expo | `~57.0.19` | Alineado con el SDK objetivo |
| React Native | `0.86.3` | El presupuesto nominal es 16.67 ms a 60 Hz |
| React | `19.2.3` | React Compiler aparece en lockfile, no está habilitado |
| Reanimated | `4.5.1` | Compatible con Worklets 0.10.x; patrón general correcto |
| React Native Worklets | `0.10.1` | Uso correcto de `scheduleOnRN`; falta validar nativo |
| Gesture Handler | `~2.32.0` | Adecuado; potencial coste por cantidad de recognizers |
| Zustand | `5.0.15` | Selectores estrechos; publicación por frame de WakWak es el problema |
| React Native Web | `0.21.2` en lockfile | Worklets no tienen UI thread separado en web |
| `expo-sqlite` | `~57.0.2` | API sync puede bloquear JS |
| `expo-audio` | `~57.0.4` | Players manuales requieren lifecycle explícito |
| `FlatList` | Home | Solo cuatro juegos; no justifica FlashList |
| `React.memo` | Cartas, fichas, pilas | Aplicado correctamente en Solitario y Damas |
| `React.Profiler` | Damas y Solitario | Útil en diagnóstico, pero debe montarse condicionalmente |
| `@expo/ui` | Presente de forma transitiva en lockfile | No es una oportunidad de performance para estos modales pequeños |
| Skia | No instalado como dependencia directa | No debe incorporarse sin una medición que justifique cambiar el renderer |

## 5. Hallazgos detallados

### F-01. WakWak actualiza Zustand en cada frame

**Evidencia:**

- `src/games/wakwak/WakWakScreen.tsx:292-315`.
- `src/games/wakwak/engine/state.ts:86-91`.
- `src/games/wakwak/engine/rules.ts:336-350`.

`tick()` obtiene el estado actual, ejecuta `advance()` y publica el resultado si la referencia cambió. `advance()` devuelve siempre un nuevo objeto con `remainderMs`, incluso si no hubo un paso de simulación completo. El residuo es parte del estado actual (`rules.ts:118-119`), por lo que no se puede omitir la publicación sin transferir explícitamente su ownership al adaptador.

En un frame normal se puede generar:

- un nuevo objeto `GameState`;
- un nuevo robot;
- un nuevo array de drones;
- arrays temporales de eventos;
- nuevos objetos de snapshot/presentación;
- evaluación de todos los suscriptores Zustand.

Los selectores del HUD impiden que toda la pantalla React se renderice a 60 Hz, pero no eliminan la publicación ni las asignaciones.

**Impacto potencial:** CPU, GC, batería y pérdida de frames en dispositivos modestos, especialmente en niveles altos o con frames tardíos.

**Qué medir:**

- duración de `advance`, `step`, `worldSnapshot` y `present`;
- número de asignaciones por frame;
- p50/p95/p99 de `requestAnimationFrame`;
- pausas de GC y memoria JS;
- comparación entre nivel 1, nivel 8 y juego pausado.

**Dirección recomendada:** conservar el engine aislado y sus tests deterministas, pero decidir explícitamente si `remainderMs` permanece en `GameState`, se devuelve por separado o vive en un acumulador del adaptador. Separar después el canal de publicación a React, publicando HUD/eventos discretos y manteniendo la pose visual en el adaptador.

### F-02. WakWak escribe shared values aunque no cambien

**Evidencia:**

- `src/games/wakwak/engine/rules.ts:238-260`.
- `src/games/wakwak/renderer/reanimated/EntitiesLayer.tsx:125-143`.

`worldSnapshot()` recalcula `floatPos()` para robot y drones. `EntityImpl.present()` escribe siempre:

- `tx`;
- `ty`;
- `opacity`;
- `moving`;
- `powered`.

También evalúa el gate de parpadeo de los drones. Cinco entidades implican un máximo estático de aproximadamente 25 escrituras potenciales por frame; no es una medición del coste nativo real.

En `engine/rules.ts:508-513`, además, `floatPos(robot)` se recalcula dentro de la iteración de cada drone. En `engine/feel.ts:70-86`, `threatsOf()` se calcula durante power aunque `slowMoScale()` retorna inmediatamente 1.

**Impacto potencial:** más trabajo en el UI runtime nativo y mayor presión sobre el hilo principal web.

**Dirección recomendada:** comparar contra el último frame presentado, agrupar cambios y publicar solo valores modificados. Debe medirse en nativo porque la traducción de shared values a propiedades Fabric puede comportarse distinto en web.

### F-03. El monitor de frames y drag tiene problemas de validez

**Evidencia:**

- `src/core/perf/usePerfFrameMonitor.ts:13-39`.
- `src/games/wakwak/WakWakScreen.tsx:38-39,292-315`.
- `src/games/solitario/SolitarioScreen.tsx:440-445`.
- `src/games/damas/DamasScreen.tsx:178-182`.

Problemas concretos:

- El callback de `useFrameCallback` se crea inline. La documentación de Reanimated recomienda memoizarlo.
- El umbral UI es 20 ms, superior al presupuesto de 16.67 ms a 60 Hz.
- El monitor solo se usa en WakWak.
- No se conserva distribución de `dt`, p99, máximo ni porcentaje real de frames perdidos. Un `dt` de 50 ms cuenta como un único evento largo, igual que uno de 21 ms.
- `drag.ui2js` se calcula al final del handler, no al entrar en él.
- La comparabilidad entre `_getAnimationTimestamp()` y `performance.now()` nativos sigue sin validar.
- `React.Profiler` continúa montado aunque el gate de métricas esté apagado.
- El monitor hook se invoca siempre, aunque desactive su callback mediante `active=false`; no debe confundirse con un monitor completamente ausente.
- La memoria de muestras no está acotada durante sesiones largas.

**Impacto:** una optimización podría parecer efectiva o regresiva por un error de instrumentación, y un jank de 17-19 ms puede no aparecer como frame perdido.

**Dirección recomendada:** corregir primero la telemetría. Medir UI-to-JS en la primera instrucción del callback, separar `queue latency` de `handler duration`, parametrizar el presupuesto por refresh rate y evitar activar callbacks/intervalos o profiling cuando el gate esté apagado. No deben llamarse hooks condicionalmente; el gating debe resolverse mediante un wrapper/componente estable. Renombrar `uiFrames.dropped` a eventos de frame largo o calcular frames estimados omitidos a partir de `dt`.

### F-04. El loop y los idle animations permanecen activos durante pausa y fin

**Evidencia:**

- `src/games/wakwak/WakWakScreen.tsx:301-315`.
- `src/games/wakwak/renderer/reanimated/EntitiesLayer.tsx:102-123`.

La condición de juego evita `tick`, pero `present()` y el `requestAnimationFrame` siguen ejecutándose. Los loops `withRepeat` se inician al montar cada entidad y no consultan `paused` ni `status`.

**Impacto potencial:** consumo de CPU/UI y batería cuando la partida está pausada, en interstitial o mostrando el resultado.

**Dirección recomendada:** suspender el loop cuando no haya simulación y controlar explícitamente el lifecycle de idle animations.

### F-05. MazeLayer reconstruye contenido estático en cada pickup

**Evidencia:**

- `src/games/wakwak/renderer/reanimated/MazeLayer.tsx:33-47,53-119`.
- `src/games/wakwak/engine/rules.ts:407-416`.

Los metadatos de muros están memoizados, pero los nodos React de muros y corral se crean dentro del render. Al cambiar `batteries` o `supers`, se reconcilia una rama React que incluye todos los muros, corral y elementos dinámicos. No está demostrado que todos los muros se repinten nativamente.

**Dirección recomendada:** separar `WallsLayer`, `CorralLayer` y `EdiblesLayer`; precomputar estilos/nodos por `cellSize` y limitar el render dinámico a las celdas que cambiaron.

### F-06. Damas recalcula legalidad global varias veces

**Evidencia:**

- `src/games/damas/DamasScreen.tsx:102-123`.
- `src/games/damas/engine/rules.ts:191-229,250-270`.
- `src/games/damas/engine/state.ts:43-64`.

`legalMovesForPiece()` puede ejecutar `hasCapture()` global. La misma información se recalcula en `movablePieceIds`, al iniciar el drag, al aplicar el movimiento y al determinar el resultado del turno siguiente.

En cadenas de damas voladoras, `kingCaptureChains()` ramifica y crea nuevos `Set`/arrays.

**Dirección recomendada:** calcular una estructura de movimientos legales para el tablero y turno actuales, indexada por pieza, y reutilizarla. Mantener validación defensiva en el store, pero evitar recomputar el mismo mapa varias veces dentro de una interacción.

### F-07. Solitario duplica validación de drop

**Evidencia:**

- `src/games/solitario/SolitarioScreen.tsx:385-410`.
- `src/games/solitario/engine/state.ts:71-123,204-223`.

La pantalla calcula `canPickUp`, `canDropOnFoundation` y `canDropOnTableau` antes del commit para disparar feedback. El store vuelve a realizar esas validaciones.

La duplicación es funcionalmente comprensible, pero es trabajo adicional en cada drag y auto-move.

**Dirección recomendada:** medir primero. Si es relevante, transportar un resultado canónico de validación asociado al estado/version del tablero, sin eliminar la validación de seguridad del store.

### F-08. Undo crece con los movimientos; persistencia repite un snapshot acotado

**Evidencia:**

- `src/games/solitario/engine/state.ts:57-62,86-110,183-201`.
- `src/games/solitario/engine/persistence.ts:40-52`.
- `src/games/solitario/SolitarioScreen.tsx:184-200`.

Con undo activo, cada acción conserva arrays de todas las pilas. Los objetos de carta se comparten en muchos snapshots, pero los arrays y referencias retenidas crecen con el número de movimientos. El historial no se serializa en `serializeSolitarioState()` (`engine/persistence.ts:40-52`), por lo que el payload persistido representa el estado actual y no crece linealmente con `history`.

Cada periodo de 300 ms de inactividad después de un commit puede ejecutar serialización y escritura completa del estado actual.

**Dirección recomendada:** medir memoria a 10, 50 y 100 movimientos, con undo activado/desactivado, además de `JSON.stringify`, tamaño del payload, escritura web y escritura nativa. El tamaño del payload no debe presentarse como heap.

### F-09. Solitario recalcula layout y monta muchos recognizers

**Evidencia:**

- `src/games/solitario/components/Pile.tsx:189-279`.
- `src/games/solitario/engine/layout.ts:84-126`.
- `src/core/ui/drag/useDraggable.ts:52-112`.

Cada render de `Pile` puede recalcular secuencias válidas y posiciones mediante slices y recorridos de prefijos. `dragKey`, targets válidos y cambios del store hacen que varios padres se vuelvan a ejecutar.

El hook de gesto está memoizado, lo cual es correcto, pero cambios en `enabled` pueden reconstruir los gestures de muchas cartas.

**Dirección recomendada:** precomputar posiciones y validez por columna, reducir el estado React transitorio del drag y medir tiempo desde pointer-down hasta `onDragStart`.

### F-10. El registro de juegos impide una reducción efectiva del bundle inicial

**Evidencia:**

- `src/core/game-registry.ts:2-10`.
- `app/index.tsx:7,65-78`.
- `app/juego/[id].tsx:5,19,63-85`.

Todos los `Component` son imports ESM estáticos y están incluidos explícitamente en el array del registro. Tree shaking no puede eliminar juegos que el registro utiliza.

`asyncRoutes` puede dividir por archivos de ruta, pero no separa automáticamente cuatro componentes referenciados por el mismo módulo.

**Dirección recomendada:** separar metadatos de juegos de los componentes y evaluar carga diferida por pantalla, especialmente en web. Medir con Expo Atlas antes y después.

### F-11. Hidratación y récords hacen trabajo repetido

**Evidencia:**

- `app/_layout.tsx:12-22`.
- `src/core/ui/ThemeProvider.tsx:9-15`.
- `src/core/ui/GameCard.tsx:37-39`.
- `src/core/ui/ScoreBoard.tsx:17-27`.
- `src/core/db/repositories/recordsRepository.web.ts:13-42`.
- `src/core/db/repositories/recordsRepository.ts:22-40`.

La hidratación global se dispara desde dos componentes. Home consulta el mejor récord por tarjeta y la pantalla de juego consulta de nuevo el récord seleccionado. La primera lectura nativa puede abrir/migrar SQLite (`src/core/db/client.ts:6-25`). En web cada `bestFor()` parsea, filtra y ordena el conjunto completo de `localStorage`, cuyo tamaño no está acotado por el repositorio actual.

**Dirección recomendada:** single-flight para `hydrate`, cache de preferencias y cache/invalidation de récords. Usar APIs SQLite async cuando la consulta pueda coincidir con una interacción.

### F-12. Audio requiere lifecycle y precalentamiento homogéneos

**Evidencia:**

- `src/core/ui/sound.ts:22-46,65-75`.
- `src/games/solitario/SolitarioScreen.tsx:121-129`.
- `src/games/wakwak/WakWakScreen.tsx:232-285`.
- `app.json:30-42`.

Solitario precalienta cuatro players; WakWak crea players bajo demanda en el primer evento. El cache global conserva players hasta el fin del proceso.

El plugin de `expo-audio` está configurado sin opciones. En SDK 57 la documentación indica que `enableBackgroundPlayback` tiene valor por defecto `true` y `recordAudioAndroid` también tiene valor por defecto `true`, lo que puede añadir configuración nativa innecesaria para efectos cortos. `sound.ts:6-14` resuelve los assets WAV al importar el módulo; el `require('expo-audio')` diferido solo aplaza la evaluación del módulo, no la inclusión de esos assets.

**Dirección recomendada:** medir cold-start, precalentar por juego, liberar players y revisar la configuración de background playback.

### F-13. Memorice no memoiza `Card`

**Evidencia:**

- `src/games/memorice/MemoriceScreen.tsx:97-121`.
- `src/games/memorice/components/Card.tsx:35-104`.

Cada cambio del store vuelve a ejecutar las 16 cartas. También se crean closures y estilos por carta.

El impacto es bajo por el tamaño fijo del tablero. La mejora debe hacerse solo estabilizando correctamente el callback o cambiando el contrato de props; añadir `memo` sin resolver `onPress` recreado puede no aportar.

### F-14. Imports platform-specific mejorables

**Evidencia:**

- `src/core/ui/haptics.ts:1-3`.
- `src/core/ui/sound.ts:6-29`.

`expo-haptics` se importa universalmente y se evita la ejecución por `EXPO_OS`. Expo documenta que `EXPO_OS` no produce por sí solo platform shaking de imports. La infraestructura de audio usa `require('expo-audio')` dentro de `getAudioModule()` para diferir la evaluación del módulo, pero los siete `require()` de assets WAV ocurren en module scope y los módulos CommonJS no participan igual en tree shaking.

**Prioridad:** baja. Solo actuar si Expo Atlas confirma impacto en el bundle web.

## 6. Qué está bien resuelto

No se recomienda cambiar estos patrones sin evidencia:

- `useDraggable` evita `setState` por frame.
- Los callbacks JS de gestos no se programan desde `onUpdate`.
- Se utiliza `scheduleOnRN`, no `runOnJS` deprecado.
- Los settle/snap-back usan velocity handoff.
- Se usa `cancelAnimation` para interrupciones.
- Las animaciones Reanimated priorizan `transform`/`opacity` y usan la política de reduced motion del sistema; el feedback CSS de `PressableScale` debe verificarse por separado.
- `PlayingCard`, `PileCard`, `PieceView` y `Square` están memoizados.
- `useContainerSize` evita dimensiones adivinadas y actualizaciones redundantes.
- Home usa `FlatList`, pero solo tiene cuatro juegos; no existe un problema de virtualización a esta escala.
- `CADisableMinimumFrameDurationOnPhone` está configurado en `app.json:10-14`.
- El engine de WakWak permanece aislado y es determinista dado el orden de llamadas; su RNG es una clausura mutable y no debe describirse como referencialmente puro.
- Los engines de reglas tienen tests unitarios extensos.

## 7. Gaps de verificación

### Cobertura actual

La suite protege bien reglas y flujos funcionales, pero no protege automáticamente:

- FPS real.
- p95/p99 de frame.
- tiempo de UI thread.
- tiempo de GPU/RenderThread.
- memoria JS/Hermes/nativa.
- coste audible real del audio.
- tamaño de bundle web o APK/AAB.
- regresiones nativas de Android.
- seguimiento mid-gesture y handoff de velocidad.

### CI

`.github/workflows/ci.yml:9-32` ejecuta únicamente:

- `pnpm typecheck`.
- `pnpm test --ci`.

No ejecuta `pnpm e2e:web`, export web, Atlas ni una medición de performance.

### E2E

Los specs verifican resultados finales y estado funcional. La documentación de `docs/UI-UX.md:93-103` recomienda verificaciones mid-gesture, pero no están automatizadas como gate.

Los mocks de `react-native-reanimated` y `react-native-worklets` en `__mocks__/` no ejecutan runtimes reales. El E2E web ejecuta Reanimated sobre el hilo principal del navegador, por lo que no demuestra el comportamiento nativo.

Los resultados históricos de `docs/adr/0011-metricas-performance.md:37-57` son mediciones de desarrollo web con un protocolo anterior. Sirven como contexto, pero no son comparables directamente con un baseline de release, Android, GPU o memoria.

### Protocolo y referencias internas

Existen referencias a `PLAN-PERFORMANCE.md` en:

- `docs/GOTCHAS.md:142-163`.
- `src/core/perf/index.ts:1-4`.
- `src/core/ui/sound.ts:58-63`.
- `src/core/ui/drag/useDraggable.ts:15-17`.
- `src/games/solitario/SolitarioScreen.tsx:385-388`.
- `src/games/solitario/README.md:56-61`.

`PLAN-PERFORMANCE.md` existe como propuesta no implementada y debe convertirse en el protocolo versionado para las siguientes fases. Algunas referencias del código apuntan a numeración histórica que el plan actual debe corregir:

- `src/core/ui/drag/useDraggable.ts:15-17` menciona `PLAN-PERFORMANCE.md 1.6`.
- `src/games/damas/DamasScreen.tsx:178-182` menciona el mismo protocolo histórico.
- `src/games/solitario/SolitarioScreen.tsx:385-388,440-445` menciona `Fase 2` y `PLAN 1.6`.
- `src/core/ui/sound.ts:58-63` menciona `Fase 2` para audio, mientras el plan propuesto ubica audio en la fase de recursos.

Estas referencias de comentarios no se modifican en esta auditoría documental, pero deben actualizarse cuando se implemente el plan.

## 8. Trazabilidad auditoría-plan

| Hallazgos | Fase propuesta | Artefacto esperado |
|---|---|---|
| F-01, F-02, F-04, F-05 | WakWak | baseline de loop, snapshot/present, fixtures y comparación post-fix |
| F-03 | Instrumentación | esquema de métricas, tests semánticos y snapshot versionado |
| F-06 | Damas | fixtures complejos, mapa de legalidad y latencia de drag |
| F-07, F-08, F-09 | Solitario | render, validación, undo y persistencia separados |
| F-10, F-11, F-12 | Startup, bundle y recursos | Atlas, cache de estado/récords y lifecycle de audio |
| F-13, F-14 | Memorice y core | decisión basada en medición de renders y bundle |

La etiqueta `M-medido` solo podrá usarse después de producir el artefacto correspondiente. Los demás hallazgos permanecen como `E-static` o `H-hipótesis`.

## 9. Referencias web comprobables

### React Native

- [Performance Overview 0.86](https://reactnative.dev/docs/0.86/performance): documentación versionada correspondiente al lockfile del proyecto; distingue JS FPS y UI FPS, establece el presupuesto aproximado de 16.67 ms a 60 Hz y recomienda validar en release.
- [Profiling 0.86](https://reactnative.dev/docs/0.86/profiling): documentación versionada correspondiente al lockfile; recomienda Android Studio System Tracing/Perfetto y separar UI Thread, JS Thread, Native Modules Thread y RenderThread.
- [Optimizing JavaScript Loading 0.86](https://reactnative.dev/docs/0.86/optimizing-javascript-loading): documentación versionada correspondiente al lockfile; describe lazy loading de componentes grandes y advierte sobre `inlineRequires` y side effects.

### Reanimated y Worklets

- [Worklets](https://docs.swmansion.com/react-native-reanimated/docs/guides/worklets/): confirma ejecución en UI thread nativo, `scheduleOnRN` y que web no tiene UI thread separado.
- [Performance](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/): recomienda no leer shared values desde JS, preferir propiedades no-layout, memoizar frame callbacks y memoizar gestures.
- [useFrameCallback](https://docs.swmansion.com/react-native-reanimated/docs/advanced/useFrameCallback/): referencia específica para callbacks por frame y su lifecycle.
- [Feature flags](https://docs.swmansion.com/react-native-reanimated/docs/guides/feature-flags/): documenta `ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS`, `IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS` y sus efectos colaterales en hit testing y builds nativos.

### Expo y Metro

- [Expo Atlas](https://docs.expo.dev/guides/analyzing-bundles/): recomienda analizar `.expo/atlas.jsonl` para identificar módulos que dominan el bundle.
- [Tree shaking](https://docs.expo.dev/guides/tree-shaking/): explica platform shaking, límites de `require()` y optimización ESM.
- [Expo Router async routes](https://docs.expo.dev/router/web/async-routes/): documenta route splitting web, estado alpha y ausencia de soporte productivo nativo.
- [Metro SDK 57](https://docs.expo.dev/versions/v57.0.0/config/metro/): documenta bundle splitting web y la posibilidad de Web Workers solo para cálculos pesados en web.
- [React Compiler en Expo](https://docs.expo.dev/guides/react-compiler/): documenta healthcheck y adopción incremental; debe evaluarse después de corregir la instrumentación.

### Persistencia, audio y React

- [Expo Audio SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/audio): `createAudioPlayer` no se libera automáticamente, expone lifecycle explícito y documenta `enableBackgroundPlayback`.
- [Expo SQLite SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite): advierte que APIs sync pesadas pueden bloquear el JavaScript thread.
- [React Profiler](https://react.dev/reference/react/Profiler): indica que profiling agrega overhead y que cada Profiler debe usarse solo cuando sea necesario.
- [Zustand subscribeWithSelector](https://zustand.docs.pmnd.rs/reference/middlewares/subscribe-with-selector): documenta suscripciones selectivas sin forzar renders de componentes.

La función `_getAnimationTimestamp()` usada por el proyecto es un global privado/no estable del paquete Worklets; la documentación oficial de Reanimated no la presenta como API pública y su comparabilidad nativa debe validarse.

## 10. Limitaciones

Esta auditoría no afirma que todos los riesgos produzcan jank observable en dispositivos actuales. Los puntos de mayor confianza son mecanismos visibles en el código; el impacto debe confirmarse con:

- export web de producción;
- release Android;
- dispositivo Android lento;
- trazas de Android Studio/Perfetto;
- mediciones repetidas con warm-up y escenarios deterministas.
