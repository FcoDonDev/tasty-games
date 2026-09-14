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
- [ ] Presupuesto §9.1 verde en instrumentado y throttle ×4 (baseline
      versionado en `baselines/` + MANIFEST).
- [ ] `renderFreq:segmentos` confirma: un tick sin comer re-renderiza solo
      cabeza/cola (+ overlays); la decisión del taper se toma con ese dato.

## 6. Checklist de tareas (en orden)

- [x] T1. `engine/` puro + unit tests (grid/rules/controls/seed, determinismo) + presupuesto §9.3 (cuerpo en `Set` O(1), spawn acotado + test, tope 8/frame).
- [x] T2. `state.ts` + `index.ts` + registro + `RULES.md` + `README.md` + tick publica solo si `state` cambió + tickStats D-WW0 desde el día 1.
- [x] T3. `SerpienteScreen` + HUD + overlays + settings (wrap/control/anillo) + renderer memo §9.2 (grid estático, segmentos memo, HUD por slices, wave en UI-thread, reduced-motion).
- [x] T4. Sonido/haptics + pausa + `onGameEnd`/récord + audio fire-and-forget con prime en idle + haptics solo especial/muerte (§9.5).
- [x] T5. `preview/` (elección hecha: V2) → converger tema final al `renderer/` real; la galería queda viva para futuros ajustes.
- [x] T6. E2E web (win/lose/crecer + táctil CDP + responsive 360×640 + `serpiente` en GAMES) + escenarios perf `serpiente-*` + waits 900–1000 ms tras muerte.
- [x] T7. Verificación estándar: `pnpm typecheck` → `pnpm test` → `node scripts/e2e.mjs` + baseline perf versionado en `baselines/` (§9.4).

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

## 9. Performance: presupuesto y prácticas (WakWak → requisitos)

No implementar un juego "mal optimizado": lo aprendido en PLAN-PERFORMANCE
Fase 2 + ADR 0011 + `docs/GOTCHAS.md` § Performance entra como requisito
desde el día 1, no como retrofit. Regla madre: **medir antes de optimizar**
(`src/core/perf/`, gate `EXPO_PUBLIC_PERF_METRICS=1`, default OFF = cero
overhead: early-returns y el `PerfProfiler` ni siquiera monta).

### 9.1 Presupuesto (360×640 dev web; validar también en throttle CPU ×4)

- Engine `advance`: p95 ≤ 0,5 ms (referencia WakWak: `loop.*` ~0,1 ms).
- `render.board` (Profiler, build profiling): p50 ≤ 3 ms en
  `serpiente-active`; ningún cambio de renderer regresa >20% sin dato que lo
  justifique.
- `renderFreq:segmentos`: un tick sin comer re-renderiza solo cabeza/cola
  (+ overlays), nunca el cuerpo entero.
- Publicación: `set()` solo si `state` cambió (patrón `tick` de
  `wakwak/engine/state.ts`, `tickPublished/tickCalls`) — nunca `set()`
  incondicional por tick.
- Throttle ×4 (D-WW2, CDP `Emulation.setCPUThrottlingRate`): sin hitches
  nuevos vs baseline; CPU profile (B1 `Profiler`) en la primera corrida de
  cada escenario.

### 9.2 Render (patrón `MazeLayer` / `EdibleDot`, I-WW-1)

- Fondo/grid en capa estática `memo` + `useMemo` (como `MazeStaticLayer` +
  `mergeWalls` en `src/games/wakwak/renderer/reanimated/MazeLayer.tsx`);
  serpiente y overlays en capas separadas con `PerfProfiler id="board"`.
- Segmento = componente `memo` con props primitivas (`x/y/size/color`,
  nunca objetos ni estilos inline) y callbacks estables: los cierres inline
  (`onX={() => fn(id)}`) y los objetos por render rompen el memo (GOTCHAS).
- Trampa del taper (D13): si el grosor depende del índice, cada tick mueve
  los índices y re-renderiza TODO el cuerpo. Decidir con
  `renderFreq:segmentos`: (a) grosor uniforme + cabeza/cola destacados =
  2–3 nodos/tick (recomendado); (b) taper solo si la medición lo avala a
  14 Hz.
- `slither` en UI-thread (shared `phase`, como `preview/fx.tsx`): cero
  re-renders JS por la ondulación. Sin `entering`/layout animations ligadas
  al movimiento (re-disparan en cada montaje — GOTCHAS, patrón `dealing` de
  solitario); shared values inicializados al estado actual + skip del primer
  effect (sin animaciones fantasma al montar con seed).
- Glow (`shadow*`) solo focalizado (cabeza/comida/especial): V2 ya es cero
  glow — no reintroducirlo por segmento (costo GPU en nativo). Popups vivos
  con cap 5 (§4).
- HUD suscrito a slices (`score`, `specialSecs`), no al `game` completo;
  `fontVariant: ['tabular-nums']` (array, no string — GOTCHAS).

### 9.3 Engine/store (T1–T2)

- `advance` O(1) amortizado por tick: cuerpo en `Set` para colisión O(1);
  spawn de comida por muestreo aleatorio con reintentos acotados y full scan
  solo como fallback con tablero casi lleno (+ unit test que acota el peor
  caso, no asserts de tiempo en Jest).
- `remainderMs` con tope 8/frame (D8, anti-espiral de la muerte); RNG
  `mulberry32` propio (determinismo para tests y seeds E2E).
- Tick-stats D-WW0 desde el día 1 (`tickCalls/tickPublished/advanceSamples`,
  buffer acotado, apagado por defecto): el engine no importa perf — la
  pantalla los vuelca con `drainTickStats` al desmontar.

### 9.4 Instrumentación y escenarios (T6–T7)

- `PerfProfiler id="board"` + `renderFreq:board/segmentos` + timers
  `loop.tick/worldSnapshot/present` desde el primer renderer (D-WW0, no
  retrofit). Frecuencia en instrumentado, duración en profiling: no mezclar.
- Escenarios nuevos en `src/core/__e2e__/performance.web.spec.ts`:
  `serpiente-active` (partida media), `serpiente-long` (~100 segmentos, peor
  caso de render), `serpiente-paused`; reutilizando seeds E2E de D12.
- Flujo probado: baseline → fix → re-medición con el mismo protocolo;
  versionar en `baselines/` + MANIFEST (patrón V-WW); comparar solo mismo
  perfil. Export con `--clear` (la cache de Metro ignora `EXPO_PUBLIC_*`).

### 9.5 Audio/haptics (T4)

- Fire-and-forget + prime en idle post-`ready` (`setTimeout(0)` tras el
  primer render): el primer uso no paga la creación; sin `.then` encadenado
  al `seekTo/play` — el round-trip nativo era el desfase real, no el coste
  JS que mide `handlerToPlay` (GOTCHAS).
- Haptics (wrapper de core) solo en confirmaciones: especial y muerte.
  Comer = solo blip con pitch (no vibrar hasta 14 veces/s). Sonido/haptics
  sensibles a latencia: dispararlos LO PRIMERO del handler (GOTCHAS:
  `scheduleOnRN` encola tras el trabajo JS pendiente).

## Notas/hallazgos

- T3 (2026-09-13): taper por rol (cabeza 1.12 / cuerpo 1.0 / cola 0.72) en vez
  de taper por índice: un taper indexado re-renderizaría TODO el cuerpo por
  tick (los índices corren); así solo cabeza/cola/rol-cambiado (ver
  `components/Board.tsx`). La decisión final del taper espera el dato de
  `renderFreq:segmentos` en T7 (criterio §5).
- T3: `setWrap` se aplica en vivo a la run en curso (mejor UX que "próxima
  partida"; sin riesgo: `wrap` solo se lee en `stepIndex`).
- T3: segmentos con key por CELDA (`seg-<cell>`) para identidad estable;
  onda `slither` con fase por celda (no por índice) para no saltar por tick.
- T3: mock `__mocks__/react-native-reanimated.js` extendido
  (`useReducedMotion`→false, builders `FadeIn/Up/Out`, `withSequence`→último,
  `useSharedValue` estable). Ojo: mi glob inicial (`*.ts*`) no mostró los
  `.js` preexistentes y casi duplico el mock — usar `ls __mocks__/` directo.
  Migrar a `docs/GOTCHAS.md` al cierre.
- T3: `onGameEnd`/récord + sonido/haptics quedan en T4 con `TODO(T4)` y
  `endedRef` ya puesto en la pantalla.
- T4 (2026-09-13): `engine/feel.ts` puro (popup/hit-stop/pitch por evento) +
  sonido LO PRIMERO del handler; hito cada 5 comidas con `soundCombo(chain)`
  (pitch creciente sobre el player de pickup); especial = `soundPowerUp` +
  `hapticCombo` (Medium, mismo instante que el hit-stop); muerte =
  `soundExplosion` + `hapticHeavy` NUEVO en core (Medium existente no
  distingue; Success es semántica de victoria); `primeAudioPlayers()` en idle
  post-primer render; auto-pausa en `visibilitychange`/background; récord una
  sola vez vía `recordEnd` + `endedRef`.
- T5 (2026-09-13): paleta V2 idéntica en preview y renderer (verificada por
  grep); enlaces cruzados en ambos archivos; galería viva confirmada.
- T6 (2026-09-13) BUG CRÍTICO: `advance` descartaba `remainderMs` sin pasos →
  frames de 16 ms contra pasos de 140 ms jamás avanzaban (parálisis total;
  en Jest pasaba porque los tests daban 140 ms de una). Fix: el acumulador
  vive en `store.tick` (se publica solo si el juego cambia) + tests de
  regresión (acumulación 9×16 ms, descarte al pausar). Lección: unit con dt
  realista de frame, no solo pasos exactos.
- T6: `tablero-serpiente` duplicado (pantalla + Board) → strict violation;
  queda solo en Board. `serpiente-cabeza` era wrapper sin tamaño (hidden) →
  `flex:1`.
- T6: el efecto de prefs pisaba el `wrap=false` del sentinela (raw null →
  `setWrap(true)` en vivo). Con seed, el sentinela manda (gate en pantalla).
- T6: lectura del head en E2E ATÓMICA en un solo evaluate sobre el tablero:
  resolver el locator y leer en dos pasos pierde la carrera contra los ticks
  (nodo reemplazado = ancestros perdidos, `closest` → null). Migrar a
  `docs/GOTCHAS.md` al cierre.
- T6: asserts de dirección con latencia CDP: esperar el giro + dirección
  sostenida, no el primer movimiento (llega el paso previo al giro).
- T6: reintentar conserva el seed (vuelve a 3990 y regana): se candea el
  reinicio, no el score 0.
- Revisión crítica post-T7 (2026-09-14, corregida en `feat/serpiente`):
  - **B1** hooks condicional en JSX (`wrap` leído dentro del ternario
    `isTouch`) → slice a nivel de componente.
  - **B2** flash de muerte usaba la cabeza (que no se movió al morir) → el
    evento `die` ahora lleva payload `{ cause: 'wall'|'self', cell|null }`
    (patrón `caught` de WakWak); flash en la celda del cuerpo golpeado, y en
    la cabeza si es muro (la causa queda fuera del tablero).
  - **B3** ajustes inaccesibles en PC web (gate táctil sobre el setting D1) →
    modal en todas las plataformas; opciones de control solo en táctil
    (prop `touch`); RULES.md actualizado; E2E de escritorio nuevo.
  - **D-a** popup alineado al `score-float` aprobado (deriva en loop,
    `FloatingPopup`); reduced motion: fade sin deriva.
  - **D2 resuelto (2026-09-14)**: tie-break de diagonal homologado con WakWak
    (`|dx| > |dy|`, empate → vertical); tests actualizados.
  - **D3 resuelto (2026-09-14)**: abrir ajustes pausa la partida y (si la
    pausa la puso el modal) se reanuda sola al cerrar; PauseOverlay oculto
    mientras el modal está abierto (conflicto zIndex 60); E2E candea
    congelamiento + reanudación.
  - **D4 + P2 resueltos (2026-09-14)**: D4 segmentos por `testID` (a11y solo
    cabeza/comida/especial/tablero; RNW → `data-testid`, E2E lee data-testid);
    M1 prime selectivo (`['pickup','powerUp','explosion','gameWin']` —
    `soundCombo` reutiliza pickup, no hay id 'combo'); M2 timers de popups
    cancelados al desmontar (ref array); M3 texto del ring a `ring - 16`
    (dentro del contenedor — el clip real era en la última fila); M4 damero
    con solo 200 Views tintadas (las 200 transparentes fuera).
  - Quedan para el cierre (no código correctivo): M5 sync/etiqueta preview
    V2, M6 remainder híbrido → ROADMAP, M7 validación nativa → ROADMAP.

## 10. Polish ronda 2 (2026-09-14, aprobado por el usuario)

Motivación: cierre de pendientes del review + nueva decisión de fluidez
(movimiento interpolado, al estilo WakWak). Todos los alcances aprobados
explícitamente: ring solo arco, glow comida+especial, interpolación F2
(cabeza+cola), remainderMs opción B (aplicado junto a la interpolación —
el acumulador pasa a ser la única fuente de verdad del progreso).

### Decisiones

- **D18 · Ring consumiéndose**: fuera el texto "7s"; el anillo se depleta
  como arco de progreso (fracción = `ttlMs / SPECIAL_TTL_MS`) con receta
  de dos mitades + rotación (Views, sin SVG/Skia — ADR 0001). Granularidad
  del publish (~140 ms) → salto ~2.8°/publish, invisible. Helper puro
  `arcAngles(ttlMs)` para unit tests. `accessibilityLabel` anuncia los
  segundos (el texto visible muere, el anuncio a11y queda). Reduced motion:
  mismo arco (es estático por publish, sin loop). Converger la pieza en
  `preview/fx.tsx` + caption de la galería.
- **D19 · Cuerpo continuo + glow (acerca el render real a V2)**: segmento
  PUNTO MEDIO por par contiguo (posición promedio, tamaño promedio de
  vecinos ×0.98, amp 0.12·cell — igual que `SlitherBody` de la preview;
  taper por rol §9.2 se mantiene). Glow focalizado: `FoodDot` ámbar +
  punto del especial violeta (shadowRadius 8). Sin glow en cuerpo/cabeza
  (V2). Mids con `testID` (D4: fuera de a11y), identidad estable por par
  de celdas → memo: solo cabeza/cola generan/eliminan mids por tick.
- **D20 · Movimiento interpolado F2 (cabeza + cola)**: engine intacto
  (saltos discretos D8); el renderer desliza en UI-thread con Reanimated.
  Cabeza: `lerp(celda → stepIndex(cabeza, dir), progreso)` — al publicar
  el paso, la celda destino pasa a ser la lógica: continuidad sin saltos.
  Cola: `lerp(cola → snake[n-2], progreso)`; si la serpiente creció (comió)
  la cola no se retrae (delta de longitud en el renderer). Progreso:
  `getStepProgress()` = `tickAccumMs / stepMs(eaten)` escrito en un
  SharedValue desde el loop rAF existente (cero re-renders JS extra);
  congelado en pausa / hit-stop / muerte; reduced motion → saltos como
  hoy. testIDs/labels anclados a la celda LÓGICA (E2E `readHeadCell`
  intacto).
- **D21 · remainderMs opción B**: `advance` devuelve
  `{ state, events, leftoverMs }`; fuera el campo `remainderMs` del
  GameState; `store.tick` guarda `leftoverMs` en `tickAccumMs`. Engine
  autocontenido (portable), GameState sin campo "a medias", y el
  acumulador alimenta D20.
- **Validación nativa**: sin cambios — sigue documentada en
  ROADMAP/README como hasta ahora (deuda conocida, no trabajo de este
  lote).

### Checklist

- [x] D21: `advance` → `leftoverMs`, store/GameState/tests ajustados.
  **Hallazgo**: el híbrido previo contaba el sobrante DOS veces tras cada
  publish (`advance` sumaba `state.remainderMs + tickAccumMs`, y el store ya
  tenía el sobrante en `tickAccumMs`) → la serpiente corría levemente más
  rápido que el D2 nominal (error ~leftover/paso, hasta ~10-20%). La opción
  B lo arregla; test de cadencia nominal exacta (10×150 ms → 10 pasos de
  140) como regresión.
- [x] D18: `arcAngles` puro + `SpecialRing` arco (Board) + preview + tests.
- [x] D19: mids + glow en Board, convergencia preview, tests.
- [x] D20: interpolación cabeza+cola con `getStepProgress` + congelados.
  **Notas**: la cola estática del paso que come es PREDECIBLE sin estado
  extra (target === comida/especial → cola y su mid no se deslizan); el
  delta de slide se normaliza a ±1 celda al cruzar el borde (wrap) para no
  recorrer el tablero. Upstream de cada celda del cuerpo es estable por
  identidad → memo: solo cabeza/cuello/cola re-renderizan por tick (igual
  que antes de la interpolación). Reduced motion nunca escribe el progreso.
- [ ] Verificación estándar: typecheck → test → e2e serpiente/responsive →
  perf render path (`EXPO_PUBLIC_PERF_METRICS=1`, presupuesto §9, seed
  `perf-long` con mids + interpolación). Punto de riesgo a medir:
  duplicación de Views del cuerpo (~800 en victoria).
- [ ] Docs de cierre: README/RULES del juego (sección render), caption de
  preview, hallazgos → GOTCHAS/ROADMAP, PLAN eliminado en el commit final.
