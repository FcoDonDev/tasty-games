# PLAN-WAK-POLISH — Pulido de Wak Wak: personalidad, drama, laberinto, control y mensajes

## Contexto

Wak Wak (v2, run continua de niveles) es funcional y verde en verificación estándar.
Este requerimiento es un paquete de **polido de experiencia** con 5 frentes
solicitados por el usuario:

1. Dar más personalidad a los personajes (robot + 4 drones).
2. Animación de muerte más dramática (close-up + mini-clip de explosión del robot).
3. Mejorar el laberinto (topología y look).
4. Mejorar la maniobrabilidad.
5. Mensajes de combo y booster sobre el tablero, no en la sección superior del HUD
   (hoy son texto de 13px en la fila superior, difícil de apreciar).

## Decisiones de diseño (aprobadas con el usuario)

| Tema | Decisión | Alternativas descartadas |
|---|---|---|
| Laberinto | **Ambos**: nuevo LAYOUT (topología) + look visual (muros segmentados con borde neón). Revisar seeds E2E. | Solo topología / solo look |
| Muerte | **Close-up + explosión**: zoom del tablero ~1.6× centrado en el SITIO DE LA COLISIÓN, dim, burst de partículas, ~900ms congelado (tick+present), luego respawn. Reduced motion → solo flash + fade. | Solo explosión sin zoom |
| Personajes | **Siluetas + accesorios** (sin ojos/expresiones): accesorio distinto por personalidad, wobble/LED propios; robot rota hacia su dirección y cambia de estado al powered. Resguardo legal intacto. | Ojos/emojis (margen legal ambiguo); solo tamaño/velocidad |
| Maniobrabilidad | **Paquete estándar** (fundamentado en el Dossier): buffer de 2 direcciones con PRIORIDAD AL NUEVO, giro en el primer instante válido, pivote visual suavizado, swipe threshold 24→18px. Sin diagonales. | Solo sensibilidad de gestos |

## Fundamento verificado (fuentes)

- **The Pac-Man Dossier** (pacman.holenet.info, texto íntegro — verificado en
  sesión): el cornering del original da ventaja de distancia porque el jugador
  se mueve en diagonal por píxeles ("one pixel in his new direction for every
  pixel traveled in his old direction, effectively doubling his speed"). Nuestro
  motor es celda-progreso SIN diagonales (decisión: complejidad de `moveEntity`
  y del determinismo no justificada) → NO hay ventaja de distancia que copiar;
  lo transferible es el **input buffering** y la **asimetría clásica**: solo el
  jugador gana el buffer, los drones siguen decidiendo solo en centros de celda.
- Combo CE DX+ (×2 por eslabón, cap 3200): ya implementado en
  `droneChainPoints` (rules.ts) — fuera de alcance.
- expo-audio: patrón de playback rate ya existe (`soundCombo`, sound.ts) → un
  sonido de explosión grave puede reusar `hit` con rate ~0.7 sin asset nuevo.
  Decisión abierta barata: si el pitch-down no "vende" el boom, sintetizar un
  `explosion.wav` propio (resguardo legal: sin jingles del original).

## Hallazgos de la revisión crítica (v2 — aplicados al checklist)

1. **[F5] El evento `caught` debe llevar la posición de colisión.** En
   `step()` el engine resetea al robot al spawn en el MISMO tick que emite
   `caught` (resetPositions) → cuando `handleEvents` lo recibe, el robot ya
   está en el spawn y el close-up encuadraría mal. Fix: extender el evento a
   `{ type: 'caught'; x: number; y: number }` con `floatPos` del tick de la
   colisión — puro, determinista, testeable.
2. **[F5] Congelar tick Y present durante la secuencia.** `present()` corre
   cada frame con `worldSnapshot` del estado ya reseteado → las entidades
   teleportarían a sus spawns durante el clip. La pausa visual debe dejar las
   shared values en la última pose (skip de `present`) y superponer DeathFx.
3. **[F5] Secuencia con el overlay final.** `endRun(false)` muestra el
   EndOverlay a 800ms; el clip dura más → el timer debe encadenarse al fin del
   clip (derrota final) y quedar intacto para caught con vidas restantes.
4. **[F2] Buffer con prioridad al nuevo (no FIFO).** El Dossier: el último
   input del joystick es el que cuenta; el buffer retiene el MÁS RECIENTE.
   `robotArrive` prueba primero el input más nuevo y cae al anterior solo si
   el nuevo no es viable — un FIFO aplicaría el input viejo y causaría giros
   no deseados.
5. **[F2] La "ventana de giro" reformulada**: sin diagonales no hay
   pre/post-turn con ventaja de distancia. Implementable real: giro aplicado
   en el primer instante geométricamente válido (llegada al centro — ya
   existe; robot detenido tras muro — ya existe) + pivote VISUAL suavizado
   (curva del sprite en la esquina, solo cosmético). El plan candea la
   expectativa: la mejora de sensación viene del buffer y del umbral.
6. **[F4] Invariantes del nuevo layout para no romper E2E**: (a) la fila del
   `'R'` debe ser corredor horizontal de ≥6 celdas libres a la izquierda del
   spawn (test-win: 5 baterías en línea; test-power/test-combo: súper en
   `15*COLS+8` y drones en c6/c4 — re-derivar con la fila nueva); (b)
   `HOME_CORNERS` de ai.ts (1,1), (1,COLS-2), (19,1), (19,COLS-2) deben ser
   celdas de camino (scatter se degrada con esquinas amuralladas); (c)
   `BONUS_CELL` debe ser camino SIN batería (hallazgo PLAN-WAK-WAK §8).
7. **[F4] Sin glow en Views nativas**: no existe box-shadow multiplataforma en
   RN Views. El neón se logra con doble borde (fill oscuro + edge 1px
   brillante) — cero costo y se ve igual en web y nativo.
8. **[F1] El power bar es shared value, no React state**: `powerFraction`
   cambia por frame; pasarlo por setState viola la arquitectura "cero setState
   por frame". Se escribe desde el loop por la vía `present()` (patrón
   EntitiesLayer); reduced motion → opacity-only.
9. **[F3] Rotación del robot con guard por cambio**: `dir` viaja por frame en
   `EntityFrame`; la rotación solo se anima (withTiming 90°) CUANDO CAMBIA la
   dirección (guard `lastDir` ref, patrón `blinking.current` existente) —
   llamar withTiming cada frame crearía animaciones basura. Drones: tamaños
   ±10% máx respecto del actual (scale 0.62) — la colisión es por distancia
   (0.7 celda) y un sprite muy distinto confundiría la hitbox percibida.
10. **[Perf, F4] Subcapa estática memoizada en MazeLayer** (la mejora de perf
    más barata del paquete): hoy cada pickup cambia la identidad de
    `batteries` → MazeLayer re-dif ~180 muros + ~200 edibles por batería
    comida (5-10 eventos/s en juego activo). Extraer muros+corral a un
    componente memo con deps `[cellSize]` → React hace bail-out del subtree.

## Notas de estado actual (levantamiento)

- Personajes: `renderer/reanimated/EntitiesLayer.tsx` — robot = cuadrado
  redondeado con franja; drones = 4 rombos idénticos que difieren solo en color
  (`DRONE_COLORS`) y wobble genérico ±3°. `EntityFrame` NO recibe `dir`
  (sí viaja en `worldSnapshot` de `engine/rules.ts`).
- Muerte (`caught` en `rules.ts` + `handleEvents` en `WakWakScreen.tsx`):
  shake + flash 300ms. Reset de posiciones en el mismo tick del evento.
- Laberinto: `LAYOUT` 19×21 en `engine/maze.ts` (muros = bloque por celda en
  `MazeLayer.tsx`, re-render completo por pickup). `engine/seed.ts` hardcodea
  sentinelas sobre la fila 15 (spawn (15,9)). `BONUS_CELL = toIndex(11, 9)`.
- Maniobrabilidad: `Robot.queued` es UN solo slot (`rules.ts`); `robotArrive`
  aplica al llegar al centro; reversa inmediata en `queueDirection`;
  `SWIPE_THRESHOLD = 24` en `engine/controls.ts` (usado por gestos y flotante).
- Mensajes: `components/Hud.tsx` muestra combo (`key={chain}`) y power en la
  fila superior; popups de score ya flotan sobre el tablero (`spawnPopup`).
  Los specs E2E NO dependen de los labels `wakwak-combo`/power (usan
  `marcador-puntos` y modales), pero se conservan por convención (Maestro).
- Audio: players por asset con `seekTo(0)+play()` fire-and-forget; playback
  rate vía `setPlaybackRate` con fallback silencioso (`soundCombo`).

## Restricción legal (recordatorio)

Checklist del README del juego: los drones siguen siendo "rombos con LED
central" y el robot un aspirador — los accesorios NO imitan campanas con ojos
que siguen la dirección ni círculo con boca en V. Audio de explosión:
sintetizado propio (sin jingles del original). Actualizar el checklist si algo
cambia de expresión.

## Checklist de tareas (orden de ejecución)

### Fase 1 — Mensajes de combo/booster sobre el tablero (S, ~0.5h)
- [x] Nuevo `components/BoardBanner.tsx`: banner flotante centrado sobre el
      tablero (~20% superior) para `⚡ COMBO ×N` (pop con spring por eslabón,
      re-monta por `key={chain}`) y `SÚPER CARGA` con barra de tiempo restante.
- [x] La barra usa `powerFraction` vía shared value escrita desde el loop
      (patrón present, sin setState por frame; hallazgo 8).
- [x] `Hud.tsx`: dejar solo score/vidas/nivel (quitar combo y power).
- [x] Conservar labels (`wakwak-combo`, etc.) en los nuevos elementos.
- [x] Reduced motion: solo FadeIn/FadeOut (sin transforms).
- [x] Verificar fase: typecheck → test → e2e.

### Fase 2 — Maniobrabilidad (S-M, ~1.5h)
- [x] Buffer de 2 direcciones CON PRIORIDAD AL NUEVO (hallazgo 4):
      `Robot.queued` → cola de 2; `robotArrive` prueba primero el input más
      nuevo y cae al anterior si el nuevo no es viable. Reversa inmediata sin
      cambios.
- [x] Giro en el primer instante válido (llegada al centro + robot detenido
      tras muro) + pivote visual suavizado (cosmético; hallazgo 5).
- [x] `SWIPE_THRESHOLD` 24→18px; evaluar mantener 24px en modo flotante
      (histéresis de re-centrado: 18px puede emitir giros perpendiculares
      accidentales en diagonales) — decidir con prueba táctil, ambos valores
      pasan el spec (swipes de 8→64px).
- [x] Tests: `rules.test.ts` (buffer 2, prioridad al nuevo), `controls.test.ts`
      (threshold). Verificar regresión del determinismo (seed).
- [x] Verificar fase: typecheck → test → e2e.

### Fase 3 — Personalidad de personajes (M, ~2h)
- [ ] Pasar `dir` en `EntityFrame` (desde `worldSnapshot`).
- [ ] Rotación del robot con guard por cambio de dir (hallazgo 9): withTiming
      90° solo al cambiar; franja del cepillo apunta hacia donde va; luz de
      antena que cambia al powered.
- [ ] Drones: accesorio por personalidad — Cazador (0) = antena spike,
      Emboscador (1) = platillo/radar, Caprichoso (2) = hélice, Tímido (3) =
      domo; wobble con frecuencia/amplitud propia por drone (params del idle
      loop existente); LED con patrón distinto (punto/anillo/estrella/línea).
- [ ] Tamaños de drone ±10% máx respecto del actual (scale 0.62) — hitbox
      percibida vs colisión por distancia (hallazgo 9).
- [ ] Actualizar checklist legal del README (si cambia alguna expresión).
- [ ] Verificación visual 360×640 (screenshots se borran al terminar).
- [ ] Verificar fase: typecheck → test → e2e.

### Fase 4 — Laberinto: topología + look + perf (M, ~2-3h)
- [ ] Nuevo LAYOUT en `engine/maze.ts`: pasillos más variados (cruces en T,
      corredores asimétricos) manteniendo TODOS los invariantes de
      `maze.test.ts` (conectividad, sin callejones, túnel con wrap, corral con
      puerta, 4 spawns, borde completo salvo túnel).
- [ ] Candar invariantes nuevas del layout (hallazgo 6): fila del spawn =
      corredor horizontal ≥6 celdas; esquinas de `HOME_CORNERS` transitables;
      `BONUS_CELL` camino sin batería. Agregar tests que canden estos
      invariantes (evitan regresiones futuras del layout).
- [ ] Re-derivar sentinelas en `engine/seed.ts` con las celdas nuevas
      (test-win/test-lose/test-power/test-combo) y re-verificar specs.
- [ ] Perf: subcapa estática memoizada (muros+corral, deps `[cellSize]`) para
      eliminar el re-dif por pickup (hallazgo 10). Medir con
      `EXPO_PUBLIC_PERF_METRICS=1` antes/después si hay dudas.
- [ ] Look: muros como segmentos fusionados (runs horizontales/verticales)
      con doble borde neón (fill oscuro + edge 1px brillante; sin glow,
      hallazgo 7). Mantener API de `MazeLayer` sin cambios.
- [ ] NO tocar `pickup()`/`includes` en engine (hallazgo 2 de perf: retorno
      bajo, riesgo de determinismo — no-action justificada).
- [ ] Nota de balance: velocidades (celdas/seg) intactas, pero la topología
      cambia la dificultad efectiva → playtest manual de niveles 1 y 8.
- [ ] Verificar fase: typecheck → test → e2e (atención a `test-win`/
      `test-lose`/`test-power`/`test-combo`).

### Fase 5 — Muerte dramática: close-up + explosión (M, ~2h)
- [ ] Extender evento `caught` con posición de colisión `{x, y}` (hallazgo 1)
      — puro, determinista, con test.
- [ ] Nuevo `renderer/reanimated/DeathFx.tsx`: al `caught` → congelar tick
      ~900ms visual-only (extender patrón hit-stop de `feel.ts`, única
      instancia, respetar guard de pausa) Y congelar present (última pose,
      hallazgo 2); zoom del tablero ~1.6× centrado en la POSICIÓN DE COLISIÓN;
      dim overlay; explosión de ~10 partículas (burst radial, UI thread);
      luego respawn normal.
- [ ] Secuencia con el overlay final: `endRun` en derrota encadena su timer al
      fin del clip (hallazgo 3); caught con vidas restantes sigue el flujo
      normal (respawn + releaseAt).
- [ ] Reduced motion: solo flash + fade (sin zoom ni partículas).
- [ ] Sonido: `hit` con playback rate ~0.7 (pitch grave) como primer intento;
      si no convence, `explosion.wav` sintetizado propio (decisión abierta).
- [ ] Cuidar que `test-lose` siga verde (tiempos del overlay final).
- [ ] Verificar fase: typecheck → test → e2e.

### Cierre
- [ ] Verificación completa: `pnpm typecheck` → `pnpm test` →
      `node scripts/e2e.mjs` (25/25).
- [ ] Revisión visual final 360×640 (sin scroll, sin solapes); borrar screenshots.
- [ ] Actualizar docs: README del juego (decisiones nuevas), checklist legal,
      `docs/GOTCHAS.md` (hallazgos técnicos reproducibles), ADR si hay
      decisión transversal nueva.
- [ ] Migrar hallazgos a sus destinos (tabla AGENTS.md) y eliminar este PLAN
      en el commit final de cierre.

## Notas/hallazgos

### F1
- `powerFraction` viaja por `useSharedValue` creada en WakWakScreen y escrita
  en el frame del loop (`snapshot.powerFraction`); BoardBanner la consume con
  `useAnimatedStyle` → cero setState por frame. Verificado E2E test-power.

### F2
- El pivote visual suavizado de la esquina se DELEGA a F3: la rotación del
  robot hacia `dir` (withTiming 90° en el cambio) produce ese efecto sin
  tocar el renderer dos veces.
- Modo flotante conservó su umbral de 24px (`FLOAT_THRESHOLD`): con 18px la
  histéresis de re-centrado emitiría giros perpendiculares accidentales en
  diagonales. El spec táctil (pasos 8→64px) sigue pasando con ambos valores.
- La reversa ahora limpia el buffer (el último input prevalece, coherente con
  prioridad-al-nuevo). Testeado en rules.test.
- Semántica candada con tests: aplicar CUALQUIERA de los encolados limpia el
  buffer completo; el viejo solo sirve como fallback si el nuevo no es viable
  en esa intersección.
