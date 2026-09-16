# Robo Jump — Notas técnicas

Arcade vertical endless. Implementación según `PLAN-DOODLE-JUMP` (rama
`feat/robo-jump`); ver PLAN para decisiones D1–D14 completas.

## Arquitectura

```
engine/
├── tuning.ts   # ÚNICA fuente de constantes (§3.2 del PLAN); tests candean relaciones
├── rules.ts    # PURO: física de sub-pasos (8 ms), colisiones, generación, wrap, disparo apuntado
├── fixtures.ts # Fixtures de mecánica: mundo cerrado + guión de input (unit + E2E vía seed)
├── seed.ts     # sentinelas E2E (torre central / monstruo en eje) + fixtures + config
└── state.ts    # zustand D8: snapshot mutable interno + publicación discreta/throttled
components/
├── Renderer.tsx # pools fijos de nodos animados (shared values) — sin re-renders por frame
└── Overlays.tsx # pausa / fin (paleta sketch del juego)
RoboJumpScreen.tsx # loop rAF, gestos drag+tap, teclado web, audio/haptics, popups
```

## Fixtures de validación

Mecánicas pautadas con escenario fijo (mundo cerrado, sin generación):
`?seed=fix-spring|hat|squish|squish-fast|aim|blue-brown|wrap` (E2E) y
`replayFixture` en `__tests__/fixtures.test.ts` (exactitud mecánica).
El guión vive en `engine/fixtures.ts`; la exactitud en unit, el visible
(popups/posiciones) en E2E.

## Diagnóstico `window.__roboDebug()` (solo builds E2E)

La pantalla registra `window.__roboDebug()` **solo cuando el bundle se
compiló con `EXPO_PUBLIC_E2E=1`** (la env se inlinea al compilar — el gate
vive en `RoboJumpScreen.tsx` y en `app/juego/[id].tsx`). En producción no
existe: si `window.__roboDebug is not a function`, el bundle no la tuvo.

```bash
# Dev (recuerda: reload COMPLETO de la pestaña tras lanzar — Reanimated):
EXPO_PUBLIC_E2E=1 EXPO_NO_TELEMETRY=1 pnpm exec expo start --web --offline --port 8082

# Export manual (los seeds y el hook solo viven en builds con la env):
EXPO_PUBLIC_E2E=1 CI=1 pnpm exec expo export --platform web
```

Qué devuelve (snapshot del engine en el instante de la llamada):

```json
{
  "status": "playing", "score": 98, "camY": -690, "elapsedMs": 29040,
  "robot": { "x": 180, "y": -324, "hatMs": 0 },
  "platformsInView": 9,   // plataformas del engine DENTRO de la vista
  "platforms": 15, "monsters": 1, "bullets": 0
}
```

Uso típico: en Playwright, `page.evaluate(() => window.__roboDebug())`
en el momento del síntoma y comparar contra el DOM (nodos con opacity > 0
dentro de `[aria-label="robo-jump-escena"]`) — es la prueba de
consistencia engine↔render que validó R0/R7 (ver PLAN, T17a).

## Divergencias clave con serpiente/wakwak (no es un "espejo" literal)

1. **Publicación D8**: la física es continua (cambia cada frame), así que el
   `GameState` NO vive en zustand: vive como snapshot mutable interno
   (`getGame()`); zustand publica solo `paused/status/score` con throttle
   ≤ 5 Hz + inmediato al morir. El render escribe shared values cada frame
   desde `getGame()`. Publicar por frame serían 60 re-renders/s.
2. **Sub-pasos fijos (D9)**: `advance` consume dt en pasos de 8 ms con guard
   `MAX_SUBSTEPS` (8) → determinista por partición de dt (test T3). El
   guard define el contrato: la pantalla llama `tick` con dt ≤ 100 ms del
   rAF; `tick(6000)` avanza solo 64 ms.
3. **Cámara y-down**: `camY` es el TOPE de la vista y SUBIR = DECRECER.
   `camY = min(camY, robot.y - CAM_LINE*WORLD_H)`. Candidar monotonicidad
   no-creciente, no la intuición.
4. **Renderer con pools fijos**: posiciones por shared values escritas por
   el loop (padre) en slots registrados por hijos; React re-renderiza solo
   al cambiar el set de entidades (ids join-compare por frame, ~1-2 Hz).
   Copia de wrap del Robot: segundo nodo pre-creado con opacity
   condicionada a la cercanía de borde.

## Audio/haptics (D10/D11)

- Sin assets nuevos: reuse de players core con rates cuando haga falta.
  `bounce`→cardDrop, `spring/hat`→powerUp, `shoot`→cardMove, `kill`→hit,
  `die`→explosion.
- Haptics SOLO spring (light), kill (medium), die (heavy). El rebote normal
  no vibra (frecuencia ~1/s: spam).

## Tuning

Valores en `engine/tuning.ts` (semillas a calibrar en playtest); los tests
de invariantes candean RELACIONES (alcanzabilidad: gap ≤ 0.8·salto máx;
spring alcanza > maxGap; caps coherentes), no valores exactos.
