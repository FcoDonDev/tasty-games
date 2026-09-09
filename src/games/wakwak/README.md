# Wak Wak

Maze-chase en tiempo real: el robot aspiradora recoge baterías en un laberinto
mientras esquivan 4 drones antivirus. Primer juego en tiempo real del proyecto;
núcleo lógico agnóstico al motor ([ADR 0010](../../../docs/adr/0010-wakwak-motor-agnostico.md)).

## Origen y resguardo legal

El juego se inspira en la mecánica del clásico maze-chase de 1980. La
investigación legal (ver `PLAN-WAK-WAK.md` §2, caso *Atari v. Philips / K.C.
Munchkin*, 1982) concluyó que el copyright del original protege la **expresión**
(personajes, sonidos, look & feel, nombre) pero **no las mecánicas** (laberinto,
puntos, power-ups, túnel, IA con personalidades, vidas). Checklist de expresión
original aplicado — verificar al tocar cualquier asset visual/sonoro:

- [ ] Protagonista: robot aspiradora (cuadrado redondeado con franja que
      apunta a su dirección + luz de antena), NO círculo amarillo con boca en V.
- [ ] Enemigos: 4 drones rombo con LED de patrón geométrico por personalidad
      (barra/anillo/cuadrado/línea) y accesorio propio sobre el vértice
      (spike/platillo/hélice/domo), NO campanas con ojos que siguen la
      dirección de movimiento. Colores por personalidad
      (naranja/violeta/celeste/rosa), no el cuarteto rojo/rosa/celeste/naranja
      del original.
- [ ] Comida: baterías cuadradas doradas y súper batería; chip dorado como bonus.
      Paleta neón sobre fondo oscuro `#0B1220` (no azul/rosa).
- [ ] Audio: blips/golpes sintetizados propios; sin waka-waka, sirena ni jingle.
- [ ] Nombre y descripción sin referencia a la marca del original.
- [ ] Laberinto: layout propio 19×21 (`engine/maze.ts`), validado por tests
      (conectividad, sin callejones, todo alcanzable, **sin áreas abiertas
      3×3** — solo pasillos, regla del usuario).

## Estructura

```
src/games/wakwak/
  index.ts                # GameDefinition registrado en src/core/game-registry.ts
  WakWakScreen.tsx        # orquestador: loop rAF, input por plataforma, HUD, modales, récord
  components/             # HUD, ControlSettings, Overlays, LevelInterstitial, LevelPicker
  engine/                 # NÚCLEO PURO: TS sin RN, determinista, testeado con Jest
    maze.ts               #   laberinto 19×21 propio + vecinos (túnel/corral/puerta)
    levels.ts             #   8 niveles: knobs de dificultad (v2)
    rules.ts              #   advance(state, dtMs) por ticks fijos: movimiento,
                          #   colisiones, combo, power, chip, win/lose, worldSnapshot()
    feel.ts               #   hit-stop y slow-mo: puro, lo aplica el loop (v2)
    ai.ts                 #   4 personalidades: Cazador/Emboscador/Caprichoso/Tímido
    seed.ts               #   mulberry32 + seeds sentinelas E2E (v2: por nivel)
    state.ts              #   store zustand: startRun/advanceLevel (run continua, v2)
    controls.ts           #   PURO: gesto → Direction (swipe + flotante re-centrado)
  renderer/
    types.ts              # PUERTO de presentación (createWorld/present/onDirection)
    reanimated/           # ADAPTADOR A (ADR 0010): MazeLayer + EntitiesLayer
  __tests__/              # ~100 tests del núcleo (sin RN)
  __e2e__/                # Playwright web (test-win/test-lose/test-power/test-combo/test-level)
```

## Decisiones clave

- **Núcleo/rendrización desacopladas (ADR 0010):** `engine/` no importa nada de
  RN; el único punto de entrada de la simulación es `advance(state, dtMs)`, que
  procesa ticks fijos de `TICK_MS` (16.67 ms) con residuo acumulado (dilata en
  vez de espirar bajo stall, tope 8 ticks/frame). El puerto
  `renderer/types.ts` permite cambiar el adaptador (A Views+Reanimated → B Skia)
  sin tocar la lógica.
- **Movimiento en grilla con progreso:** cada entidad está en una celda y avanza
  hacia la vecina (progreso 0..1); decisiones solo al llegar al centro. Reversa
  inmediata del robot (swipe opuesto) invierte celda/target sin teletransporte.
- **Determinismo:** todo el azar pasa por `mulberry32` seedeado; misma seed →
  misma partida (test de determinismo en `rules.test.ts`).
- **Fases scatter/chase** (5s/15s alternando) con reversa forzada de drones;
  el modo power (súper carga, 6s) congela la alternancia y hace huir a los
  drones (velocidad 3.2 vs 4.6 en chase; el robot es más rápido: 5.5).
- **IA sin ojos perseguidores:** los drones deciden por distancia euclidiana al
  objetivo en cada intersección, sin revertir salvo obligación (regla clásica,
  mecánica no protegida); el LED del drone NO indica dirección (diferenciador
  expresivo deliberado).
- **Corral con puerta:** la puerta (`-`) es transitable solo para drones;
  salida escalonada (`releaseBase` + stagger), drone comido reaparece tras 6s.
- **Chip dorado:** aparece al 50% de comestibles, ventana de 10s, celda
  (11,9) — debe ser camino SIN batería porque el pickup corre cada tick
  mientras el robot está en la celda (hallazgo en `PLAN-WAK-WAK.md` §8).
- **Score (convención más-es-mejor, ADR 0005):** batería ×10, súper ×50,
  drone ×200, chip ×100, bonus por vidas ×100 al despejar. Récord vía
  `onGameEnd` → `recordsRepository` (solo `app/juego/[id].tsx` escribe).
- **Render (motor A):** muros/baterías = Views estáticos memoizados;
  entidades = `Animated.View` con shared values escritas por `present()` desde
  el loop rAF; cero `setState` por frame — React re-renderiza solo en eventos
  discretos (pickup, vidas, power).
- **Input por plataforma:** PC web (puntero fino) → teclado, flechas + WASD.
  Táctil (nativo y web con `pointer: coarse`, vía `useIsTouchDevice`) → modo
  configurable persistido en `preferencesRepository` (`wakwak.controlMode`):
  "gestos" (default; swipe en toda la pantalla, una dirección por gesto, emitida
  al cruzar 24px sin esperar el lift) o "flotante" (pad invisible que nace donde
  apoya el dedo; cada dirección re-centra el origen —histéresis— y hay anillo de
  feedback opcional, `wakwak.floatingRing`). La matemática de gestos es pura en
  `engine/controls.ts`; todo pasa por `setDirection` (buffer del engine). Haptic
  de selección por dirección; sonidos vía wrapper `core/ui/sound.ts`. El
  D-pad visible fue eliminado (ganaba espacio al tablero); el E2E input es el
  teclado en desktop y swipe real (CDP) en el spec táctil con emulación móvil.
- **Layout responsive (ADR 0004):** celda = `min(ancho/19, alto/21)` medido con
  `useContainerSize`; sin scroll a 360×640 (spec responsive incluido).
- **E2E gate (ADR 0006):** seeds solo con `EXPO_PUBLIC_E2E=1`. Sentinelas:
  `test-win` (5 baterías en línea → un press gana), `test-lose` (drones
  convergen sobre robot idle), `test-power` (súper pegada al spawn + drone 0 en
  roaming, fase chase → 290 pts y luego derrota).
- **Métricas ([ADR 0011](../../../docs/adr/0011-metricas-performance.md)):** con
  `EXPO_PUBLIC_PERF_METRICS=1` se reportan stalls del loop rAF (JS thread,
  dt crudo > 25ms) y FPS de render (UI thread, `usePerfFrameMonitor`) — ejes
  separados porque miden threads distintos. Resumen al salir; snapshot en
  `localStorage` (web).

## v2 — Niveles, combo y game feel (PLAN-WAK-WAK-V2)

- **Run continua de niveles (D1/D2):** 8 niveles en `engine/levels.ts` con
  knobs por nivel (velocidades, power, scatter/chase, salida del corral);
  nivel 1 más fácil que el MVP, nivel 3 = MVP, nivel 8 más duro. Ganar un
  nivel muestra el interstitial (~1.5s) y avanza solo conservando score y +1
  vida (cap 5); el bonus ×100/vida solo al cerrar la run (nivel 8). El
  `wakwak.maxLevel` desbloqueado persiste en `preferencesRepository` (dual) y
  el selector del header permite iniciar en cualquier nivel desbloqueado.
- **Elroy (D2.1):** el Cazador acelera (×1.05-1.06) cuando la fracción de
  comestibles restantes baja del umbral del nivel — dirección validada contra
  el Pac-Man Dossier.
- **Combo tipo CE DX+ (D3):** drones comidos en un mismo power duplican:
  `droneChainPoints(chain) = min(200·2^(chain−1), 3200)`. Se reinicia al
  expirar el power o al ser atrapado; `bestChain` alimenta el overlay final.
- **Hit-stop paramétrico (D4):** 60ms + 25ms por eslabón (cap 150ms), única
  instancia y guard de pausa; pausa el dt del loop (visual-only, el engine no
  cambia). Duraciones en ms (no frames) por independencia de framerate.
- **Slow-mo near-death (D5):** `engine/feel.ts` calcula amenazas (distancia
  con wrap + closing) y la escala objetivo ×0.5; el loop la suaviza con rampa
  de 200ms. Desviación aceptada: el dt escalado también estira power/fases en
  tiempo real (en CE DX+ el timer no se detiene).
- **Animaciones (D6/D7):** bobbing/wobble como loops `withRepeat` del UI
  thread (gateados por reduced motion y por `moving`), parpadeo de drones al
  expirar el power (<⅓), pop del drone comido, shake/hurt del robot; popups de
  score solo para eventos grandes (drone/chip/súper — batería sin popup);
  sonido de combo con playback rate creciente + haptic Medium en cadena ≥2.
- **E2E v2:** `test-win` fijado al nivel 8 (cierra la run), `test-level`
  (nivel 1 → interstitial + avance), `test-combo` (cadena 200+400 = 650 pts).
