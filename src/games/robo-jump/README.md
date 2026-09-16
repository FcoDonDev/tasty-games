# Robo Jump — Notas técnicas

Arcade vertical endless. Decisiones de diseño (D1–D22) y hallazgos en el
historial de git de la rama `feat/doodle-jump` (PLAN-DOODLE-JUMP, eliminado
en el commit de cierre); ver RULES.md para las reglas QA.

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

## Juice visual (fase 5, D18–D22)

Todo el juice es 100% cosmético (UI-thread, cero cambios de física/score;
gated por `useReducedMotion`; specs E2E intactos):

- **Eventos con posición (D18)**: `spring`/`hat`/`kill`/`die` son payloads
  `{ type, x, y }` (+ `by: 'bullet'|'squish'|'hat'` en kill) en unidades
  del mundo — la pantalla los usa como ORIGEN de partículas sin derivar
  posiciones del estado post-tick (el monstruo muerto ya no existe).
  `bounce`/`shoot`/`break` siguen siendo strings.
- **Partículas (D19)**: `components/Particles.tsx` — pool fijo
  (`PARTICLE_POOL 20` + `TRAIL_POOL 8`) de nodos 1×1 escalados por el
  transform; cada emisión setea 8 shared values y lanza UN tween de
  progreso `k`; ángulos deterministas (reparto radial × salto áureo por
  contador, sin Math.random). API `burst(x, y, style)` y
  `emit(x, y)` (estela del turbo: `renderFrame` emite cada
  `TRAIL_EVERY_MS` mientras `hatMs > 0`).
- **Muerte por monstruo (D20)**: flash blanco → squash & stretch → ojos ✕
  → tumbo girando con fade, todo en `RoboSlot` (SVs `flash/squashX/
  squashY/ko/dead`) disparado por `triggerRoboDeath` en `die` con
  `cause:'monster'`; la secuencia (680 ms) vive dentro de
  `END_DELAY_LOST_MS` (700 ms). La muerte por caída no cambia. El reset
  de los SV en `restart` (`resetRoboFx`) es OBLIGATORIO: sin él el tumbo
  del run anterior seguiría animando.
- **Monstruos (D21)**: estático = blob ancho con púas + ceño; móvil =
  compacto con 2 alas batiendo desfasadas; ojos que siguen al robot
  (SV `lookX` por slot, creado por el propio `MonsterSlot` y seteado en
  `renderFrame`), bob de respiración y parpadeo con fase por índice
  (determinista). Los hitboxes no cambian (contenedor 26×26).
- **Hélice (D22)**: el aspa gira con `withRepeat(360°/160 ms, linear)`
  siempre en UI thread (invisible con `hatOpacity = 0`; el loop fijo
  cuesta menos que gestionar su arranque/parada por JS).

Trampas documentadas en `docs/GOTCHAS.md` (Reanimated): loops con
`cancelAnimation` al desmontar, fade multiplicado fuera del SV del
loop por-frame, SV creado por quien lo usa.
