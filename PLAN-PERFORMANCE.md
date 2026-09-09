# Plan de mejora de performance

**Fecha de propuesta:** 2026-09-09
**Estado:** propuesta, no implementada, decisiones pendientes de aprobación
**Documento base:** [`docs/PERFORMANCE-AUDIT.md`](docs/PERFORMANCE-AUDIT.md)
**Alcance:** performance de gameplay, startup, bundle, persistencia, audio y observabilidad

Este archivo es el PLAN activo del requerimiento. No sustituye los ADRs ni los
READMEs de cada juego. Durante la implementación debe mantenerse commiteado y,
solo después de la verificación completa y la migración de hallazgos, eliminarse
según el flujo de `AGENTS.md`.

## 1. Objetivo

Mejorar y demostrar la performance de los cuatro juegos sin cambiar sus reglas ni romper la arquitectura de aislamiento entre juegos.

El plan prioriza primero la calidad de la medición. Ninguna optimización de alto impacto debe aceptarse únicamente por inspección de código o por resultados en modo desarrollo.

## 2. Principios

- Medir antes y después con el mismo escenario determinista.
- Diagnosticar con build instrumentado web, comparar funcionalidad en release web y validar conclusiones nativas en release Android.
- Mantener los engines aislados y deterministas según su contrato actual. WakWak
  usa un RNG de clausura mutable, por lo que la equivalencia debe probarse dado
  el mismo orden de llamadas, no asumirse como pureza referencial.
- No introducir `setState` o publicaciones React por frame en juegos de tiempo real.
- Mantener animaciones continuas en Reanimated/UI runtime cuando exista.
- No adoptar Skia, React Compiler ni feature flags experimentales como solución por defecto.
- Separar métricas de JS, React render, UI thread, GPU, memoria, audio y almacenamiento.
- Mantener la interfaz async de los repositorios duales.
- Preservar los seeds E2E y los resultados funcionales actuales.

## 3. Decisiones y alternativas

Estas son propuestas, no decisiones aprobadas para implementación.

| Tema | Alternativas | Recomendación provisional | Estado |
|---|---|---|---|
| Build de medición | Instrumentado con `EXPO_PUBLIC_PERF_METRICS=1` / release con gate apagado | Separar ambos perfiles; usar el instrumentado para diagnóstico y release para regresión | Pendiente |
| Ownership de `remainderMs` en WakWak | Mantenerlo en `GameState` / retornarlo separado / mover acumulador al adaptador | Evaluar mover el acumulador al adaptador sin cambiar `advance()` hasta demostrar equivalencia | Pendiente |
| Publicación de poses | Zustand / estado transitorio del adaptador / shared values | Mantener reglas puras y publicar HUD/eventos discretos; poses fuera de React | Pendiente |
| Bundle de juegos | Registro eager / metadata + loader web / loader universal con fallback nativo | Medir Atlas primero; solo introducir loader si supera el presupuesto | Pendiente |
| Legalidad de Damas | Recalcular / mapa cacheado por `board` + `turn` | Mapa cacheado con validación final en store | Pendiente |
| Persistencia Solitario | Mantener debounce / idle web + cola nativa / diffs | Medir primero; cambiar scheduling solo si cruza el presupuesto | Pendiente |
| Audio | Cache permanente / cache con lifecycle / players por pantalla | Cache con lifecycle explícito y configuración de background decidida por producto | Pendiente |

## 4. No objetivos

- No cambiar reglas, scoring, dificultad o timing de gameplay.
- No migrar todos los controles a `@expo/ui` solo por motivos de performance.
- No sustituir `FlatList` por FlashList para la Home actual de cuatro elementos.
- No migrar WakWak a Skia sin una traza que demuestre que Views/Reanimated son el cuello de botella.
- No habilitar React Compiler globalmente sin healthcheck, baseline y revisión de compatibilidad con Reanimated.
- No convertir cada métrica de desarrollo en lógica de producción.

## 5. Presupuesto inicial de referencia

Estos valores son presupuestos de diagnóstico, no todavía criterios definitivos de release:

| Métrica | 60 Hz | 120 Hz | Nota |
|---|---:|---:|---|
| Frame total | 16.67 ms | 8.33 ms | Incluye trabajo necesario para presentar el frame |
| Alerta JS rAF | >16.67 ms | >8.33 ms | Debe registrarse, no confundirse con UI FPS |
| Stall severo | >25 ms | >16.67 ms | Umbral útil para encontrar pausas perceptibles |
| UI frame perdido | `dt > budget` | `dt > budget` | Presupuesto dependiente de refresh rate |
| Drag UI-to-JS | Medir p95 | Medir p95 | Timestamp tomado al entrar al callback |
| Handler JS | Medir p95 | Medir p95 | Validación y commit separados |
| Render React | Medir actual/base | Medir actual/base | No representa pintura ni GPU |

Los umbrales siguientes son una propuesta inicial y deben quedar confirmados en
el primer baseline. La regla comparativa propuesta es ejecutar cinco lotes
independientes del mismo escenario, con 5 warm-up runs y 30 runs medidas por lote.
Aceptar una mejora solo si la mediana de los p95 mejora al menos 10% y ninguna
métrica crítica empeora más de 10%. Si la dispersión impide esa conclusión, el
resultado queda como inconcluso, no como mejora.

`dt > budget` no equivale automáticamente a un frame perdido. El esquema debe
conservar `longFrameEvents` y, si se calcula, `estimatedDroppedFrames` usando el
presupuesto del escenario. Un hueco de 50 ms debe distinguirse de uno de 21 ms.

## 6. Modelo de medición

El modelo de snapshot propuesto debe versionarse antes del baseline:

```text
schemaVersion
gameId
scenarioId
runId
platform
buildMode
commit
viewport
refreshHz
seed
warmupSamples
timers: count/avg/p50/p95/p99/max
uiFrames: total/longFrameEvents/estimatedDroppedFrames/dropRatio
counters
```

El `PerfSnapshot` actual solo contiene count, avg, min y p95. La implementación
de esta fase debe añadir p50/p99/max y definir el método estadístico, por ejemplo
nearest-rank (`ceil(p * n) - 1`). Debe haber tests para muestras pequeñas y para
casos donde p95 no coincida con el máximo.

Las muestras deben estar acotadas o resumirse con histograma/reservoir sampling.
Una sesión larga no puede conservar indefinidamente todos los valores si se
pretende medir memoria. Al cerrar, debe conservarse el snapshot y liberarse la
sesión mutable.

En web, las métricas deben nombrar explícitamente el contexto (`browser.rAF`,
`browser.main`, `react.render`) y no presentarse como UI thread o GPU nativos.

## 7. Fase 0A: inventario y fixtures

**Objetivo:** preparar escenarios reproducibles antes de medir.

### Tareas

- [ ] Crear fixtures solo para tests/E2E, siempre detrás de `EXPO_PUBLIC_E2E=1`.
- [ ] Definir `memorice:perf-mismatch` y `memorice:perf-match`; actualmente Memorice usa `Math.random()` y no consume `initialSeed`.
- [ ] Definir `damas:perf-kings` y `damas:perf-branching` con cantidad de piezas, damas, ramas y movimiento esperado.
- [ ] Definir `solitario:perf-stock-empty` y un escenario de persistencia estable.
- [ ] Definir `wakwak:perf-level-1` y `wakwak:perf-level-8`, incluyendo estado inicial e input exacto.
- [ ] Documentar seed, viewport, duración, número de acciones y resultado funcional de cada fixture.
- [ ] Añadir tests de engine para cada estado nuevo sin importar módulos de UI/performance en los engines.

### Criterios de aceptación

- [ ] Cada escenario tiene seed/fixture, input y resultado esperado.
- [ ] Ningún fixture existe en producción cuando `EXPO_PUBLIC_E2E` está apagado.
- [ ] Las corridas repetidas producen el mismo resultado funcional.

## 8. Fase 0B: correcciones de instrumentación

**Objetivo:** que las mediciones no mezclen causas distintas.

### Tareas

- [ ] Memoizar el callback entregado a `useFrameCallback` en `src/core/perf/usePerfFrameMonitor.ts`.
- [ ] Separar `frameDt`, p50, p95, p99, máximo, FPS estimado, `longFrameEvents` y frames estimados omitidos.
- [ ] Hacer configurable el presupuesto según refresh rate o registrar 60/120 Hz explícitamente.
- [ ] Calcular `drag.ui2js` como primera operación del callback JS en Solitario y Damas.
- [ ] Mantener `drag.handler` como métrica separada del tiempo total de cola.
- [ ] Registrar por separado validación previa, commit del store, audio y persistencia.
- [ ] Evitar ejecutar `React.Profiler` cuando `isPerfEnabled()` sea falso, mediante un wrapper estable y no hooks condicionales.
- [ ] Mantener el hook del monitor siempre llamado, pero asegurar que callback, intervalos y almacenamiento no se activen con el gate apagado.
- [ ] Documentar la comparabilidad de relojes web y Android.
- [ ] Decidir si el monitor UI se extiende a Solitario/Damas/Memorice o si la garantía queda explícitamente limitada a WakWak.
- [ ] Añadir tests de la semántica de cada métrica, no solo de acumulación.
- [ ] Añadir tests de p50/p95/p99/max y de la conversión de `dt` a frames estimados.
- [ ] Acotar las muestras de timers y liberar la sesión mutable al cerrar.

### Criterios de aceptación

- [ ] Un evento `drag.ui2js` no contiene el tiempo de validación ni de spring.
- [ ] Los datos reportan claramente JS, React y UI.
- [ ] El callback de frame no se vuelve a registrar en renders ordinarios.
- [ ] El gate apagado no activa callbacks, intervalos, almacenamiento ni profiling.
- [ ] Los tests diferencian latencia de cola, handler y tiempo total.

## 9. Fase 1: protocolo y baseline reproducible

**Objetivo:** obtener una línea base repetible antes de tocar los hot paths.

### Perfiles de build

- **Instrumentado:** `EXPO_PUBLIC_PERF_METRICS=1`; puede usar `EXPO_PUBLIC_E2E=1` para fixtures y debe etiquetarse como `instrumented`, no como release comparable.
- **Release web funcional:** `EXPO_PUBLIC_PERF_METRICS=0`, sin canal E2E; sirve para comprobar que el gate apagado no altera el comportamiento.
- **Release Android:** build profileable/release separado; no se puede inferir desde E2E web.

### Protocolo web

- Fijar viewport de 360x640 para mobile y 1280x900 para desktop.
- Crear un `E2E_PORT` aislado y comprobar con `curl`/`lsof` que está libre antes de exportar.
- No reutilizar un servidor activo que pueda servir un `dist/` anterior.
- Separar las pruebas de performance de la suite funcional.
- Hacer 5 warm-up runs y descartar sus muestras.
- Ejecutar 5 lotes independientes de 30 runs medidas por escenario.
- Realizar drags con `mouse.down`, movimientos escalonados y pausa de 25-30 ms por paso.
- Guardar `scenarioId`, `runId`, seed, commit, build mode, viewport, refresh rate y snapshot JSON.
- Al terminar una sesión, navegar fuera de la pantalla o cerrar explícitamente la sesión para forzar el snapshot.

Comandos propuestos, después de crear el spec de performance:

```bash
CI=1 EXPO_PUBLIC_PERF_METRICS=1 E2E_PORT=4183 \
node scripts/e2e.mjs -- src/core/__e2e__/performance.web.spec.ts
```

Para export funcional sin instrumentación:

```bash
CI=1 EXPO_PUBLIC_PERF_METRICS=0 \
pnpm exec expo export --platform web --clear
```

Para Atlas:

```bash
EXPO_ATLAS=true CI=1 \
pnpm exec expo export --platform web --clear
pnpm dlx expo-atlas .expo/atlas.jsonl
```

### Escenarios versionados

| Scenario ID | Fixture/seed | Secuencia mínima | Salida principal |
|---|---|---|---|
| `wakwak-active-1` | `wakwak:perf-level-1` | movimiento normal durante ventana fija | browser.rAF, tick, snapshot, present |
| `wakwak-active-8` | `wakwak:perf-level-8` | movimiento normal durante ventana fija | mismo conjunto, nivel complejo |
| `wakwak-paused` | fixture estable | pausar 1.5 s y reanudar | callbacks rAF, idle animations |
| `solitario-drag` | `test-move` | válido + inválido | ui2js, handler, render, audio |
| `solitario-persist` | `test-move` | commit, esperar 600 ms, reload | stringify, write, restore |
| `solitario-endgame` | `solitario:perf-stock-empty` | movimiento con stock/waste vacíos | `hasAnyMove`, handler |
| `damas-initial` | setup estándar | drag legal e ilegal | reglas, handler, render |
| `damas-kings` | `damas:perf-kings` | drag con dama voladora | legalidad, ramas, latencia |
| `damas-branching` | `damas:perf-branching` | cadena ramificada | legalidad, allocations |
| `memorice-mismatch` | `memorice:perf-mismatch` | dos cartas no coincidentes | renders y flip |
| `memorice-match` | `memorice:perf-match` | dos cartas coincidentes | renders y flip |

Las fixtures nuevas deben crearse en Fase 0A antes de ejecutar este baseline.

### Salidas

- [ ] Snapshot versionado por `scenarioId` y `runId`.
- [ ] Guardar artifacts locales bajo `tmp/perf/` y publicarlos como artifacts de CI, sin commitear snapshots.
- [ ] Bundle Atlas web.
- [ ] Tabla baseline con p50/p95/p99/max y dispersión por lote.
- [ ] Tamaño raw/gzip de chunks web.
- [ ] Tamaño y cantidad de assets de audio.
- [ ] Registro de hardware/browser, refresh rate, commit y modo de build.

## 10. Fase 1N: baseline Android bloqueado externamente

Esta fase debe ejecutarse inmediatamente después del baseline web y antes de
aceptar optimizaciones nativas. Está bloqueada en el entorno actual porque no
hay Java 17, Android SDK/ADB, proyecto `android/` ni `eas.json`.

### Tareas

- [ ] Definir el perfil de build release/profileable y documentar si se usará EAS o prebuild local.
- [ ] Definir un Android lento soportado y un dispositivo de alta frecuencia si se validará 120 Hz.
- [ ] Ejecutar la misma matriz de escenarios que en web donde el input sea comparable.
- [ ] Capturar System Trace con Android Studio/Perfetto.
- [ ] Separar JS Thread, UI Thread, Native Modules Thread y RenderThread.
- [ ] Capturar memoria JS/Hermes y memoria nativa.
- [ ] Validar `_getAnimationTimestamp()` contra `performance.now()`.

### Criterios de aceptación

- [ ] Existe un artifact de baseline Android por dispositivo y escenario.
- [ ] El build y el hardware están identificados en el snapshot.
- [ ] Las conclusiones nativas no se derivan de la medición web instrumentada.

## 11. Fase 2: WakWak

**Orden recomendado:** mayor frecuencia de ejecución. La prioridad de retorno se
confirma solo después del baseline.

### D-WW: diagnóstico

- [ ] Medir publicaciones Zustand por callback rAF y separar cambios de `remainderMs` de cambios semánticos.
- [ ] Medir `advance`, `step`, `worldSnapshot`, `present`, `threatsOf` y el cálculo repetido de `floatPos(robot)`.
- [ ] Comparar juego activo, pausa, interstitial, overlay final y niveles 1/8.
- [ ] Decidir ownership de `remainderMs` antes de cambiar el store.

### I-WW: implementación condicional

- [ ] Mantener `advance()` aislado y probar equivalencia con seeds antes de modificar el canal de publicación.
- [ ] Si el diagnóstico lo justifica, separar el acumulador de `remainderMs` o cambiar el contrato de forma explícita.
- [ ] Comparar la pose actual con la última pose presentada y omitir shared values sin cambios.
- [ ] Calcular `robotPos` una sola vez por paso de colisión.
- [ ] Omitir `threatsOf()` durante power si el resultado funcional sigue siendo equivalente.
- [ ] Separar capas estáticas y dinámicas del laberinto solo si el commit de pickup supera el presupuesto.

### V-WW: validación

- [ ] Comparar exactamente los escenarios baseline/post-fix.
- [ ] Verificar score, eventos, vidas, niveles y estados terminales con los mismos seeds.
- [ ] Medir que pausa/fin no mantengan callbacks rAF continuos salvo trabajo pendiente.
- [ ] Reiniciar el reloj `last` al reanudar y comprobar que no aparece un `dt` artificial.
- [ ] Detener/reanudar idle animations según `status`, `paused` y reduced motion.

### Criterios de aceptación WakWak

- [ ] Seeds E2E conservan score, eventos, vidas y niveles.
- [ ] Pausar detiene la simulación y no mantiene trabajo continuo innecesario.
- [ ] La decisión sobre `remainderMs` conserva la equivalencia funcional y temporal del engine.
- [ ] `present()` reduce escrituras por frame solo si el baseline demuestra que son relevantes.
- [ ] La mejora cumple la regla comparativa de la sección 5 en web y, cuando esté disponible, release Android.
- [ ] Si no existe mejora significativa, se documenta la decisión de no migrar a Skia.

## 12. Fase 3: Damas

### D-DM: diagnóstico

- [ ] Ejecutar fixtures `damas:perf-kings` y `damas:perf-branching` creadas en Fase 0A.
- [ ] Medir `movablePieceIds`, `legalMovesForPiece`, `applyMove` y `gameOutcome` por separado.
- [ ] Registrar cantidad de ramas y movimientos generados mediante instrumentación de tests, no importando performance en `engine/rules.ts`.
- [ ] Medir latencia desde `onDragEnd` hasta actualización visual.

### I-DM: implementación condicional

- [ ] Definir una representación de movimientos legales para un `board` y `turn` concretos.
- [ ] Calcular una vez los movimientos por pieza al cambiar el turno/tablero.
- [ ] Reutilizar el resultado para `movablePieceIds`, drag start y destinos.
- [ ] Evitar repetir `hasCapture()` global para cada ficha cuando el resultado ya está disponible.
- [ ] Mantener la validación canónica en `applyMove()`.

### V-DM: validación

- [ ] Medir pointer-down a `onDragStart` con 24 fichas montadas.
- [ ] Medir coste de cambiar `enabled` al cambiar el turno.
- [ ] No reemplazar `GestureDetector` sin evidencia de que el hit-testing sea el cuello de botella.
- [ ] Comparar legalidad, destinos y latencia contra el baseline.

### Criterios de aceptación Damas

- [ ] Misma legalidad en todos los tests unitarios.
- [ ] Misma selección de destinos en E2E.
- [ ] Sin regresión en captura obligatoria, multi-salto o coronación.
- [ ] La reducción de ejecuciones redundantes supera el umbral definido en la sección 5 o se documenta como inconclusa.

## 13. Fase 4: Solitario

### D-SL: diagnóstico

- [ ] Medir render de `Pile`, `PileCard` y `PlayingCard` por tipo de pila.
- [ ] Medir validación espejo de pantalla y validación del store.
- [ ] Medir heap JS con 10, 50 y 100 movimientos usando Chrome DevTools en web y Android Studio/Perfetto en nativo.
- [ ] Comparar undo apagado/encendido.
- [ ] Medir `JSON.stringify`, tamaño del payload, tiempo de escritura y tiempo hasta restore.
- [ ] Medir unmount/cierre durante la ventana de debounce.

### I-SL: implementación condicional

- [ ] Precalcular offsets de cada columna una vez por cambio de tableau/layout si el render lo justifica.
- [ ] Precalcular validez de secuencias visibles por columna si el coste supera el umbral.
- [ ] Evaluar si `dragKey` puede vivir parcialmente en shared values sin degradar accesibilidad ni targets.
- [ ] Evaluar transporte de un resultado canónico asociado a una versión del estado.
- [ ] No eliminar la validación final del store.
- [ ] Evaluar `requestIdleCallback` en web y una cola nativa solo si la medición demuestra jank.
- [ ] Evaluar snapshots diferenciales o comandos inversos solo si el crecimiento de undo es significativo.

### V-SL: validación

- [ ] Comparar render, drag, validación, undo y persistencia con el mismo escenario.
- [ ] Mantener drag válido/ilegal, auto-move, doble tap y restore funcionales.
- [ ] Documentar una ventana de pérdida de persistencia inferior a 300 ms si no se implementa flush inmediato.

### Criterios de aceptación Solitario

- [ ] Drag válido/ilegal mantiene el resultado actual.
- [ ] Auto-move y doble tap mantienen su comportamiento.
- [ ] Undo conserva las reglas y el score.
- [ ] Recarga restaura el estado después de la ventana documentada de persistencia.
- [ ] No existe spike de JS que cruce el presupuesto en el escenario de persistencia.

## 14. Fase 5: Memorice y componentes compartidos

- [ ] Instrumentar commits de Memorice antes de cambiarlo.
- [ ] Estabilizar callback y evaluar `React.memo(Card)`.
- [ ] Estabilizar también el objeto de estilos por carta; `memo` no aporta si `onPress` o `style` cambian en cada render.
- [ ] Comparar cantidad de Cards ejecutadas por flip.
- [ ] Mantener la animación Reanimated y `scheduleOnRN` del cruce de 90 grados.
- [ ] Evaluar el impacto de `expo-haptics` en Atlas; no crear un wrapper platform-specific sin evidencia.
- [ ] Mantener `PressableScale` fuera de superficies de alta frecuencia.
- [ ] Mantener `useContainerSize`, `overlayAnimation` y layout responsive actuales.

## 15. Fase 6: startup, bundle y recursos

### Bundle

- [ ] Ejecutar Expo Atlas en baseline y post-cambio.
- [ ] Comparar el bundle contra el presupuesto antes de modificar `GameDefinition` o `game-registry`.
- [ ] Si el presupuesto se supera, aprobar ADR para separar metadatos del registro y loaders; considerar fallback síncrono nativo.
- [ ] Evaluar imports diferidos por ruta en web solo después de Atlas.
- [ ] Activar async routes solo después de confirmar compatibilidad con el hosting estático.
- [ ] Añadir E2E de navegación directa y reload de cada `/juego/<id>` si se introduce lazy loading.
- [ ] Establecer presupuesto de JS raw/gzip y chunks iniciales.

### Estado global y récords

- [ ] Unificar hidratación en un único flujo single-flight.
- [ ] Cachear preferencias en memoria después de la primera lectura.
- [ ] Cachear récords y invalidarlos tras `recordsRepository.save()`.
- [ ] Evitar consulta individual de récord por tarjeta si el número de juegos crece.
- [ ] Medir apertura/migración de SQLite y `JSON.parse`/`sort` web antes de elegir cache o API async.
- [ ] Si se modifica un repositorio de persistencia, editar siempre sus pares `.ts` y `.web.ts`.

### Audio

- [ ] Inventariar primero qué sonidos existen y se usan por juego.
- [ ] Precalentar players solo donde el cold-start supere el umbral.
- [ ] Medir primer play y play caliente.
- [ ] Definir un evento lifecycle concreto para liberar players; no asumir que existe un evento fiable de "salir de la aplicación".
- [ ] Configurar explícitamente `enableBackgroundPlayback` y `recordAudioAndroid` según el requisito real del producto.
- [ ] Verificar permisos, servicio foreground y tamaño del build generado.
- [ ] No declarar mejora de latencia audible basándose solo en `handlerToPlay`.

## 16. Fase 7: revalidación nativa y feel-check

El entorno actual no tiene Java 17 ni Android SDK/ADB. La baseline Android de la
Fase 1N debe ejecutarse antes de aceptar optimizaciones; esta fase repite la
matriz después de los cambios aprobados.

- [ ] Usar el mismo perfil, dispositivos, fixtures y escenarios de la Fase 1N.
- [ ] Capturar System Trace con Android Studio/Perfetto.
- [ ] Separar JS Thread, UI Thread, Native Modules Thread y RenderThread.
- [ ] Capturar memoria JS/Hermes y memoria nativa.
- [ ] Medir WakWak activo, pausa, pickup y combo.
- [ ] Medir drag largo de Solitario y Damas.
- [ ] Verificar audio cold-start y lifecycle.
- [ ] Validar los relojes de `_getAnimationTimestamp()` y `performance.now()`.
- [ ] Ejecutar feel-check de velocity handoff, interrupción de spring y haptics.
- [ ] Comparar cinco lotes post-fix contra la baseline, sin mezclar builds instrumentados y release.

## 17. CI y regression gates

### Verificación estándar

- [ ] `pnpm typecheck`.
- [ ] `pnpm test`.
- [ ] `node scripts/e2e.mjs`.
- [ ] Export web reproducible.
- [ ] Validación visual puntual cuando corresponda.

### Gates propuestos

- [ ] Gate inicial de funcionalidad: typecheck, unit tests y E2E.
- [ ] Instalar Chromium con `pnpm exec playwright install chromium` en el job E2E.
- [ ] Publicar report/trace como artifact cuando falle Playwright.
- [ ] Crear spec separado que exporte snapshots de performance versionados.
- [ ] Reporte informativo de bundle Atlas en pull requests relevantes.
- [ ] Reporte informativo de performance web con baseline estable.
- [ ] Gate nativo separado para release Android, no simulado con Jest/web.
- [ ] Umbrales hard-fail solo después de disponer de varias corridas y hardware estable.

## 18. Riesgos y rollback

| Riesgo | Mitigación |
|---|---|
| El estado transitorio diverge del contrato del engine | Tests de seeds, score/eventos y comparación frame a frame |
| Cache de movimientos legales queda obsoleta | Invalidar por referencia/version de tablero y mantener validación final |
| Persistencia diferida pierde una jugada ante cierre abrupto | Documentar ventana de pérdida aceptable y flush al background/unmount |
| Lazy loading rompe deep links web | E2E de rutas directas y fallback de carga |
| Feature flags Reanimated alteran hit testing | Activar solo en build experimental y probar Gesture Handler |
| Liberar audio provoca cold-start posterior | Política de cache por juego y medición de primer play |
| React Compiler cambia comportamiento de worklets | Healthcheck, adopción incremental y exclusión explícita si es necesario |
| Profiler/metrics alteran el resultado medido | Separar build instrumentado de release y etiquetar snapshots |
| `TimerStats.samples` crece sin límite | Reservoir/histograma acotado y cleanup al cerrar sesión |
| Web no representa UI thread/GPU nativos | Etiquetar métricas web como browser/main y exigir baseline Android |
| `_getAnimationTimestamp()` no es comparable en Android | Validación explícita antes de usar umbrales absolutos |
| Cache de récords/preferencias queda obsoleta | Invalidation tras save/clear y tests de consistencia |
| Reutilización de `dist` o storage contamina escenarios | Puerto aislado, export `--clear`, storage limpio por run |
| Repositorios web/nativo divergen | Cambiar siempre los dos pares y ejecutar tests de ambos |

Cada cambio de performance debe poder revertirse sin modificar reglas de juego ni formato persistido.

## 19. Notas/hallazgos

- Hallazgo: los resultados de `docs/adr/0011-metricas-performance.md` son históricos, dev web y no sustituyen la baseline de este plan.
- Hallazgo: el comentario `PLAN 1.6` en gestos y la referencia `Fase 2` en audio son numeración histórica y deben actualizarse junto con la implementación.
- Hallazgo: la pureza referencial de WakWak no está garantizada mientras `GameState.rng` sea una clausura mutable.
- Hallazgo: `uiFrames.dropped` requiere una semántica nueva, diferenciando evento de frame largo de frames estimados omitidos.
- Decisión pendiente: `remainderMs`, lazy loading, persistencia y background audio requieren aprobación antes de implementar.

## 20. Actualización documental de cierre

- [ ] Migrar lecciones reproducibles a `docs/GOTCHAS.md`.
- [ ] Migrar decisiones transversales aprobadas a ADRs.
- [ ] Actualizar `src/games/<id>/README.md` para los detalles específicos de cada juego.
- [ ] Actualizar `docs/ROADMAP.md` para deuda pendiente y validación Android.
- [ ] Actualizar `docs/ARCHITECTURE.md` y `docs/UI-UX.md` si cambian ownership de estado, render o motion.
- [ ] Enlazar `docs/PERFORMANCE-AUDIT.md` desde el documento definitivo que corresponda.
- [ ] Eliminar este PLAN solo después de la verificación completa.

## 21. Criterios de cierre

El requerimiento de performance podrá considerarse cerrado cuando:

- [ ] Exista baseline y post-fix con protocolo versionado.
- [ ] WakWak tenga mediciones separadas de simulación, presentación y UI.
- [ ] Damas tenga medición de reglas en posiciones normales y complejas.
- [ ] Solitario tenga medición de drag, render, undo y persistencia.
- [ ] Memorice tenga una decisión basada en su coste real.
- [ ] Exista bundle reportado para web.
- [ ] Exista validación de release Android.
- [ ] Los seeds E2E mantengan resultados funcionales.
- [ ] CI ejecute al menos los gates funcionales completos.
- [ ] Los hallazgos técnicos reproducibles se migren a `docs/GOTCHAS.md`.
- [ ] Las decisiones transversales se documenten en ADRs.
- [ ] La deuda restante quede en `docs/ROADMAP.md`.
- [ ] Este `PLAN-PERFORMANCE.md` se elimine en el cierre final, siguiendo el flujo de `AGENTS.md`.
- [ ] Ejecutar la verificación estándar en este orden: `pnpm typecheck` → `pnpm test` → `node scripts/e2e.mjs`.
