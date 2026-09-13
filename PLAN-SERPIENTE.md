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
| D5 | Grid MVP | **20×20 fijo**, celda = `min(w/20, h/20)` medido con `useContainerSize` (D4) | 18×24 vertical (descartado 2026-09-13) |
| D6 | Score (más-es-mejor) | Normal `+10`, especial `+50`, bonus supervivencia `+1/s` al cerrar | Solo longitud / solo puntos |
| D7 | Especial | Cada 5 comidas, **caduca a los 8 s** en celda libre alejada (confirmado 2026-09-13) | Permanente hasta comerlo |
| D8 | Motor | **Núcleo puro** `advance(state, dtMs)` ticks fijos + `remainderMs` (tope 8/frame), `mulberry32` propio duplicado (regla de aislamiento entre juegos) | Extraer RNG a core (deuda conocida, no ahora) |
| D9 | Input | Buffer máx 2, último-gana; **reversa 180° prohibida** (difiere de WakWak, donde la reversa es inmediata); teclado flechas+WASD en PC web, swipe + flotante re-centrado en táctil | D-pad visible (eliminado en WakWak: roba tablero) |
| D10 | Render | Re-render React por tick (cadencia baja, sin shared values por frame); grilla memoizada patrón `MazeLayer` | Adaptador Reanimated por frame (innecesario a esta cadencia) |
| D11 | Fin | `status: 'playing'|'won'|'lost'`; `won` = tablero lleno; `onGameEnd` una sola vez (`endedRef`), solo `app/juego/[id].tsx` escribe récords | — |
| D12 | Seeds E2E | `test-win`, `test-lose`, `test-crecer`, solo con `EXPO_PUBLIC_E2E=1` | — |
| D13 | Cuerpo | **Continuo orgánico** con ondulación leve (solapado + taper), ojos direccionales (2026-09-13) | Segmentos cuadrados / cápsulas sueltas |
| D14 | HUD | **Flotante + chip** B2: score grande + chip countdown especial | Barra chunky / fila colección |
| D15 | Slow-mo | **Quitado** del snake (2026-09-13) | Slow-mo ×0.7 en peligro |
| D16 | Especial/muerte | **Countdown ring en celda** + **flash en celda causa** | Chip texto / muerte sin causa |
| D17 | Tema final + motion | **V2 Escamas arcade**; tokens `slither`/`food-pulse`/`score-float`; preview viva (2026-09-13) | V1 neón / V3 tinta (alternativas visibles) |

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

- Cuerpo continuo orgánico (D13): segmentos solapados con taper
  (cabeza ancha → cola fina) + ondulación lateral viajera (~12% celda);
  cabeza interpolada entre celdas (`progress 0..1`, como `Robot.progress`).
- Comer normal: squash + popup `+10/+50` flotante (cap 5 vivos) + blip con
  pitch cada 5 comidas. Sin hit-stop al comer (pelearía con el input).
- Especial: hit-stop 60–80 ms + haptic Medium al comer; countdown ring en la
  celda (D16). Sin slow-mo (D15, quitado a petición).
- Peligro (solo `wrap=false`): vignette estática a ≤2 celdas; muerte con
  freeze 400 ms + shake + flash en la celda causa + overlay diferido +
  retry <1 s. `reduced motion` apaga todo salvo fades.
- Tema aprobado: **V2 Escamas arcade** (cuerpo verde + escamas, cero glow,
  fondo `#0B1F14`); V1/V3 quedan como alternativas en la preview. Tokens de
  motion: `slither` (ondulación viajera, 1800 ms), `food-pulse` (pulso
  1→1.18, 800 ms yoyó), `score-float` (popup a la deriva −35% celda,
  750 ms yoyó).
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
- [ ] La ruta dev `/serpiente-preview` sigue viva junto al juego real para
      futuros ajustes (herramienta permanente, no desechable).

## 6. Checklist de tareas (en orden)

- [ ] T1. `engine/` puro + unit tests (grid/rules/controls/seed, determinismo).
- [ ] T2. `state.ts` + `index.ts` + registro + `RULES.md` + `README.md`.
- [ ] T3. `SerpienteScreen` + HUD + overlays + settings (wrap/control/anillo).
- [ ] T4. Sonido/haptics + pausa + `onGameEnd`/récord.
- [ ] T5. `preview/` (elección hecha: V2) → converger tema final al `renderer/` real; la galería queda viva para futuros ajustes.
- [ ] T6. E2E web (win/lose/crecer + táctil CDP + responsive 360×640).
- [ ] T7. Verificación estándar: `pnpm typecheck` → `pnpm test` → `node scripts/e2e.mjs`.

## 7. Resuelto 2026-09-13

- Grid: 20×20 fijo.
- Especial: caduca a los 8 s.

## 8. Proceso iterativo de UIs (tema × HUD + movimiento)

Ruta dev `/serpiente-preview` (patrón ADR 0012, sin navegación de
producción), estado falso en `preview/mock.ts`.

### Iteración 1 (implementada `e5e4442` — insuficiente, 2026-09-13)

3 takes estáticos que mezclan tema+HUD en un solo bloque y reducen el feel
a un popup fijo. Crítica: no hay sistema de movimiento (la cabeza salta de
celda en celda cada 140 ms — el problema nº1 de feel); los ejes no se pueden
comparar por separado; V2 con `shadow*` en ~400 celdas es costo GPU serio en
nativo; V3 coherente pero sin personalidad; ojos poco legibles a celda ~15px.

### Iteración 2 (propuesta — pendiente de aprobación del usuario)

Ejes ortogonales y combinables (ojos direccionales + popup `+10` van en los
3: aceptados):

- **A. Cuerpo**: A1 bloques pixel con borde (barato, skill `pixel-art`
  cost:low) · A2 neón glow (coste moderado, `retro-futurism`
  accessibility risk:high) · A3 cápsulas colección (barato, coherente,
  menos personalidad).
- **B. HUD** (compacto arriba: el tablero 20×20 ocupa ~340px de 640):
  B1 barra chunky mono · B2 flotante neón + chip · B3 fila estilo `Hud` +
  chip violeta.
- **C. Movimiento** (nuevo: juice por tiers, runtime en UI-thread vía
  Reanimated; `reduced motion` = solo fades):
  - Locomoción: cabeza interpolada `progress 0..1` + cuerpo con easing.
  - Comer normal: squash + popup `+10` flotante + blip con pitch + punch
    sutil. Sin hit-stop ni shake (el freeze pelea con el input; el shake se
    lee como daño).
  - Especial: spawn con anillo + countdown ring en la celda; al comer,
    hit-stop 60–80 ms + shake leve + haptic Medium + popup `+50`.
  - Peligro: vignette + slow-mo ×0.7 a ≤2 celdas (solo `wrap=false`).
  - Muerte: freeze 400 ms + shake + flash en la celda causa (toda muerte es
    culpa del jugador: hay que mostrar la causa) + overlay diferido +
    retry <1 s, sin fricción.
- Tiers: normal = sutil, especial = medio, muerte = pesado; nunca sumar
  efectos (strongest-wins); sincronía exacta de imagen+sonido+haptic.

### Aprobado iteración 2 (2026-09-13, respuestas del usuario)

- A: cuerpo **continuo** con movimiento corporal leve aunque cueste más (no
  cuadrados ni cápsulas sueltas); ojos direccionales + popup `+10` intactos.
- B: HUD **B2 flotante + chip**.
- C: **todo menos slow-mo** (quitado del snake); muerte con freeze + shake.
- Especial: **ring en celda**; muerte: **flash en celda causa**.
- Previews V1–V3 re-enfocadas: mismo cuerpo continuo + HUD B2 en las 3;
  varían tema/textura de piel + acentos. Llevan animación ambiental en loop
  (ondulación,   pulso de comida, popup flotante) para ver movimiento sin
  engine aún. Elegir tema → converger → implementar en `renderer/` real.

Fuentes iteración 2: skill ui-ux-pro-max (pixel-art cost:low,
retro-futurism cost:moderate/risk:high, Reanimated UI-thread, haptics en
confirmaciones); theoriginalsnake (progreso visible = la serpiente, retry
sin fricción); `Juice.cs` de CoilGarden (punch al comer, shake solo al
morir, sin hitstop al comer); Solana Garden/Falcon (sincronía, graduar por
tier, no over-juice); Snakonda (controles responsivos = table stakes).

### Aprobado final (2026-09-13, confirmado por el usuario)

- Ojos direccionales (iris blanco + pupila negra), popup `+10` con
  `score-float`, cuerpo continuo, HUD B2, `slither` + `food-pulse`.
- Tema: **V2 Escamas arcade**. V1/V3 quedan como alternativas visibles.
- La preview **no se desecha**: queda disponible junto a la implementación
  real para futuros ajustes (ruta dev, patrón ADR 0012, sin navegación de
  producción). Matiz a ADR 0012: en serpiente la galería es herramienta viva,
  no comparación histórica desechable.

## Notas/hallazgos

_(vacío — documentar aquí desviaciones, aprendizajes y problemas a medida que
aparezcan; al cierre migrar según la tabla de `AGENTS.md`.)_
