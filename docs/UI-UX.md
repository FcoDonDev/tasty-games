# UI/UX — reglas de animación, layout e interacción

Reglas transversales de interfaz aplicadas en todo el proyecto. La arquitectura
general está en [`ARCHITECTURE.md`](ARCHITECTURE.md); los criterios responsive en
el [ADR 0004](adr/0004-mobile-first-responsive.md).

## Principios

1. **Mobile-first**: toda UI debe verse bien a 360×640 sin scroll innecesario
   y aprovechar el espacio disponible (candea el spec E2E `responsive.web.spec.ts`).
2. **Layout desde medición real**: `flex: 1` distribuye el contenedor;
   `computeLayout` del engine (alimentado con `useContainerSize`) reparte la
   geometría interna (ver nota de diseño abajo).
3. **Landscape móvil por juego** ([ADR 0009](adr/0009-landscape-movil-por-juego.md)):
   los juegos con `supportsLandscape` activan el modo compacto
   (`useLandscapeMobile`): `GameHeader variant="vertical"` como rail de ~64px
   a la izquierda, liberando el alto para la zona de juego. Desktop y tablets
   sin cambios (umbral dimensión corta ≤ 480).
4. **Animar solo lo que aporta**: toda animación nombra su propósito antes de
   escribirse (gate de abajo). `ReduceMotion.System` en todo `withSpring`/
   `withTiming` nuevo.
5. **Haptics con moderación**: un haptic por acción, en el mismo frame que el
   feedback visual. Nada por frame ni en snap-backs.
6. **Accesibilidad como contrato**: todo interactivo lleva `accessibilityLabel`
   estable — son los selectores E2E (Playwright/Maestro).

## Gate de animación

Regla: nombrar el propósito en una palabra antes de escribir código; la
frecuencia decide el tier; la herramienta es la más barata que funciona;
reduced motion se entrega junto con la animación.

| Animación | Frecuencia / propósito | Herramienta (UI thread) | Config |
|---|---|---|---|
| Seguimiento de drag (carta/ficha) | Tens-daily / **spatial consistency** | `useSharedValue` + `Gesture.Pan().onUpdate` + `useAnimatedStyle` | Escritura directa en worklet (`.set()`), sin cruzar runtimes |
| Lift al tomar (escala + sombra) | Tens-daily / **feedback** | `withTiming` en el mismo `animatedStyle` del gesto (el translate del drag comparte el transform: no se puede mezclar CSS transition + worklet en un nodo) | escala máx 1.05, ~150 ms |
| Settle al soltar (drop válido) | Tens-daily / **spatial consistency** | `withSpring` con handoff de **velocity** del gesto | `{ duration: 400, dampingRatio: 0.8, velocity, reduceMotion: System }` |
| Snap-back (drop inválido) | Tens-daily / **spatial consistency** | `withSpring` con velocity | igual que settle |
| Press feedback (botones, tarjetas) | Tens-daily / **feedback** | `PressableScale` (core): Pressable + CSS transition de `transform` | scale 0.97, 120 ms, en press-in |
| Entrada/salida de overlays | Ocasional / **preventing a jarring change** | Layout animations (`entering`/`exiting`) vía `overlayAnimation` | FadeIn 220 ms / FadeOut 150 ms; nunca `scale(0)` (mín 0.95) |
| Flip de cartas memorice | Ocasional / **state indication** | Worklet (rotateY, flip en dos fases) | mantener; `scheduleOnRN` |
| Entrada de lista home | Ocasional / **delight** | Animar el **contenedor** del FlatList (nunca `entering` por fila) | FadeIn ≤250 ms |
| Flip de victoria / celebraciones | Rara / **delight** | Único lugar permitido para overshoot | — |

**No anima** (gate rechaza): cambios de tab/ruta (default nativo del Stack),
hover (no existe en el target), récords estáticos, aperturas de settings
(default de plataforma).

## Nota de diseño: `flex: 1` vs `computeLayout`

No son alternativas excluyentes: resuelven niveles distintos.

- **`flex: 1`** resuelve la distribución del contenedor: el área de juego ocupa
  el alto restante y permite centrar el tablero dentro. Es la capa correcta
  para "que no sobre espacio".
- **`computeLayout`** resuelve la geometría interna: cartas, pips, offsets de
  fan, posiciones exactas de cada pila/casilla. Se necesitan como números
  concretos para: posicionamiento absoluto (`left/top`), **hit-testing
  matemático del drop** y calcular el destino del settle/snap-back.

Un grid con puro flexbox sirve para memorice (grid estático, ya lo usa); para
solitario y damas (pilas que crecen, superposición, drop por coordenadas) la
única fuente robusta es una función de geometría pura testable.

**Conclusión adoptada**: combinar ambos. Contenedor `flex: 1` (más centrado) y
`computeLayout` alimentado con el tamaño **real medido** por `onLayout` (no
`window − CHROME_HEIGHT` adivinado).

## Política de haptics

- Un haptic por acción, mismo frame que el visual: `impactAsync(Light)` al
  commit del drop (no al terminar la animación); `notificationAsync(Success)`
  solo en victoria.
- Nada por frame, nada en snap-backs, nada extra en botones (más ruido que
  señal).
- Desde worklet: `scheduleOnRN(hapticFn)`. Solo nativo (`EXPO_OS !== 'web'`);
  el feedback visual funciona solo.
- Los juegos consumen `src/core/ui/haptics.ts` — nunca importan expo-haptics
  directamente.

## Detalles de pulido aplicados

- Contadores numéricos con `fontVariant: ['tabular-nums']` (evita el baile de
  dígitos).
- `borderCurve: 'continuous'` en botones, tarjetas y paneles; NO en cápsulas
  ni en piezas de juego (no son botones).
- Elementos de juego (carta de memorice, ficha de damas) no llevan
  `PressableScale`: tienen su propio feedback (flip / drag).
- Safe areas con `useSafeAreaInsets` (nunca `paddingTop` hardcodeado).
- Overlays de core con `zIndex: 50` (los siblings posteriores del juego pintan
  encima).

## Verificación visual

- Verificar con viewport 360×640 (1280×900 para desktop web; 740×360 para el
  modo landscape de solitario); capturas temporales que se borran antes de
  commitear.
- Las animaciones que los specs solo validan por resultado final se verifican
  **mid-gesto**: muestrear `getComputedStyle(el).transform` con el mouse down
  sostenido (ej: drag activo, press activo). Los E2E miden posición final;
  el muestreo mid-gesto es el chequeo que agrega valor para "sigue el dedo".
- Los E2E que miden posición final tras settle/snap-back necesitan waits
  ≥900–1000 ms (spring 400 ms perceptual ≈ 600 ms real + render).
