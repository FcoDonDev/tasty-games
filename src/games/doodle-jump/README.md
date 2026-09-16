# Doodle Jump — Notas técnicas

Arcade vertical endless. Implementación según `PLAN-DOODLE-JUMP` (rama
`feat/doodle-jump`); ver PLAN para decisiones D1–D14 completas.

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
└── Overlays.tsx # pausa / fin (paleta doodle)
DoodleJumpScreen.tsx # loop rAF, gestos drag+tap, teclado web, audio/haptics, popups
```

## Fixtures de validación

Mecánicas pautadas con escenario fijo (mundo cerrado, sin generación):
`?seed=fix-spring|hat|squish|squish-fast|aim|blue-brown|wrap` (E2E) y
`replayFixture` en `__tests__/fixtures.test.ts` (exactitud mecánica).
El guión vive en `engine/fixtures.ts`; la exactitud en unit, el visible
(popups/posiciones) en E2E. Solo activos con `EXPO_PUBLIC_E2E=1`.
En builds E2E la pantalla expone además `window.__doodleDebug()` con un
resumen del engine (conteos, camY, plataformas en vista) para diagnosticar
engine↔render desde Playwright.

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
   `camY = min(camY, doodler.y - CAM_LINE*WORLD_H)`. Candidar monotonicidad
   no-creciente, no la intuición.
4. **Renderer con pools fijos**: posiciones por shared values escritas por
   el loop (padre) en slots registrados por hijos; React re-renderiza solo
   al cambiar el set de entidades (ids join-compare por frame, ~1-2 Hz).
   Copia de wrap del Doodler: segundo nodo pre-creado con opacity
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
