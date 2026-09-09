# Gotchas — lecciones técnicas del toolchain

Problemas reales encontrados durante el desarrollo y cómo resolverlos. Solo lo
vigente (reproducible hoy). Los procesos de verificación y de servidores en
background están en `AGENTS.md`, no acá.

## React Native / RNW

- **RN 0.86: `columnWrapperStyle` con `numColumns=1` lanza invariant** y deja
  la pantalla en blanco (Home a 360px). Pasar el estilo solo si `numColumns > 1`.
- **RNW: el `FlatList`/`ScrollView` necesita su propia constraint de alto**
  (`style={{ flex: 1 }}` directo) para scrollear dentro de un contenedor `flex: 1`
  — el constraint solo en el wrapper NO alcanza y el contenido queda inaccesible
  (la 3ª tarjeta del Home fuera de vista, sin scroll).
- **expo-router 57 no exporta el tipo `Router`**: derivarlo con
  `ReturnType<typeof useRouter>` (ver `AppRouter` en `src/core/navigation.ts`).
- **`fontVariant` es array** (`fontVariant: ['tabular-nums']`), no string — tsc
  lo rechaza en `Text` y `StyleSheet.create`.
- **`hitSlop`/`pressRetentionOffset` no aceptan número** en RN 0.86 (solo
  `Insets`): normalizar `number` → insets simétricos internamente (lo hace
  `PressableScale`).
- **TypeScript rechaza caracteres unicode (♠) como texto JSX directo** — usar
  `{'♠'}`.
- **RNW Switch no expone `aria-checked` como atributo**: en Playwright usar
  `expect(switch).toBeChecked()`, no `getAttribute('aria-checked')`.
- **Overlays de core bajo contenido posterior**: los siblings posteriores
  pintan encima — los modales de core necesitan `zIndex: 50`.
- **Stock como Pressable**: la carta top del stock se renderiza DENTRO del
  Pressable con `pointerEvents="none"`; como hermana absoluta bloquearía el
  tap (hit-testing nativo).

## Reanimated 4 / worklets

- **`runOnJS` está deprecado** — usar `scheduleOnRN` (de `react-native-worklets`).
- **RNGH no expone `timestamp` en el evento de gesto**: para latencia UI→JS usar
  el global `_getAnimationTimestamp()` (react-native-worklets lo define en ambos
  runtimes; en web es el mismo reloj que `performance.now()`). En nativo la
  comparabilidad de relojes está sin validar.
- **babel-preset-expo inlinea `process.env.EXPO_OS` y los `EXPO_PUBLIC_*` en
  compilación**: setearlos en runtime (tests) no tiene efecto — el código
  compilado ya trae la constante. Para testear módulos que dependen de esos
  valores, inyectar el estado con setters exportados del módulo (patrón de
  `setPerfEnabledForTests`/`setPerfStorageForTests` en `src/core/perf/`).
- **`scheduleOnRN` encola cuando el JS thread está ocupado**: la latencia de un
  callback post-gesto crece con el trabajo JS pendiente (render agrupado, etc.).
  Si algo sensible a latencia (audio, haptics) depende de un callback JS,
  dispararlo LO PRIMERO del handler y con llamadas nativas fire-and-forget
  (`seekTo(0); play()` sin encadenar la promesa — el `.then` sumaba un
  round-trip nativo completo al desfase del sonido).
- **`withSpring` toma `velocity?: number` por eje** (no vector): con springs
  separados para `tx/ty`, pasar `velocityX`/`velocityY` respectivamente.
- **El callback de finalización va como 3er argumento** de
  `withSpring(config, callback)`, **no** en `.set()` (que solo acepta valor o
  updater).
- **`SharedValue.set(withSpring(...))` en effects** es la vía correcta para
  lifts de dos estados que comparten transform con valores de gesto: no se
  pueden mezclar CSS transition y worklet en el mismo nodo/transform.
- **`cancelAnimation(sv)` en `onStart`** permite que un drag nuevo interrumpa
  un settle/snap-back en vuelo (si no, el spring seguiría escribiendo en la
  shared value).
- **`.onFinalize((_e, success) => ...)` con `success=false`** cubre gestos
  cancelados (segundo dedo, llamada) que nunca disparan `onEnd` — sin esto el
  elemento queda congelado levantado.
- **Acceso a shared values con `.get()`/`.set()`** (nunca leer/escribir `.value`
  directo durante render) — compiler-safe con el plugin de worklets.
- **`entering`/layout animations re-disparan en CADA montaje** (por diseño; en
  web además al re-entrar subárboles, PR #8772): un `entering` permanente en un
  elemento que cambia de pila/contenedor (cartas de solitario que se mueven,
  filas de listas) repite la animación en cada movimiento. Acotarlo a una fase
  con flag local (patrón `dealing` de solitario: `entering={dealing ? FadeIn... :
  undefined}` — cambiar el prop a `undefined` a mitad de vida no re-animará,
  que es justo lo que se quiere).
- **`useSharedValue(init)` inicial + skip del primer effect** para flips/entradas
  state-driven: si el progreso arranca en 0 y el effect anima hacia el estado
  actual, todo elemento que MONTA ya en su estado final (restore, seeds,
  reparto) anima fantasma al cargar. Inicializar el shared value con el estado
  actual y saltar el primer run con un ref de montaje (patrón corregido sobre
  el flip de memorice, que no lo necesita porque ahí nada nace volteado).
- **Los callbacks de animación corren también al cancelar** (`finished=false`):
  un guard por id/token en el callback (ej. `finishFlight` de solitario) evita
  que un spring interrumpido limpie el estado de una animación posterior.

## Jest

- **Reanimated en Jest requiere mocks propios** (`__mocks__/`): el mock oficial
  de reanimated inicializa worklets nativo y falla en Node.
- **`FadeIn`/`FadeOut` no existen al importar módulos en jest**: los builders
  de `overlayAnimation.ts` se crean perezosamente en la primera llamada de
  render y se memoizan (como constantes de module scope, `game-registry.test`
  falla con `Cannot read properties of undefined (reading 'duration')` porque
  el registro importa pantallas → GameHeader → overlayAnimation).
- **@testing-library/react-native v14: `render` es `async`** — hay que
  `await render(<X />)`; si se llama síncrono, `render` devuelve un Promise
  (keys `[]`) y `screen.*` falla con `render function has not been called`
  (el screen queda como stub notImplemented). Bajo el preset de jest-expo no
  hay doble copia del paquete: el síntoma es solo el `await` faltante.

## Playwright / E2E

- **Clicks sobre botones `disabled` se difieren** hasta que se habilitan: en
  juegos con estados bloqueantes, el spec debe esperar el estado antes de
  clickear.
- **`page.reload()` resetea el historial del router**: tras recargar,
  `router.back()` ya no vuelve al Home. Cubierto por `exitToHome`
  (`src/core/navigation.ts`): sin historial en el stack hace `router.replace('/')`.
- **`locator.tap()` exige `hasTouch` en el contexto Playwright**: el proyecto no
  lo configura — los specs web deben usar `.click()`, si no falla con "page
  does not support tap".
- **Bump de `@playwright/test` exige re-instalar binarios**:
  `pnpm exec playwright install chromium`.
- **Medición mid-gesto engañosa**: al verificar posiciones, partir siempre del
  origen real (`originX/originY` del layout) o usar elementos de la primera
  fila — sumar índices × tamaño asumiendo origen en 0 da desbordes falsos.
- **Screenshots durante transición de página** pueden mostrar scrollbar
  fantasma: medir `scrollHeight` después de que el render asiente (~500 ms).
- **Los E2E de posición final tras springs necesitan ≥900–1000 ms** de wait
  (spring 400 ms perceptual ≈ 600 ms real + render).
- **El alto del tablero interior es casi igual en portrait y landscape**
  (solitario): en portrait la carta la limita el ancho y en landscape el alto,
  con lo que el contenido ocupa un alto similar. Para candear el modo rail
  landscape asertar el **tamaño de carta** (48→71px) y la posición/ancho del
  rail (x del botón salir < x del tablero, ancho ≤ 64), nunca el alto del
  tablero.

## Metro / Expo

- **La cache de Metro ignora `EXPO_PUBLIC_*` en export**: exportar con la env
  var tras haber exportado sin ella sirve transforms cacheados con la variable
  doblada a `undefined` (`initialSeed:void 0`). Solución: `expo export --clear`
  (lo hace `scripts/e2e.mjs`).
- **`expo export` NO regenera `.expo/types/router.d.ts`** (rutas tipadas): hay
  que arrancar `pnpm start` una vez y detenerlo por PID, o tsc falla en rutas
  sin cambios propios.
- **Nunca `spawn('pnpm')` sin `shell`** (Windows: `pnpm.cmd`) — preferir
  resolver el binario y lanzarlo con `process.execPath`.
- **`expo-screen-orientation.lockAsync` en web**: el lock del navegador puede
  rechazar (desktop) o pedir fullscreen (móvil) — todo lock/unlock va tras
  guard `IS_NATIVE` (lo hace `src/core/orientation.ts`, no-op en web). Con
  `app.json "orientation": "default"` el lock portrait debe hacerse en runtime
  (root layout), si no el Home rota libre en Android.

## Performance (prácticas para mantener, ver ADR 0011 y PLAN-PERFORMANCE)

- **Cierres inline rompen `React.memo`**: pasar `onX={() => fn(id)}` recrea la
  prop en cada render del padre y la memo no sirve. Pasar el callback estable
  (`fn` mismo) y que el hijo invoque `fn(card.id)` con su propio prop.
- **Props objeto nuevos por render rompen memo igual**: `position`/`style`
  calculados dentro del padre → pasar números (x/y) o memoizar el objeto
  (`useMemo`). Referencias a datos de pila (`pileRef`) también.
- **Medir antes de optimizar**: el módulo `src/core/perf/` (EXPO_PUBLIC_PERF_METRICS=1)
  entrega baseline/delta sin instrumentación manual; el flujo probado fue
  métricas → baseline → fix → re-medición (mismo protocolo, Playwright con
  pasos de mouse escalonados).
- **El coste del audio audible no se mide con reloj JS**: `handlerToPlay` solo
  captura el coste de invocar; el desfase real venía del round-trip de
  `seekTo().then()` y del primer `createAudioPlayer`. Métrica + razonamiento
  estructural juntos para cerrar conclusiones.
- **RNGH Pan en Playwright**: `dragTo` es demasiado rápido (no activa el Pan /
  no respeta `activeOffsetX/Y` con estabilidad); usar `mouse.down` → moves
  escalonados (25-30ms por paso) → `up` (receta en los specs E2E de damas).
- **Prime de recursos en idle tras `ready`**: precalentar players (y cualquier
  recurso pesado) con `setTimeout(0)` post-primer render — el primer uso del
  usuario no paga la creación.

## Gestos (gesture-handler)

- **Doble tap: `maxDelay(500)` explícito** en `Gesture.Tap().numberOfTaps(2)` — el
  default **nativo** es 200 ms y un doble tap humano lento falla (web ya era 500).
  Validado con dblclick de Playwright, pausas de 200–250 ms y jitter de 8 px que
  activa el Pan sin romper el tap.
- **Callbacks planos en un gesto emiten el warning** "None of the callbacks in
  the gesture are worklets" (repetido por cada gesto montado/re-montado): no es
  un error — RNGH ya corre esos callbacks en el JS thread. Si el callback toca
  estado JS (zustand, haptics, closures) la solución correcta es hacerlo
  explícito con `.runOnJS(true)` en el gesto, NO marcar `worklet`.

## Playwright (E2E web)

- **`locator.tap()` exige `hasTouch`** en el context options; el default del
  `playwright.config.ts` del repo no lo activa y falla con "The page does not
  support tap". En specs web usar `click()` (funciona igual para botones RN
  renderizados como `role="button"`), como hacen damas/solitario/wakwak.
- **Emulación móvil:** `test.use({ viewport, isMobile: true, hasTouch: true })`
  hace que `matchMedia('(pointer: coarse)')` reporte `true` (detecta táctil sin
  flags E2E). Pero **`test.use({ ...devices['Pixel 5'] })` dentro de un
  `describe` falla** ("defaultBrowserType forces a new worker"): ese spread solo
  vale a nivel de archivo/config — a nivel describe, especificar las opciones
  una por una.
- **Swipe/touch-drag real vía CDP**: Playwright no tiene API de swipe; con una
  CDP session (`page.context().newCDPSession(page)`) y
  `Input.dispatchTouchEvent` (touchStart + varios touchMove + touchEnd) RNGH
  procesa el Pan normalmente. Coordenadas en CSS px del viewport (igual que
  `boundingBox()`). Ejemplo: `src/games/wakwak/__e2e__/wakwak.web.spec.ts`.

## Audio (expo-audio)

- **Header WAV: offsets corridos rompen el archivo** — un generador que escribió
  `audioFormat` en el offset 18 en vez de 20 corrompió `chunkSize`/`channels`;
  Chrome rechazaba con "Failed to load because no supported source". El export/E2E
  nunca reproduce audio, por eso el bug pasa inadvertido: validar el header
  (RIFF/fmt 16/PCM/mono/22050/16bit) al generar WAVs sintéticos.

## Deuda conocida (no es gotcha, no bloquea)

- **React #418 (hydration mismatch)** en el export web minificado: el HTML
  estático pre-renderizado difiere del primer render cliente (típicamente
  récords leídos de localStorage/sqlite durante el render inicial). React se
  recupera re-renderizando. Mitigación típica: posponer la lectura de récords
  a un `useEffect`. Ocurre en cualquier hosting del export estático. tracked
  en `docs/ROADMAP.md`.

## Playwright / E2E multi-worktree

- **:4173 compartido entre worktrees** — dos worktrees corriendo `e2e.mjs` en
  paralelo se pisan: el segundo "Reutilizando servidor activo" sirve el `dist/`
  del OTRO worktree (código viejo con síntomas impossibles: motor nuevo + UI
  vieja en el mismo snapshot), y el cleanup del otro mata el server a mitad de
  suite (ERR_CONNECTION_REFUSED masivo). Diagnóstico: `lsof -t -i :4173` +
  `ps -o cmd -p <pid>` — si el cmd apunta a otro worktree, NO matar el server
  (es de otra sesión): correr con `E2E_PORT=4183 node scripts/e2e.mjs`
  (el orquestador y playwright.config.ts leen la misma variable).

## React Native / Reanimated (wakwak, PLAN-WAK-POLISH)

- **Doble compensación del origen de transforms** — RN aplica transforms
  alrededor del CENTRO del elemento (`transformOrigin: '50% 50%'` default). Si
  se compensa el origen a mano (`translate(p)·scale(s)·translate(-p)`) para
  hacer zoom sobre un punto arbitrario, hay que fijar además
  `transformOrigin: '0 0'` en el style del elemento — si no, la compensación
  se aplica DOS veces y el elemento se desplaza. Detectado con screenshot del
  close-up de muerte de wakwak (el tablero aparecía desplazado a una esquina).
- **TS estrecha a `never` un `let` asignado solo dentro de un callback** — en
  `rules.ts`, un `let caughtPos: X | null = null` asignado dentro del callback
  de `.map()` queda estrechado a `null` en el punto de uso posterior (el
  análisis de flujo no cruza la closure) y `if (caught && caughtPos)` da
  `never`. Solución: acumular en un objeto mutable (`const caughtAt = {x:0,
  y:0}`) en vez de reasignar la variable.

## Web / PWA (expo-router static)

- **El head default de expo-router se reparte entre el template y el CLI**:
  `@expo/router-server/build/static/html.js` solo aporta charset,
  X-UA-Compatible, viewport y `ScrollViewStyleReset`; el `<link rel="icon">`
  (favicon), el `<title>` y los scripts de entrada los inyecta el CLI/router
  por fuera del template. Un `app/+html.tsx` propio no los pierde ni los
  duplica — verificar comparando el head del `dist/index.html` antes/después
  de agregarlo.
- **apple-touch-icon sin transparencia**: iOS aplasta los PNG con alpha a
  negro al usarlo como icono de home. Aplanar sobre el fondo de marca
  (#0F172A) y exportar en RGB (PIL: `convert('RGB')` tras paste).
