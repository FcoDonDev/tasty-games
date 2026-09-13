# PLAN-SERPIENTE — clásico juego de la serpiente

> PLAN temporal (ver `AGENTS.md` § Flujo de trabajo con PLAN). Vive en la raíz,
> se commitea junto al trabajo y **se elimina en el commit final de cierre**
> tras migrar hallazgos (tabla de destinos en `AGENTS.md`).

## 1. Contexto

Quinto juego de la colección (`memorice`, `solitario`, `damas`, `wakwak` + este).
El clásico snake: la serpiente crece al consumir puntos, muere por
auto-colisión (y contra el muro según setting), la velocidad aumenta con el
progreso. Primer juego de la colección con crecimiento del avatar; reutiliza el
patrón de tiempo real de `wakwak` pero a cadencia baja (~7–14 ticks/s en vez de
60 fps).

Referencias (no duplicar, enlazar):

- Contrato: `src/core/types.ts` (`GameDefinition`, `GameScreenProps`, `GameResult`).
- Registro: `src/core/game-registry.ts` (agregar 1 línea).
- Motor modelo: `src/games/wakwak/engine/` (`rules.ts`, `state.ts`, `controls.ts`,
  `seed.ts`) + decisiones en `src/games/wakwak/README.md` y `RULES.md`.
- Render barato / input por plataforma / E2E táctil CDP: `WakWakScreen.tsx`.
- UI compartida: `src/core/ui/` (`GameHeader`, `PressableScale`, `HelpModal`,
  `overlayAnimation`, `useContainerSize`, `useIsTouchDevice`, `sound.ts`,
  `haptics.ts`).
- Lecciones toolchain: `docs/GOTCHAS.md`. Métricas: `docs/adr/0011-metricas-performance.md`.

## 2. Objetivo

MVP = **un solo juego base completo** (`id: 'serpiente'`, icono `🐍`,
`minDurationHint: '2-5 min'`, `supportsLandscape: false`).
La variante de §4 es **Arcade jugoso**, único camino.

## 3. Decisiones de diseño (aprobadas con el usuario)

| # | Decisión | Opción elegida | Alternativas descartadas |
|---|---|---|---|
| D1 | Borde | **Ambos vía setting** `serpiente.wrap` (`true` = atraviesa / `false` = muere). Default `true`. Persistido en `preferencesRepository` (par dual `.ts` + `.web.ts`) | Solo muros / solo wrap |
| D2 | Velocidad | **Progresiva**: `stepMs = max(70, 140 - eaten*4)` (~7 → 14 celdas/s) | Fija + setting / niveles 1–8 tipo WakWak v2 |
| D3 | Visual | **Arcade jugoso** (único camino) | Neón clásico, Zen táctil (descartadas 2026-09-13) |
| D4 | Alcance | **Arcade jugoso** llega al juego final | Variantes como settings |
| D5 | Grid MVP | **20×20 fijo**, celda = `min(w/20, h/20)` medido con `useContainerSize` (D4) | 18×24 vertical — pendiente confirmar (ver §7) |
| D6 | Score (más-es-mejor) | Normal `+10`, especial `+50`, bonus supervivencia `+1/s` al cerrar | Solo longitud / solo puntos |
| D7 | Especial | Cada 5 comidas, 8 s en celda libre alejada — pendiente confirmar caducidad (ver §7) | Permanente hasta comerlo |
| D8 | Motor | **Núcleo puro** `advance(state, dtMs)` ticks fijos + `remainderMs` (tope 8/frame), `mulberry32` propio duplicado (regla de aislamiento entre juegos) | Extraer RNG a core (deuda conocida, no ahora) |
| D9 | Input | Buffer máx 2, último-gana; **reversa 180° prohibida** (difiere de WakWak, donde la reversa es inmediata); teclado flechas+WASD en PC web, swipe + flotante re-centrado en táctil | D-pad visible (eliminado en WakWak: roba tablero) |
| D10 | Render | Re-render React por tick (cadencia baja, sin shared values por frame); grilla memoizada patrón `MazeLayer` | Adaptador Reanimated por frame (innecesario a esta cadencia) |
| D11 | Fin | `status: 'playing'|'won'|'lost'`; `won` = tablero lleno; `onGameEnd` una sola vez (`endedRef`), solo `app/juego/[id].tsx` escribe récords | — |
| D12 | Seeds E2E | `test-win`, `test-lose`, `test-crecer`, solo con `EXPO_PUBLIC_E2E=1` | — |

## 4. Propuesta base + variante UI/UX

### Base (común, innegociable)

```
src/games/serpiente/
  index.ts, SerpienteScreen.tsx, RULES.md, README.md
  engine/ grid.ts rules.ts controls.ts seed.ts state.ts
  components/ Hud.tsx Overlays.tsx SettingsSheet.tsx
  preview/ (solo dev, patrón ADR 0012)
  __tests__/ rules.test.ts controls.test.ts seed.test.ts
  __e2e__/ serpiente.web.spec.ts (+ responsive)
```

Estado puro (`engine/rules.ts`): `snake: number[]` (cabeza al frente),
`dir/queued/food/special/eaten/score/elapsedMs/remainderMs/stepMs/wrap/status/rng`.
API: `createGameState`, `setDirection` (descarta opuesto+duplicado),
`advance(state, dtMs) -> { state, events: 'eat'|'special'|'die'|'win' }`.
Store zustand espejo de `wakwak/engine/state.ts`:
`game/paused/wrap/startRun/reset/tick/setDirection/togglePause`.
Header estándar (`GameHeader`, centro `🐍 score · ⬢ long`), settings ⚙
(wrap + control + anillo), pausa ⏸, `accessibilityLabel` estables
(`tablero-serpiente`, `salir-serpiente`, `reiniciar-serpiente`, …).
Sonido/haptics vía wrappers de core, fire-and-forget + prime en idle.

### Variante elegida — Arcade jugoso

- Cabeza interpolada entre celdas (`progress 0..1`, como `Robot.progress`).
- Hit-stop 60 ms + popup `+10/+50` (cap 5 vivos) + blip con pitch cada 5
  comidas + haptic Medium en especial.
- Slow-mo ×0.7 a ≤2 celdas del peligro (solo `wrap=false`); muerte con freeze
  400 ms + shake + overlay diferido. `reduced motion` lo apaga.
- Pros: esconde el tick de 140 ms, más divertida. Contras: más animación solo
  UI-thread, E2E con waits 900–1000 ms tras muerte.

## 5. Criterios de aceptación

- [ ] `src/games/serpiente/` creado, registrado, sin importar de otros juegos.
- [ ] Reglas: crecimiento, reversa prohibida, wrap on/off, especial, velocidad
      progresiva, win por tablero lleno.
- [ ] Controles: teclado PC + swipe/flotante táctil; buffer último-gana.
- [ ] Layout 360×640 sin scroll; celda del tamaño real medido.
- [ ] Score más-es-mejor; récord vía `onGameEnd` → `recordsRepository`.
- [ ] Variante Arcade jugoso implementada.
- [ ] Seeds `test-win/test-lose/test-crecer` solo con `EXPO_PUBLIC_E2E=1`.
- [ ] Verificación estándar verde (§6).

## 6. Checklist de tareas (en orden)

- [ ] T1. `engine/` puro + unit tests (grid/rules/controls/seed, determinismo).
- [ ] T2. `state.ts` + `index.ts` + registro + `RULES.md` + `README.md`.
- [ ] T3. `SerpienteScreen` + HUD + overlays + settings (wrap/control/anillo).
- [ ] T4. Sonido/haptics + pausa + `onGameEnd`/récord.
- [ ] T5. `preview/` con la variante Arcade jugoso.
- [ ] T6. E2E web (win/lose/crecer + táctil CDP + responsive 360×640).
- [ ] T7. Verificación estándar: `pnpm typecheck` → `pnpm test` → `node scripts/e2e.mjs`.

## 7. Pendiente de confirmar

- Grid fijo 20×20 vs 18×24 vertical (aprovechar 360×640).
- Especial: ¿caduca a los 8 s o permanece hasta comerlo?

## Notas/hallazgos

_(vacío — documentar aquí desviaciones, aprendizajes y problemas a medida que
aparezcan; al cierre migrar según la tabla de `AGENTS.md`.)_
