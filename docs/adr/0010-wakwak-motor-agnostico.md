# 0010 — Wak Wak: núcleo lógico agnóstico al motor + adaptador Views/Reanimated

**Estado:** Aceptada

## Contexto

Wak Wak es el primer juego en tiempo real del proyecto (los existentes son por
turnos). Antes de implementarlo se exploró el ecosistema de motores de juego
para RN/Expo (exploración completa en `PLAN-WAK-WAK.md` §4, rama
`feature-wak-wak`). Hallazgo marco: **no existe un motor de juego React Native
completo en 2026** ("the game engine gap", grzegorzotto.dev); solo hay:

- **Renderizadores GPU sin capa de motor**: `@shopify/react-native-skia` +
  Reanimated 4 (batching de sprites vía `useRSXformBuffer`), `expo-gl`,
  `react-native-wgpu`.
- **Un engine dormido**: `react-native-game-engine` (última release 2020, techo
  ~50 entidades renderizadas como Views).
- **Motores web embebidos en WebView** (Phaser): dos runtimes aislados, 5–10×
  más lento en Android, integración nula con récord/haptics/E2E del repo.
- **Hacks recientes**: `@penabt/pixi-expo` (PixiJS v8 sobre expo-gl, v0.2),
  `expo-phaser` (Phaser-CE 2017, muerto), `@react-three/native` (pre-alpha).

Restricciones del proyecto: Web + Android desde un solo código (ADR 0001: Views
nativos, sin Skia — scopeada a juegos por turnos), New Architecture (Reanimated
4), lógica testeable con Jest, bundle acotado.

## Decisión

Dos decisiones:

1. **Núcleo lógico agnóstico al motor** (puertos y adaptadores): la lógica de
   Wak Wak vive en `src/games/wakwak/engine/` como TypeScript puro, sin
   dependencias de RN, Reanimated, Skia ni de ningún motor. El punto de entrada
   es `advance(state, dtMs, input)` por tick fijo. La capa de render implementa
   un **puerto de presentación** (`renderer/types.ts`: `createWorld`, `present`,
   `onDirection`); solo los adaptadores en `renderer/` importan la librería de
   render. El loop es parte del adaptador: el núcleo nunca conoce
   `requestAnimationFrame` ni tickers de librerías.

2. **MVP con adaptador A (Views nativos + Reanimated 4)**: entidades como
   `Animated.View` movidas por shared values actualizadas por un loop rAF en el
   JS thread; cero `setState` por frame (React state solo en eventos discretos).
   Con ~5 entidades móviles + grilla estática, el régimen de Views es holgado.
   `@shopify/react-native-skia` queda definido como **adaptador de contingencia
   (B)**: si el feel-check en release build muestra jank, se migra solo
   `renderer/` sin tocar `engine/`.

## Consecuencias

- Cambiar de motor de render (A→B) toca únicamente `renderer/` y
  `WakWakScreen.tsx`; reglas, IA, seeds y tests sobreviven intactos.
- ADR 0001 se mantiene para los juegos por turnos existentes; Wak Wak opera
  bajo este ADR. Si se adopta Skia, se creará un ADR que documente la salvedad
  (costo web: CanvasKit WASM ~2.9 MB gz; nativo: 3–5 MB de binarios).
- El loop corre en el JS thread: riesgo de jank mitigado por tick fijo y por el
  confinamiento del cambio a `renderer/`. Feel-check obligatorio en release
  build (ver ROADMAP feel-check device).
- Quedan documentados como alternativas de referencia para futuros juegos
  tiempo real: Skia+Reanimated (rendimiento), Phaser-en-WebView (port de un
  juego web terminado), `rn-game-engine-next` (patrón equivalente, adopción
  mínima a la fecha).
