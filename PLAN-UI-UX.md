# Plan de mejoras UI/UX — Fase U (pantalla completa, drag con seguimiento, navegación)

> Complemento de `PLAN-IMPLEMENTACION.md`. Estado de ejecución marcado con checkboxes.
> Origen: evaluación de UI/UX de la sesión actual sobre Fases 0–4 completadas, revisada contra las recomendaciones de la skill **expo-animation** (Reanimated 4, worklets, gate de animación).
> Decisión de usuario: ScoreBoard al header · expo-haptics sí · refactor de layout con medición real (onLayout) · pulido completo (home + transiciones).

---

## 0. Hallazgos de la evaluación (estado actual)

| # | Hallazgo | Evidencia |
|---|---|---|
| H1 | **El arrastre no sigue el dedo**: el gesto Pan solo define `onStart`/`onEnd`, sin `onUpdate`. Los `tx/ty` solo se escriben al soltar (settle/snap-back). Durante el drag la carta/ficha solo hace "lift" (escala + sombra) pero queda clavada en su posición | `src/core/ui/drag/useDraggable.ts:17-32` (no hay `.onUpdate`); solitario `SolitarioScreen.tsx:79-82`; damas `DamasScreen.tsx:31-32` |
| H2 | **Layouts derivan de `useWindowDimensions` + reserva hardcodeada** (`CHROME_HEIGHT = 190/200`) que adivina el alto de chromeBar+header+scoreboard. Si no coincide, sobra espacio o la carta queda más chica de lo posible | `solitario/engine/layout.ts:35`, `memorice/engine/layout.ts:2`, `damas/engine/layout.ts:16` |
| H3 | **Espacio vertical desperdiciado**: solitario (`board` con `height: boardHeight` + `marginTop: 12`) y damas (tablero pegado arriba) no centran el tablero; memorice sí centra con `flex: 1` (el buen patrón) | `SolitarioScreen.tsx:288`, `DamasScreen.tsx:140`, `MemoriceScreen.tsx:90` |
| H4 | **ScoreBoard como bloque roba ~50px verticales** al tablero en solitario y memorice | `SolitarioScreen.tsx:286`, `MemoriceScreen.tsx:88` |
| H5 | **Targets táctiles pequeños (~32px de alto)** y sin feedback de press en GameHeader, overlays y home (HIG: ≥44px) | `GameHeader.tsx:142-150` |
| H6 | **Safe areas hardcodeadas**: `paddingTop: 44` en el contenedor de juego y `paddingTop: 60` en home; `react-native-safe-area-context` está instalado pero sin usar | `app/juego/[id].tsx:83`, `app/index.tsx:68` |
| H7 | **Overlays sin animación**: victoria, derrota, confirmación de reinicio y ayuda aparecen instantáneamente | `GameHeader.tsx:94-124`, overlays de los 3 juegos |
| H8 | Detalles menores: contadores sin `tabular-nums`, bordes sin `borderCurve: 'continuous'`, imports duplicados en home, prop `left` de GameHeader renderiza a la derecha | `app/index.tsx:1-7`, `GameHeader.tsx:14-15` |
| H9 | APIs de animación deprecadas/frágiles: `runOnJS` (deprecado en Reanimated 4), acceso directo a `.value` (no compiler-safe), springs con `damping/stiffness` en vez de `duration/dampingRatio`, settle con `withTiming(120ms)` sin handoff de velocidad del gesto | `useDraggable.ts`, `SolitarioScreen.tsx:193-202`, `DamasScreen.tsx:90-99`, `memorice/Card.tsx:5` |

---

## 0b. Gate de animación (skill expo-animation): qué anima, para qué y con qué

Regla de la skill: nombrar el propósito en una palabra antes de escribir código; frecuencia decide el tier; herramienta = la más barata que funciona; reduced motion se entrega junto con la animación.

| Animación | Frecuencia / propósito | Herramienta (UI thread) | Config |
|---|---|---|---|
| Seguimiento de drag (carta/ficha) | Tens-daily / **spatial consistency** | `useSharedValue` + `Gesture.Pan().onUpdate` + `useAnimatedStyle` | Escritura directa en worklet (`.set()`), sin cruzar runtimes |
| Lift al tomar (escala + sombra) | Tens-daily / **feedback** | Estado `dragActive` → transition CSS de Reanimated en el mismo `animatedStyle` del transform | escala máx 1.05, ~150ms |
| Settle al soltar (drop válido) | Tens-daily / **spatial consistency** | `withSpring` con handoff de **velocidad** del gesto | `{ duration: 400, dampingRatio: 0.8, velocity }` |
| Snap-back (drop inválido) | Tens-daily / **spatial consistency** | `withSpring` con velocity | `{ duration: 400, dampingRatio: 0.8, velocity }` |
| Press feedback (botones, tarjetas) | Tens-daily / **feedback** | `Pressable` + **Reanimated CSS transition** (`transitionProperty`), NO spring/worklet | `scale: 0.97`, 100–150ms, en press-in |
| Entrada/salida de overlays (victoria, derrota, reinicio, ayuda) | Ocasional / **preventing a jarring change** | Layout animations (`entering`/`exiting`) | `FadeIn.duration(220)` / `FadeOut.duration(150)`; nunca `scale(0)` (mín 0.95) |
| Flip de cartas memorice (ya existe) | Ocasional / **state indication** | Ya es worklet (rotateY) | Mantener; solo migrar `runOnJS` → `scheduleOnRN` |
| Entrada de lista home | Ocasional / **delight** | Animar el **contenedor** (FlatList virtualizado: nunca `entering` por fila) | `FadeIn` ease-out ≤250ms |
| Flip de victoria / celebraciones | Rara / **delight** | Aquí vive el presupuesto de "delight" | Único lugar permitido para overshoot |

No anima (gate rechaza): cambios de tab/ruta (default nativo del Stack), hover (no existe), récords estáticos, aperturas de settings (usar default de plataforma).

---

## 1. Fases y checklist

### Fase U1 — Arrastre que sigue el dedo (core del pedido) ✅ COMPLETADA

**Core — todo en UI thread (worklet), React no re-renderiza por frame**
- [x] `src/core/ui/drag/useDraggable.ts`: extender el hook para aceptar `SharedValue<number>` (`tx`, `ty`) y escribir en `.onUpdate` con `.set()` (compiler-safe): `tx.set(event.translationX); ty.set(event.translationY)` — worklet puro, sin cruzar runtimes por frame
- [x] Los callbacks JS (`onDragStart`/`onDragEnd`) quedan solo para start/end; nunca `setState` ni `scheduleOnRN` dentro de `onUpdate` (60–120×/seg)
- [x] `onEnd` reporta también `velocityX/velocityY` del gesto (handoff al settle/snap-back)
- [x] Migrar `runOnJS` → `scheduleOnRN` (de `react-native-worklets`, ya instalado) en el código tocado: `finishDrag` de solitario y damas, `useAnimatedReaction` de memorice Card
- [x] Acceso a shared values con `.get()`/`.set()` en todos los archivos tocados (nunca leer/escribir durante render)
- [x] Bajar `activeOffsetX/Y` de `[-10, 10]` a `[-6, 6]` para respuesta más inmediata
- [x] Extra: `cancelAnimation` en `onStart` (un drag nuevo interrumpe un settle/snap-back en vuelo) y `.onFinalize(!success)` que resetea `tx/ty` + limpia dragKey (gesto cancelado por segundo dedo/llamada)

**Consumidores**
- [x] Solitario: `SolitarioScreen.tsx` pasa `tx/ty` vía `DragCallbacks` a `Pile` → `PileCard` → `useDragGesture` (las secuencias de tableau ya se mueven juntas vía `dragActive` + shared values)
- [x] Damas: `DamasScreen.tsx` pasa `tx/ty` a `PieceView` → `useDragGesture`
- [x] Rotación sutil (1.5°) del elemento arrastrado durante el gesto; **orden del transform: translate → rotate → scale** (el orden multiplica)
- [x] Settle y snap-back: reemplazados `withTiming(0, { duration: 120 })` y `{ damping: 16, stiffness: 220 }` por springs con handoff de velocidad: `withSpring(0, { duration: 400, dampingRatio: 0.8, velocity, reduceMotion: ReduceMotion.System })`
- [x] Nota de desviación: el lift usa `withTiming(150ms)` en el mismo `animatedStyle` del gesto (no CSS transition): el translate del drag comparte el transform y no se pueden mezclar ambas vías en un solo nodo

**Haptics**
- [x] `pnpm exec expo install expo-haptics` (57.0.2, matriz del SDK)
- [x] Un haptic por acción, en el mismo frame que el visual: `impactAsync(ImpactFeedbackStyle.Light)` al commit del drop (no al terminar la animación); `notificationAsync(Success)` solo en victoria (solitario, memorice y damas); **nada** por frame ni en snap-back
- [x] Desde worklet: `scheduleOnRN(hapticFn)`; solo nativo (`EXPO_OS !== 'web'`); el feedback visual funciona solo
- [x] Wrapper común `src/core/ui/haptics.ts` (ningún juego importa expo-haptics directamente)

**Reduced motion y setup**
- [x] `reduceMotion: ReduceMotion.System` en todo `withSpring`/`withTiming` nuevo. Nota: el seguimiento del drag no cambia con motion reducido (escritura directa con `.set()`, manipulación directa); lo que se suaviza es el settle/snap-back
- [x] Setup verificado: `GestureHandlerRootView` al root (ya estaba), worklets plugin automático vía `babel-preset-expo`

**Criterios de aceptación**
- [x] Carta/ficha se desplaza pegada al puntero durante todo el gesto — **verificado en web mid-gesto**: solitario muestra `translate(112.5, 60)` con mouse en ~(114, 58); damas `translate(55.8, -55.8)`
- [x] Soltar con velocidad hereda el handoff (settle muestreado a mitad de glisa: `-16.5` → asiento exacto)
- [x] Snap-back y settle siguen funcionando (e2e drag de solitario y damas verde)
- [x] `pnpm typecheck` + `pnpm test` (154/154) + `pnpm e2e:web` (15/15) verde
- [ ] Feel-check en device nativo (pendiente a Fase U4: release build, flick, interrupción, timing haptic)

---

### Fase U2 — Pantalla al 100%, sin scroll

**Medición real del contenedor**
- [ ] Nuevo hook compartido `src/core/ui/useContainerSize.ts`: `onLayout` → `{width, height}` con estado (reemplaza la adivinanza window + CHROME_HEIGHT)
- [ ] Los 3 juegos miden el View del tablero y pasan el tamaño real a `computeLayout` / `computeCardSize`
- [ ] Eliminar `CHROME_HEIGHT` de los 3 engines de layout (las firmas pasan a significar "tamaño real del área de juego") y actualizar sus tests unitarios

**Distribución del espacio**
- [ ] Solitario y damas: tablero centrado verticalmente dentro del área medida (patrón memorice, `flex: 1`); en solitario `boardHeight` sigue derivando de `columnExtent` para el hit-test
- [ ] Memorice: mantener centrado, revisar gaps/margins para llenar sin sobrantes

**ScoreBoard al header (decisión de usuario)**
- [ ] `GameHeader` gana zona compacta con el récord (`record-<gameId>` label existente se conserva para E2E)
- [ ] Solitario y memorice dejan de renderizar `<ScoreBoard>` como bloque; `GameCard` sigue usando el compact
- [ ] `app/juego/[id].tsx` y `app/index.tsx`: usar `useSafeAreaInsets` en vez de `paddingTop: 44/60`

**Criterios de aceptación**
- [ ] A 360×640 y en desktop: los 3 juegos llenan el área disponible sin scroll y sin espacio muerto notable
- [ ] Spec E2E `responsive.web.spec.ts` verde (actualizar candeos si cambian medidas)

---

### Fase U3 — Botones de navegación, feedback y animaciones

**Targets táctiles**
- [ ] `minHeight: 44` + `hitSlop` en `HeaderButton`, botones de overlays, gear de home y botones de ajustes
- [ ] `borderCurve: 'continuous'` en botones, tarjetas y cartas (no en cápsulas)

**Feedback de press (barato que funciona: CSS transition, no worklet)**
- [ ] `Pressable` + Reanimated CSS transition (`transitionProperty: 'transform, opacity'`): feedback en **press-in** (no al completar el tap), `scale: 0.97` en 100–150ms; aplicar en `HeaderButton`, `GameCard` y botones de overlays
- [ ] `pressRetentionOffset` para que un drift de pocos px no cancele el press intencional
- [ ] Contadores ("Movimientos: N", "Intentos: N") con `fontVariant: 'tabular-nums'`

**Overlays y transiciones**
- [ ] Layout animations de entrada/salida en overlays de victoria/derrota/reinicio/ayuda: `FadeIn.duration(220)` / `FadeOut.duration(150)` (ease-out; **nunca `scale(0)`** — si se quiere zoom, entering custom con escala inicial 0.95 + opacity 0)
- [ ] Home: animar el **contenedor** de la lista (FlatList virtualizado — nunca `entering` por fila), `FadeIn` ease-out ≤250ms; limpiar imports duplicados en `app/index.tsx`
- [ ] Revisar transición del Stack (`app/_layout.tsx`): mantener default nativo (gate: los cambios de ruta no se re-animan a mano)
- [ ] Reduced motion: los fades se mantienen (explican el cambio de estado); sin traslación/escala/overshoot en ninguna animación nueva

**Criterios de aceptación**
- [ ] Todo botón interactivo tiene feedback visual al presionar y área ≥44px
- [ ] Overlays entran/salen con animación y sus labels de accesibilidad no cambian (E2E verde)

---

### Fase U4 — Verificación y regresión

- [ ] `pnpm typecheck`
- [ ] `pnpm test` — actualizar tests de los 3 `layout.ts` (firmas nuevas) y de GameHeader/ScoreBoard
- [ ] `CI=1 pnpm exec expo export --platform web` (build OK)
- [ ] `pnpm e2e:web` — specs afectadas: `responsive.web.spec.ts`, specs de ayuda/ajustes (GameHeader cambió), specs de drag de solitario/damas
- [ ] Mantener estables los `accessibilityLabel` existentes (`record-<gameId>`, `ayuda-<gameId>`, `solitario-card-*`, `damas-ficha-*`, etc.): son selectores E2E
- [ ] Verificar en `app.json` `ios.infoPlist.CADisableMinimumFrameDurationOnPhone: true` (si no, agregarlo — ProMotion cap a 60fps)
- [ ] **Feel-check en device** (release build, Android más lento soportado; Expo Go/simulador no cuentan): arrastrar y soltar con flick (¿la velocidad se hereda?), interrumpir el snap-back a mitad de vuelo, drag largo de secuencia completa de tableau, timing del haptic contra el settle visual

---

## 2. Riesgos y reglas

- Cambiar firmas de `computeLayout` toca engine + tests de 3 juegos → regresión controlada por tests existentes.
- Los E2E importan `layout.ts` para asserts de coordenadas → actualizar en la misma fase U2.
- Regla dura del repo: nada en `src/games/<a>` importa de `src/games/<b>`; todo lo compartido (hook drag extendido, wrapper haptics, `useContainerSize`, botón animado) va en `src/core/ui/`.
- Los juegos solo llaman `onGameEnd(result)`; el header/ScoreBoard no altera el contrato de `GameDefinition`.
- En producción no existe canal para alterar el reparto (seeds solo con `EXPO_PUBLIC_E2E=1`).

---

## 3. Nota de diseño: `flex: 1` vs `computeLayout` (por qué se usan ambos)

`flex: 1` y `computeLayout` **no son alternativas excluyentes**: resuelven niveles distintos.

- **`flex: 1` resuelve la distribución del contenedor**: hace que el área de juego ocupe todo el alto restante y permite centrar el tablero dentro de esa área (así lo hace memorice con `board: { flex: 1, justifyContent: 'center' }`). Es la capa correcta para "que no sobre espacio".
- **`computeLayout` resuelve la geometría interna del tablero**: cartas, pips, offsets de fan, posiciones exactas de cada pila/casilla. Estas medidas se necesitan como **números concretos** para:
  1. posicionamiento absoluto de cartas/fichas (`left/top`),
  2. **hit-testing matemático del drop** (`hitTestPile` / `hitTestSquare` reciben coordenadas numéricas),
  3. calcular la posición destino del settle y del snap-back (requiere conocer `cardPosition` destino).

Un layout con puro flexbox (filas/columnas con gap) sí serviría para memorice (grid estático), y de hecho memorice ya lo usa; pero para solitario y damas, donde las pilas crecen dinámicamente (fan del tableau), hay superposición de cartas y el drop se valida contra coordenadas, la única fuente robusta es una función de geometría pura testable.

**Conclusión adoptada en este plan (Fase U2): combinar ambos.** El contenedor del tablero pasa a `flex: 1` + centrado (para aprovechar el 100% de la pantalla), y `computeLayout` se conserva pero alimentado con el tamaño **real medido** por `onLayout` de ese contenedor (en vez de `window - CHROME_HEIGHT` adivinado). Así flex distribuye el espacio y computeLayout lo reparte con precisión dentro.
