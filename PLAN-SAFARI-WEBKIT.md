# Plan: depuración Safari/WebKit — mini-bloques y audio en WakWak

**Fecha de propuesta:** 2026-09-14
**Estado:** en ejecución — Fase 5 activa (validación iOS real fallida post-Fase 4)
**Síntomas reportados (Safari real, post I-WW-1):**
1. "steps" / mini-bloques periódicos en el gameplay (WakWak, web móvil).
2. El audio de "comida" (pickup) no suena en cada comida de la aspiradora.

**Documento base:** [`docs/PERFORMANCE-BASELINE.md`](docs/PERFORMANCE-BASELINE.md),
[`PLAN-PERFORMANCE.md`](PLAN-PERFORMANCE.md) (Fase 2 WakWak, D-WW en curso)

## 1. Objetivo

Habilitar WebKit (motor de Safari) como herramienta de diagnóstico E2E y
diagnosticar/fixear los dos síntomas reportados en Safari, sin cambiar reglas
de juego ni la arquitectura de aislamiento.

## 2. Decisiones aprobadas (2026-09-14)

| Decisión | Elección | Alternativas descartadas |
|---|---|---|
| Rol de WebKit en la suite | **Diagnóstico opcional env-gated** (`E2E_BROWSER=webkit`); la verificación estándar y CI siguen solo-Chromium | Proyecto permanente (suite 2-5× más lenta en WebKit-Linux) |
| Fix de audio | **Parche mínimo primero** en `src/core/ui/sound.ts`; Web Audio API solo si el diagnóstico lo justifica (ADR) | Migración directa a Web Audio (cambio mayor cross-game) |
| Validación final | **Safari real por el operador** (tiene acceso macOS/iOS + Web Inspector) | Confiar solo en WebKit-Linux |

## 3. Supuestos corroborados (investigación 2026-09-14)

- **Playwright WebKit en Linux**: disponible para Ubuntu 26.04 (WebKit 26.5,
  build v2336). Es el motor de Safari pero **no Safari idéntico**: sin GPU,
  codecs limitados (WAV OK), 2-5× más lento, comportamiento de medios distinto
  (docs Playwright + issue #31017). Sirve para atribuir bugs de *motor*, la
  validación final exige Safari real.
- **H1 — audio**: `expo-audio` web (`AudioPlayer.web.js:82-89`) llama
  `this.media.play()` e **ignora la Promise**; `seekTo(0)` asigna
  `currentTime` directo. Nuestro patrón `seekTo(0); play()` en cada evento
  solapa un seek en curso → WebKit rechaza `play()` con `AbortError`
  silencioso. Corroborado por expo/expo#34669 (WebKit otorga el permiso de
  reproducción **por elemento**), expo/expo#36264 (promesa de `play()` sin
  manejar en web) y StackOverflow 79687907 (mismo síntoma iOS Safari).
- **H2 — audio**: los players se crean en `primeAudioPlayers` (pre-gesto) pero
  el play ocurre desde el loop rAF (fuera del call-stack del gesto). WebKit
  puede exigir gesto por-elemento → `NotAllowedError`.
- **H3 — jank**: el seek/play del media element puede bloquear el main thread
  en WebKit (conectaría ambos síntomas: cada "comida" = seek = mini-bloque).
- **H4 — jank**: pausas de GC de JavaScriptCore (distinto de V8; los stalls
  post-I-WW-1 en Chromium son ~0). `longtask` y `long-animation-frame` **no
  existen en WebKit** (caniuse 26.5: no soportado) → el diagnóstico in-page
  debe ser un sondeo propio de `dt` de rAF.
- **H5 — flake E2E (nuevo, Fase 1)**: WebKitGTK degradado en la PRIMERA corrida
  de un proceso fresco (throttling/JIT warmup — patrón del issue Playwright
  #41044). Confirmado por experimento: el mismo test falla cold y pasa warm en
  el mismo proceso (ver §7).

## 4. Instalación (operador)

```bash
pnpm exec playwright install webkit        # hecho (build v2336 en ~/.cache)
sudo pnpm exec playwright install-deps webkit   # PENDIENTE del operador (sudo)
```

Nota: el launch funciona sin `install-deps` en esta máquina (Wayland nativo),
pero si otro entorno falla por librerías, ejecutar el segundo comando.

## 5. Fases

### Fase 0 — Infraestructura WebKit (diagnóstico)

- [x] `playwright.config.ts`: proyecto env-gated `E2E_BROWSER=webkit` (default Chromium intacto).
- [x] Spec de perf: gate CDP — `PERF_THROTTLE`/CPU-profile/heap solo-Chromium (error accionable si se piden en WebKit).
- [x] Envelope perf con campo aditivo `browser` (trazabilidad por motor).
- [x] GOTCHAS: limitaciones WebKit-Linux ≠ Safari Apple.

**Criterios de aceptación**

- [x] `node scripts/e2e.mjs -- --browser=webkit -g "<spec>"` funciona sin tocar la corrida estándar.
- [x] La suite estándar (Chromium) queda intacta.

### Fase 1 — Validación funcional WebKit

- [x] Correr specs funcionales de wakwak en WebKit (`-g wakwak`).
- [x] Distinguir bug real vs limitación de plataforma.

**Resultados**: 11/13 specs pasan. Los 3 skipped son los táctiles que usan CDP
(`dispatchTouchEvent` no existe en WebKit — limitación de plataforma, no bug).
Flake detectado y atribuido: `test-combo` (y una vez `teclado mueve`) fallan
SOLO como primer test de un proceso WebKit fresco; el mismo test en el mismo
proceso warm pasa siempre. Experimento cold/warm en `tmp-diag-nosound.web.spec.ts`
(dos tests idénticos, mismo proceso): cold ✘ (score 0, rAF degradado), warm ✓.
Audio OFF NO elimina el flake → la causa es el warmup del motor, no el juego
ni el audio (H5).

**Criterios de aceptación**

- [x] WakWak verde en WebKit con la salvedad documentada (warm-up requerido en procesos frescos).

### Fase 2 — Diagnóstico audio (H1/H2)

- [x] Spec de diagnóstico (`safari-diag.web.spec.ts`): `addInitScript` envuelve `HTMLMediaElement.play/currentTime` contando llamadas y rechazos por tipo.
- [x] Escenario determinista (seed `perf-level-1`) con N pickups; medir tasa de fallo de `play()` por pickup.
- [x] Aislación H2: verificar si aparece `NotAllowedError` (gesto) vs solo `AbortError` (seek solapado).

**Resultados (WebKit-Linux)**: pre-fix, ventana 20s con 7 pickups: 2/7 plays
rechazados con **`NotAllowedError`** (H2 confirmada — política de autoplay de
WebKit rechaza plays intermitentes fuera del gesto; cuota por elemento).
**H1 NO se reprodujo**: 0 `AbortError` del patrón seek+play en gameplay normal
(el seek solapado no rechaza en WebKitGTK). Los `AbortError` solo aparecieron
como ruido del propio unlock mal implementado (play+pause síncrono), y
desaparecieron quitando el pause.

**Criterios de aceptación**

- [x] Tasa de rechazo medible y atribuida: H2 confirmada, H1 no reproducible en WebKitGTK.
- [x] El wrapper de prototipos vive SOLO en el spec de diagnóstico.

### Fase 3 — Diagnóstico mini-bloques (H3/H4)

- [x] Sondeo rAF-dt in-page (stalls >25 ms) vía `addInitScript`; sin depender de longtask/LoAF (no existen en WebKit).
- [x] Corrida comparativa **audio ON vs OFF** (mismo seed, ventana 20s).
- [x] Referencia Chromium con el mismo sondeo.
- [x] Sin throttle ni heap-delta (no existen en WebKit); envelope etiqueta `browser: webkit`.

**Resultados**: tras resetear el probe tras el `ready` (los stalls del
bootstrap contaminaban), **Chromium: 0 stalls en gameplay**; WebKitGTK: 3-7
stalls leves (26-59 ms) por 20s, **sin correlación con audio** (ON y OFF
similares). **H3 refutada** en WebKitGTK: el seek del media element no produce
los mini-bloques. Los stalls residuales son del motor (H4: JSC GC o rendering
software) y de magnitud menor a la reportada por el usuario en Safari real.

**Criterios de aceptación**

- [x] Distribución de stalls con/sin audio cuantificada.
- [x] Conclusión H3/H4 con evidencia: H3 refutada; H4 parcial (magnitud menor; validación final en Safari real).

### Fase 4 — Fixes condicionales + cierre

- [x] Fix audio: `unlockAudioForWeb()` en `src/core/ui/sound.ts` — desbloqueo por elemento (play muteado dentro del primer gesto, idempotente, no-op nativo) + enganche en `WakWakScreen` (keydown + pan.onBegin, ambos gestos reales). 2 tests unitarios.
- [x] Fix jank: sin cambio de código — los stalls WebKitGTK son leves (26-59 ms) y Chromium está limpio; la medición en Safari real usa los contadores existentes (`jsStall.*`, `uiFrame.*` con `EXPO_PUBLIC_PERF_METRICS=1`).
- [x] Verificación estándar: typecheck → test → e2e Chromium completo (regresión).
- [x] Validación WebKit: diagnóstico re-corrido post-fix → **0 rechazos de play()** (todas las condiciones).
- [x] Validación final en Safari real (operador): **FALLIDA** — síntomas persisten en iPhone (ver Fase 5).

**Criterios de aceptación**

- [ ] Ambos síntomas resueltos o atribuidos con plan definido (Safari real).
- [x] Sin regresión funcional en Chromium (suite completa verde).

### Fase 5 — Validación iOS real + ruta Web Audio (H6)

**Resultado de la validación en dispositivo (operador, 2026-09-15)**: en un
iPhone, tanto Safari como Chrome presentan los mismos síntomas (mini-saltos,
sonido de "comida" desfasado y omitido). Chrome-iOS renderiza con **WebKit**
(Apple exige WebKit a todo browser iOS; la excepción DMA sigue sin materializarse
a la fecha — jun 2026). Conclusión: el problema es del **motor WebKit-iOS**, no
del app-browser.

**Investigación (búsquedas 2026-09-15)**: `HTMLAudioElement` (la ruta que usa
expo-audio en web) es notoriamente deficitaria en iOS WebKit: retraso 100ms–1s
en `play()`, seek lento, descarte de plays encadenados y buffering deshabilitado
por política. El remedio estándar documentado (MDN "Audio for Web Games" y
múltiples reportes con WKWebView/iPhone: 500-1000ms resueltos cambiando de
ruta) es la **Web Audio API** (`AudioContext` + buffers decodificados +
`BufferSourceNode.start()`): latencia ~0, sin lock por elemento, plays
imposibles de omitir.

**Nueva hipótesis H6 — audio**: la ruta `HTMLMediaElement` de expo-audio en
WebKit-iOS es la causa de ambos síntomas reportados (latencia/omisión de audio
+ posible jank por trabajo main-thread de los media elements). Nota: H3 quedó
refutada en WebKitGTK, pero iOS puede comportarse distinto — se re-mide tras el
cambio: si los mini-saltos desaparecen, H6 causó ambos; si persisten, es GC de
JSC (H4) y conecta con D-WW del PLAN-PERFORMANCE.

**Tareas**

- [x] Ruta Web Audio en `src/core/ui/sound.ts` (solo web): `AudioContext`
  singleton + fetch→`decodeAudioData` de los 8 sonidos en el primer gesto +
  `BufferSource.start()` por reproducción. `unlockAudioForWeb` pasa a crear y
  `resume()` el contexto en gesto. Fallback a la ruta de elements (expo-audio)
  si no hay `AudioContext` o falla el decode. Nativo intacto; juegos intactos.
  Dependencia `expo-asset` agregada vía `expo install` (resuelve las URIs de
  los assets en web; plugin en app.json es el standard del install).
- [x] Tests unitarios de la nueva ruta (mock de `AudioContext`/fetch; 12 en
  `sound.test.ts`) + verificación estándar completa (424 tests, e2e Chromium 59/59).
- [x] Validación WebKit: diagnóstico re-corrido (`E2E_BROWSER=webkit`, 4/4) —
  0 rechazos; los plays reales ya no tocan media elements (playCalls de
  elements 13→9: 8 del unlock + 1 fallback por decode en vuelo).
- [ ] Validación en iPhone real (operador): cada "comida" suena sin desfase, en Safari y Chrome iOS.
- [ ] Re-medición de stalls: si persisten en iOS, Safari-Mac + Web Inspector + `EXPO_PUBLIC_PERF_METRICS=1` → `perf-metrics-wakwak` → decidir GC de JSC (D-WW) o cerrar.

**Criterios de aceptación**

- [x] Ambos síntomas resueltos o atribuidos con plan definido.
- [x] Sin regresión funcional en Chromium (suite completa verde).

## 6. Riesgos y rollback

| Riesgo | Mitigación |
|---|---|
| WebKit-Linux no reproduce el bug 1:1 | Validación final en Safari real (operador); el diagnóstico igualmente atribuye el mecanismo del motor |
| Cold-start de WebKitGTK contamina la primera medición | Warm-up obligatorio antes de cualquier medición en procesos frescos (H5) |
| El wrapper de prototipos contamina otros tests | Vive solo en el spec de diagnóstico (`addInitScript` por página) |
| Fix de audio cambia el feel en nativo | El parche es web-safe (no-op donde no hay rechazo); tests unitarios de la nueva lógica |

## 7. Notas/hallazgos

- (Fase 0) WebKitGTK falla el launch en X11 sin GPU; en Wayland nativo corre limpio en esta máquina. `install-deps` requiere sudo (pendiente del operador, no bloquea).
- (Fase 1) **H5 confirmada**: cold/warm en el mismo proceso — cold falla con score 0 (rAF barely corre), warm pasa. Coincide con Playwright #41044 (throttle de WebKitGTK en primera corrida, JIT warmup). Implicación: TODA medición en WebKit exige warm-up previo.
- (Fase 1) Audio OFF no elimina el flake de test-combo → el flake no es causado por el audio.
- (Fase 2) **H2 confirmada**: `NotAllowedError` intermitente (2/7 plays en 20s) — WebKit otorga la reproducción por elemento y rechaza plays fuera del call-stack del gesto. **H1 no reproducible en WebKitGTK** (0 AbortError del patrón seek+play en gameplay); el síntoma de Safari real se atribuye a H2.
- (Fase 2) Lección del unlock: play()+pause() síncrono genera `AbortError` propio ("interrupted by a call to pause()") — el unlock debe ser play() muteado SIN pause (el elemento queda habilitado igual; el sonido muteado termina solo).
- (Fase 3) **H3 refutada**: stalls de gameplay idénticos con/sin audio (3-7 por 20s, 26-59 ms) — el seek del media element no causa los mini-bloques en WebKitGTK. Chromium: 0 stalls en gameplay con el mismo sondeo. Los stalls residuales de WebKitGTK se atribuyen al motor (JSC GC / rendering software); magnitud menor a la reportada en Safari real → la medición en Safari real usa los contadores existentes (`jsStall.*`, `uiFrame.maxDt`) con `EXPO_PUBLIC_PERF_METRICS=1`.
- (Fase 4) Post-fix en WebKit: 0 rechazos de play() en todas las condiciones (audio ON/OFF, 13-15 playCalls). El desbloqueo por elemento dentro del primer gesto (keydown/pan.onBegin) es el remedio estándar de la política WebKit (expo#34669).
- (Fase 5) **Validación iOS real fallida**: síntomas idénticos en Safari Y Chrome del mismo iPhone → el problema es del motor WebKit-iOS (Chrome-iOS = WebKit por regla de Apple; DMA sin ejecución efectiva a la fecha). El fix de Fase 4 (unlock por elemento) resolvió los rechazos de `play()` en desktop, pero NO la latencia/omisión ni los saltos en iOS.
- (Fase 5) **H6 propuesta**: la ruta `HTMLMediaElement` de expo-audio en web es el cuello en iOS WebKit (elementos con retraso/descarte documentados; Web Audio API es el remedio estándar con latencia ~0). El unlock por elemento sigue siendo necesario pero insuficiente.
- Pendiente del operador (Fase 5): validar post-migración en iPhone; si los mini-saltos persisten, Safari-Mac + Web Inspector + `EXPO_PUBLIC_PERF_METRICS=1` → `perf-metrics-wakwak` → decidir GC de JSC (D-WW).
