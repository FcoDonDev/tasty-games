# PLAN — Wak Wak v2: Animaciones, Niveles y Combo

> Estado: **IMPLEMENTADO y verificado** (typecheck + 301 tests + E2E 39/39 +
> perf ≥ baseline). T22 no aplicó: A1 pasó sin jank. El commit de cierre
> elimina este PLAN (convención AGENTS.md).
> Revisión crítica v2: supuestos validados contra el Pac-Man Dossier, fuentes
> de game-feel (hit-stop/juice) y la skill `expo-animation` (§6).

## 1. Contexto

Wak Wak (MVP, ADR 0010) es el primer juego en tiempo real del proyecto: maze-chase
por ticks fijos con motor puro (`engine/`), store zustand interno y render
adaptador A (Views + Reanimated, cero `setState` por frame). El MVP dejó
diferido en `docs/ROADMAP.md` el bloque "Wak Wak v2" (niveles progresivos,
desmultiplicador de dificultad). Este requerimiento lo activa y le suma un
sistema de puntuación tipo **Pac-Man Championship Edition DX+** (referencia de
diseño solo mecánica: ver resguardo legal en §6).

Estado actual relevante:

- Eventos discretos: `GameEvent` = string union sin payload (`engine/rules.ts:115`),
  consumido por `state.ts` (retorna de `tick`) y `WakWakScreen.tsx` (sonido/haptics).
- Score fijo: batería ×10, súper ×50, drone ×200, chip ×100, vida ×100
  (`rules.ts:38-42`).
- Constantes globales de dificultad: `SPEEDS`, `POWER_MS`, `SCATTER_MS`,
  `CHASE_MS`, `RESPAWN_MS`, `releaseBase/releaseStagger` en `SeedConfig`.
- Render: `EntitiesLayer.tsx` — un `Animated.View` por entidad, shared values
  escritas por `present()` desde el loop rAF que vive en la pantalla.
- Seeds E2E sentinelas en `engine/seed.ts` (`test-win` / `test-lose` /
  `test-power`), gate `EXPO_PUBLIC_E2E=1` (ADR 0006).
- Récord: solo `app/juego/[id].tsx` escribe vía `onGameEnd`; convención
  más-es-mejor (ADR 0005).

## 2. Objetivo

1. **Animaciones**: vida a los personajes (idle/movimiento/estados) y a las
   acciones (comer batería, comer drone, ser atrapado, activar power) y al
   final de partida (victoria y derrota) — sin degradar el presupuesto de
   frame (cero `setState` por frame).
2. **Niveles**: dificultad progresiva en 8 niveles, con el nivel 1 MÁS fácil
   que el base actual del MVP (que pasa a ser ≈ nivel 3) y progresión de run
   continua con niveles desbloqueables.
3. **Combo (CE DX+)**: comer drones consecutivos dentro de un mismo power
   multiplica la puntuación (200 → 400 → 800 → 1600 → 3200, cap), con hit-stop
   paramétrico, popup de score e indicador animado. Más slow-mo near-death.

## 3. Decisiones de diseño (aprobadas con el usuario)

### D1 — Progresión de niveles: run continua + niveles desbloqueados

- **Elegido**: partida = run continua. Ganar nivel N → nivel N+1 conservando
  score y vidas (+1 vida al ganar nivel, cap 5). Se persiste `wakwak.maxLevel`
  en `preferencesRepository` (implementación dual ya existe: sqlite + localStorage,
  KV genérica — no hay migración de schema) y el jugador puede iniciar una
  corrida nueva desde cualquier nivel desbloqueado (selector). Récord = score
  total de la corrida (ADR 0005 intacto).
- La persistencia de partida EN CURSO (`gameStateRepository`, ADR 0008) queda
  **fuera de alcance** (diferida en ROADMAP como item v2 aparte).
- *Alternativas descartadas*: (a) solo dificultad elegible sin progresión — no
  da sensación de avance; (b) niveles totalmente independientes con score por
  nivel — fragmentaría los récords y complica la convención de score.

### D2 — Niveles: 8 definidos, nivel 1 más fácil que el MVP, knobs validados

- **Elegido**: `LEVELS[]` (8 niveles) en `engine/levels.ts`. Knobs por nivel
  (validados contra el Pac-Man Dossier, ver §6.N1 — el original escala por
  nivel: velocidades, duración del frightened, timers scatter/chase):
  - `speeds`: robot/droneChase/droneFrightened (drones 75%→85%→95% del robot
    en el original; nuestro nivel 1 usa drones ~10% más lentos que el MVP,
    nivel 8 más rápido que el MVP).
  - `powerMs`: duración del súper (el "frightened" del original ENCORTA por
    nivel: 6s → 1s → 0; nosotros bajamos gradual pero sin llegar a 0).
  - `scatterMs`/`chaseMs`: el original acorta scatter con el nivel (7s → 5s y
    ciclos posteriores casi solo chase); aplicamos la misma dirección.
  - `releaseBase`/`releaseStagger`: salida del corral más rápida por nivel.
  - `elroyThreshold` (D2.1, aprobado): el drone Cazador (personalidad 0)
    acelera ~5% cuando la fracción de baterías restantes < umbral, solo en
    modo chase/roaming y fuera de power. Mecanismo "Cruise Elroy" del
    original: evita que el final de nivel sea relajado.
- El laberinto es el MISMO para todos los niveles (en el original solo cambian
  layout en tableros intermedios; en CE DX cambia por mitades vía frutas —
  diferido; candear 8 laberintos propios + conectividad expande el alcance).
- Ganar el nivel 8 = fin de corrida con bonus de victoria.
- *Alternativa descartada*: niveles infinitos generados — imposible candear
  determinismo y balance.

### D3 — Combo fiel a CE DX+: duplicación con cap

- **Elegido**: dentro del mismo modo power, el drone N comido vale
  `droneChainPoints(chain) = min(200 × 2^(chain−1), 3200)` — función PURA en
  `rules.ts`, testeable. El combo se reinicia al expirar el power o al ser
  atrapado. Estado nuevo en `GameState`: `chain` (cadena actual) y `bestChain`
  (para stats del overlay final).
- Si 2+ drones se comen en el MISMO tick, cada uno emite SU evento con SU valor
  de cadena (el loop de colisión de `step()` emite un evento por drone, no uno
  agregado — hoy agrega `eatenThisTick` en un solo `droneEaten`).
- *Alternativas descartadas*: lineal +200 — poco incentivo al riesgo;
  multiplicador fijo cap 1000 — compromiso soso. Los récords previos quedan
  obsoletos ante el nuevo techo, aceptado.

### D4 — Hit-stop paramétrico (celebración del combo)

- **Elegido**: micro-pausa visual del loop rAF al comer drone, duración EN MS
  (no frames — regla de independencia de framerate, §6.N2) escalada por la
  cadena: `60ms + 25ms × (chain−1)`, cap 150ms. Única instancia activa (un
  hit-stop nuevo REINICIA el timer, no apila: lección §6.N2 — dos congelamientos
  solapados restauran el tiempo antes de tiempo). Nunca se inicia durante
  pausa. Alinea sound + haptic + popup al INICIO del hit-stop (sincronización
  de canales: vibración+sonido juntos, luego flash, luego popup — §6.N3).
- *Evidencia*: rango validado 30–120ms típico; "el hit-stop paramétrico
  distingue pesos, el constante aplana el combate" (lección de Smash, §6.N2).
- *Alternativa descartada*: hit-stop fijo de 100ms — no distingue cadena 1 de
  cadena 5, justo lo que el combo quiere comunicar.

### D5 — Slow-mo near-death

- **Elegido**: cuando un drone activo (roaming/exiting, fuera de power) está a
  <1.2 celdas y ACERCÁNDOSE, el dt que entrega el loop al engine escala ×0.5
  con rampa suave (~200ms de transición). Cálculo de distancia y del factor en
  `engine/feel.ts` (función pura testeable) aplicado en el screen — el engine
  recibe dt ya escalado, el determinismo no cambia (los tests pasan su propio
  dt).
- **Desviación aceptada vs CE DX+**: en el original el slow-mo NO detiene el
  timer del modo; acá el dt escalado también estira `elapsedMs` (power, fases y
  respawn duran más en tiempo real). Se acepta: beneficia al jugador casual y
  evita tocar el engine con un multiplicador por-subsistema.
- *Evidencia*: CE DX+ activa slow-mo automático cuando un fantasma se acerca
  (§6.N4); es la seña de identidad del juego.

### D6 — Arquitectura de animaciones: shared values + eventos discretos

- **Elegido** (revisado con skill `expo-animation`):
  - Pose (posición continua) sigue escrita por `present()` desde el loop rAF
    (arquitectura existente). Lo IDLE/cíclico (bobbing del robot, wobble de
    drones) NO se escribe por rAF: son loops de Reanimated en el UI thread
    (`withRepeat` + easing linear), compuestos en `useAnimatedStyle` con el
    translate (transform: translate PRIMERO, luego scale/rotate — el orden
    importa: el translate no debe heredarse escalado). Así siguen vivos aunque
    el JS thread tenga un stall.
  - Extensiones del snapshot (`powerFraction`) escritas por `present()`;
    el parpadeo de fin de power sale de esa fracción, no de timers JS.
  - Efectos one-shot (shake, hit-stop, popups) disparados por los eventos
    discretos del `tick` — nada de React re-renderizando por frame. API nueva
    `EntitiesHandle.onEvent()` para efectos one-shot sobre las entidades.
  - Shared values con `.get()`/`.set()` (nunca `.value` durante render); nada
    de `scheduleOnRN` por frame (el haptic del combo se emite desde el handler
    de eventos JS, que ya corre en el RN runtime — no cruza de worklet).
  - Entradas de popups: `scale(0.9) + opacity 0 → 1` (nunca `scale(0)`) con
    ease-out ~150ms; salida fade.
- *Alternativa descartada*: migrar a Skia (adaptador B de ADR 0010) — el
  presupuesto actual aguanta; se documenta como plan B si la verificación mide
  jank (T20).

### D7 — Popups graduados (no saturar)

- **Elegido**: popup de score flotante SOLO para eventos "grandes": drone
  (con los puntos del combo), chip dorado y súper batería. La batería normal
  NO genera popup (el original tampoco: score pop solo para fantasmas/frutas;
  comer decenas de baterías por partida saturaría React y el canal visual —
  regla de juice "máximo 3-5 feedbacks por segundo"). Feedback de batería:
  micro-pulso de la celda en `MazeLayer` (shared value, opcional y barato).
- Los popups no bloquean la vista del personaje (posición offset de la celda,
  lifecycle ~0.8s, fade out — §6.N3).

### D8 — Interstitial de nivel: auto-continúa

- **Elegido**: al ganar un nivel N<8, banner "NIVEL N+1" (~1.5s, entrada/salida
  ease-out), posiciones reseteadas, power/fases reiniciados, el juego arranca
  solo sin intervención (ritmo arcade). El EndOverlay solo aparece al fin de
  run (derrota o victoria del nivel 8).
- *Alternativa descartada*: overlay con botón "Continuar" — corta el ritmo de
  la run.

## 4. Criterios de aceptación

- **A1**: en web (360×640) y dev nativo, el juego mantiene fluidez — sesión de
  perf (`EXPO_PUBLIC_PERF_METRICS=1`) comparada baseline-vs-v2: sin nuevos
  stalls >25ms; FPS UI thread igual o mejor.
- **A2**: combo — comer 2 drones en un mismo power suma 200+400 y emite dos
  eventos con `chain: 1` y `chain: 2` (test con sentinel `test-combo`); el
  combo se reinicia al expirar el power y al ser atrapado (test unitario);
  `droneChainPoints` capada en 3200 (test).
- **A3**: niveles — nivel 1 con knobs más fáciles que el MVP; el nivel actual
  del MVP existe en la escala (≈3); ganar un nivel avanza con score/vidas
  conservadas y +1 vida (cap 5); interstitial "NIVEL N+1" visible y la
  simulación arranca sola; `wakwak.maxLevel` persiste tras ganar (web:
  localStorage); ganar el nivel 8 termina la run.
- **A4**: animaciones — popup visible al comer drone (con puntos crecientes por
  cadena)/chip/súper; batería sin popup; drones parpadean cuando el power
  expira en <2s; hit-stop observable y más largo con cadena mayor; bobbing/
  wobble desactivados con reduced motion (quedan opacity/color: blink, popups);
  victoria y derrota tienen secuencia antes del overlay.
- **A5**: E2E — specs nuevos de combo y progresión de nivel en verde + los
  specs previos de `wakwak.web.spec.ts` sin regresión (test-power sigue en
  290 pts: primer drone en power = 200); suite completa (typecheck → test →
  e2e) en verde.
- **A6**: legal (checklist §6 del README del juego): personajes animados siguen
  siendo robot aspiradora / drones rombo; sin boca en V, sin ojos
  perseguidores, sin sonidos del original; flash del hit-stop sobre el drone,
  NUNCA fullscreen estroboscópico (fotosensibilidad, §6.N3).
- **A7**: Elroy — el drone Cazador acelera solo por debajo del umbral de
  baterías del nivel, solo chase y fuera de power (test unitario con estado
  artesanal).

## 5. Checklist de tareas (orden de ejecución)

### Fase 1 — Eventos + animaciones base

- [x] T1. Refactor `GameEvent` a unión discriminada con payload
      (`{ type: 'droneEaten'; chain: number; points: number }`, etc.): toca
      `rules.ts`, `state.ts` (`tick`), `WakWakScreen.tsx` y tests existentes.
      La colisión de `step()` emite UN evento por drone comido (payload propio).
- [x] T2. Snapshot extendido: `powerFraction` (fracción restante del power);
      `EntitiesLayer` lo consume.
- [x] T3. Animación continua de entidades: bobbing del robot al moverse + pulso
      en power; hover wobble de drones — como loops `withRepeat` en el UI
      thread (worklet), compuestos con el translate de `present()` (translate
      primero en el array transform). Gate de reduced motion (`useReducedMotion`):
      transform loop off, opacity/color siguen. Parpadeo blanco de drones
      cuando `powerFraction` < umbral (~2s), sobre el drone (no fullscreen).
- [x] T4. API `EntitiesHandle.onEvent()` para efectos one-shot: shake del
      robot en `caught`, pop del drone comido (encoge a 0.6 con fade antes de
      `hidden`). Hit-stop del loop: duración paramétrica por cadena (D4),
      única instancia, guard de pausa.
- [x] T5. Popups de score flotantes (D7): solo drone/chip/súper/combo; spawn
      por evento en `WakWakScreen`; entrada scale 0.9→1 + fade, salida fade;
      no bloquean al personaje. Indicador de combo en el HUD (×N) con escala
      spring al crecer. Micro-pulso de celda en MazeLayer para baterías
      (opcional, solo si el presupuesto de frame aguanta).
- [x] T6. Secuencias de fin: victoria (pulso de despedida + delay del overlay
      ~1s) y derrota (shake + desaturación antes del overlay); EndOverlay con
      entrada escalada y stats (`bestChain`, nivel alcanzado).
- [x] T7. Sonidos/haptics: pitch del blip sube con la cadena; haptic impact
      (Medium) en cadena ≥2; sonidos y haptic en el MISMO instante que arranca
      el hit-stop (sincronía <20ms perceptual, §6.N3). Todo vía wrappers
      `core/ui/sound.ts` / `haptics.ts`.

### Fase 2 — Combo (motor puro) y slow-mo

- [x] T8. `GameState.chain`/`bestChain`: `droneChainPoints(chain)` función pura
      con cap 3200; reset al expirar power y en caught; eventos por drone.
- [x] T9. Hit-stop real del loop: flag en el screen que congela la acumulación
      de dt al recibir `droneEaten` (no toca el engine); reinicio si llega otro
      hit-stop activo; guard contra pausa.
- [x] T10. Slow-mo: `engine/feel.ts` — `slowMoFactor(distances, closing)`;
      el screen escala dt ×0.5 con rampa ~200ms cuando hay amenaza cercana.
- [x] T11. Tests unitarios: escala 200/400/800/1600/3200, resets, eventos por
      drone, factor de slow-mo (pure function), hit-stop paramétrico (duración
      por cadena, reinicio, guard de pausa).

### Fase 3 — Niveles

- [x] T12. `engine/levels.ts`: `LEVELS[]` (8) con knobs D2 (incl.
      `elroyThreshold`); `SeedConfig.level`; `createGameState` deriva
      velocidades y timers por nivel y los lleva en `GameState` (dejar de usar
      `SPEEDS`/`POWER_MS`/`SCATTER_MS`/`CHASE_MS` globales dentro de `step`).
- [x] T13. Elroy en `step()`: boost ~5% al Cazador bajo umbral, solo chase,
      fuera de power.
- [x] T14. `state.ts`: `startRun(level)`; avance de nivel al `won`
      (`nextLevel`) conservando score/vidas (+1, cap 5); power/fases/chain
      reiniciados por nivel; fin de run al ganar el nivel 8.
- [x] T15. Interstitial de nivel (D8): banner "NIVEL N+1" ~1.5s con entrada/
      salida ease-out, bloquea input, la simulación arranca sola al terminar.
- [x] T16. Selector de nivel inicial (al empezar/reintentar: desbloqueados
      jugables, bloqueados con candado + `accessibilityLabel` estable);
      persistencia `wakwak.maxLevel` vía `preferencesRepository`.
- [x] T17. HUD y EndOverlay muestran nivel actual / nivel alcanzado.
- [x] T18. Seeds E2E: sentinel nuevo `test-combo` (dos drones al alcance del
      power en línea recta); `test-win/test-lose/test-power` siguen pasando
      (configs compatibles con niveles; `test-power` fija nivel explícito).
- [x] T19. Tests unitarios: knobs por nivel, progresión de run, Elroy (A7),
      desbloqueo persistido (mock del repo según patrón existente).

### Fase 4 — Documentación y verificación

- [x] T20. Docs: actualizar `src/games/wakwak/README.md` (decisiones clave,
      checklist legal §6) y `RULES.md` (combo, niveles, Elroy, slow-mo);
      cerrar ítems v2 en `docs/ROADMAP.md`; GOTCHAS si aparece algo
      reproducible.
- [x] T21. Verificación estándar completa: `pnpm typecheck` → `pnpm test` →
      `node scripts/e2e.mjs` (specs nuevos + regresión 25/25) → inspección
      visual manual si los specs no cubren una animación (viewport 360×640,
      borrar screenshots después). Comparar sesión de perf baseline-vs-v2 (A1).
- [x] T22. Si A1 falla (jank): evaluar adaptador B (Skia) según ADR 0010 —
      decisión con el usuario antes de emprenderla.

## 6. Notas / hallazgos

- Resguardo legal: el combo/slow-mo/hit-stop/niveles son **mecánicas** (no
  protegidas, ver *Atari v. Philips* en README del juego); los sonidos/píxeles/
  textos serán propios (blips sintetizados, "SÚPER CARGA", robot/drones con
  siluetas ya diferenciadas).
- El `GameEvent` con payload afecta solo a wakwak (tipo interno del juego); no
  hay contrato de eventos en `core/`.
- Los récords previos de wakwak (score MVP) competirán contra runs con combo:
  aceptado como parte del feature (D3).
- **N1 (Pac-Man Dossier, gamedeveloper.com / pacman.holenet.info)** — la
  progresión del original escala POR NIVEL: velocidades (Pac-Man 80%→100% en
  L5; fantasmas 75%→85%→95%), duración del frightened (6s→4s→…→0 en L21),
  timers scatter/chase por nivel (scatter 7s→5s), y "Cruise Elroy" (Blinky
  acelera bajo umbral de dots restantes). Validó D2 (knobs) y D2.1 (Elroy).
  No copiamos tablas: dirección y espíritu, números propios.
- **N2 (hit-stop, socratopia / uhiyama-lab / kindatechnical)** — duración en
  MS, no frames (independencia de framerate); rango típico 30–150ms (light
  30-50, heavy 60-100, crit 100-150); baseline ~80ms y tunear ±20-40ms;
  paramétrico por impacto (lección de Smash: constante = plano); ÚNICA
  instancia activa (dos solapados restauran el tiempo antes de tiempo — bug
  clásico); nunca arrancar durante pausa ni restaurar el tiempo sin revisar
  pausa.
- **N3 (juice/multimodal, eastondev / Meta haptics)** — capas ordenadas:
  vibración+sonido simultáneos → flash (20ms después) → floating text (~100ms
  después); sonido dentro de ~12-20ms o se siente desincronizado; máximo 3-5
  feedbacks/segundo; flash sobre el objetivo, nunca fullscreen estroboscópico
  (fotosensibilidad); popups que no bloqueen al personaje.
- **N4 (CE DX+, kokutech/gamefaqs/wikipedia)** — slow-mo automático con
  fantasma cerca (el timer NO se detiene en el original; nuestra desviación
  está en D5); hit-stop al comer fantasma con score pop que "se detiene a
  celebrar"; parpadeo de fin de frightened (clásico) valida T3; cadena de
  fantasmas: máximo 30 y puntúa 200→3200 (valida D3).
- **Skill `expo-animation`** — reglas incorporadas a D6/T3/T5: transform+
  opacity gratis (todo lo demás = layout pass); translate primero en el array
  transform; nunca `scale(0)` (usar 0.9 + opacity); ease-out para entradas;
  animaciones idles como loops del UI thread (`withRepeat`), no escritas por
  rAF; `.get()`/`.set()` y nunca shared values en render; reduced motion =
  "menos y más suave" (drop transform, mantener opacity/color); haptics: uno
  por acción, mismo frame que el visual, nunca el único feedback.
- **N5 (hallazgo de implementación)** — el bonus ×100/vida estaba sumándose en
  CADA nivel ganado; corregido: solo al cerrar la run (nivel ≥ MAX_LEVEL),
  como decía D1. Los sentinelas E2E quedaron fijados a nivel 3 (MVP) para
  candar sus scores; `test-win` subió a nivel 8 para cerrar la run y conservar
  la cobertura de récord.
- **N6 (hallazgo de implementación)** — `test-combo` debió quitar TODAS las
  baterías de la fila 15: el robot que persigue la cadena se come baterías del
  camino y el score esperado deja de ser exacto (650 = 50 + 200 + 400).
- **N7 (perf, A1)** — medición con `EXPO_PUBLIC_PERF_METRICS=1` (15s de juego
  real, teclado): v2 = 877 frames UI (≈58 fps), 2 dropped, 21 stalls (avg
  44.6ms, p95 83.4ms). Baseline pre-v2 (worktree temporal en b3cad19): 515
  frames, 15 dropped, 36 stalls (avg 347.9ms, p95 1550ms). v2 ≥ baseline en
  todos los ejes. Caveat: corridas con dev servers paralelos; los stalls
  incluyen la primera carga (compilación dev) — números para comparación
  relativa, no absolutos.
- **N8 (gotcha migrado a `docs/GOTCHAS.md`)** — `:4173` compartido entre
  worktrees en paralelo: síntomas de bundle mezclado (motor nuevo + UI vieja
  en el mismo snapshot) y ERR_CONNECTION_REFUSED masivo a mitad de suite.
  Solución: `E2E_PORT=4183 node scripts/e2e.mjs`.
- **T22 no aplicó**: A1 pasó sin jank (números en N7).
- (Se completará durante la implementación.)

## 7. Cierre

1. Migrar hallazgos: lecciones técnicas → `docs/GOTCHAS.md`; decisiones de
   diseño transversales → ADR (candidato: "wakwak game-feel" si amerita);
   detalles del juego → README del juego; deuda → ROADMAP.
2. Actualizar docs afectados (README wakwak, RULES.md, ROADMAP, ARCHITECTURE si
   toca core).
3. **Eliminar este PLAN** en el commit final de cierre.
