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

## Gestos (gesture-handler)

- **Doble tap: `maxDelay(500)` explícito** en `Gesture.Tap().numberOfTaps(2)` — el
  default **nativo** es 200 ms y un doble tap humano lento falla (web ya era 500).
  Validado con dblclick de Playwright, pausas de 200–250 ms y jitter de 8 px que
  activa el Pan sin romper el tap.

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
