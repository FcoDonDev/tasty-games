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
- [x] Pasar `dir` en `EntityFrame` (desde `worldSnapshot`).
- [x] Rotación del robot con guard por cambio de dir (hallazgo 9): withTiming
      90° solo al cambiar; franja del cepillo apunta hacia donde va; luz de
      antena que cambia al powered.
- [x] Drones: accesorio por personalidad — Cazador (0) = antena spike,
      Emboscador (1) = platillo/radar, Caprichoso (2) = hélice, Tímido (3) =
      domo; wobble con frecuencia/amplitud propia por drone (params del idle
      loop existente); LED con patrón distinto (punto/anillo/estrella/línea).
- [x] Tamaños de drone ±10% máx respecto del actual (scale 0.62) — hitbox
      percibida vs colisión por distancia (hallazgo 9).
- [x] Actualizar checklist legal del README (si cambia alguna expresión).
- [x] Verificación visual 360×640 (screenshots se borran al terminar).
- [x] Verificar fase: typecheck → test → e2e.

### Fase 4 — Laberinto: topología + look + perf (M, ~2-3h)
- [x] Nuevo LAYOUT en `engine/maze.ts`: pasillos más variados (cruces en T,
      corredores asimétricos) manteniendo TODOS los invariantes de
      `maze.test.ts` (conectividad, sin callejones, túnel con wrap, corral con
      puerta, 4 spawns, borde completo salvo túnel).
- [x] Candar invariantes nuevas del layout (hallazgo 6): fila del spawn =
      corredor horizontal ≥6 celdas; esquinas de `HOME_CORNERS` transitables;
      `BONUS_CELL` camino sin batería. Agregar tests que canden estos
      invariantes (evitan regresiones futuras del layout).
- [x] Re-derivar sentinelas en `engine/seed.ts` con las celdas nuevas
      (test-win/test-lose/test-power/test-combo) y re-verificar specs.
- [x] Perf: subcapa estática memoizada (muros+corral, deps `[cellSize]`) para
      eliminar el re-dif por pickup (hallazgo 10). Medir con
      `EXPO_PUBLIC_PERF_METRICS=1` antes/después si hay dudas.
- [x] Look: muros como segmentos fusionados (runs horizontales/verticales)
      con doble borde neón (fill oscuro + edge 1px brillante; sin glow,
      hallazgo 7). Mantener API de `MazeLayer` sin cambios.
- [x] NO tocar `pickup()`/`includes` en engine (hallazgo 2 de perf: retorno
      bajo, riesgo de determinismo — no-action justificada).
- [x] Nota de balance: velocidades (celdas/seg) intactas, pero la topología
      cambia la dificultad efectiva → playtest manual de niveles 1 y 8.
- [x] Verificar fase: typecheck → test → e2e (atención a `test-win`/
      `test-lose`/`test-power`/`test-combo`).

### Fase 5 — Muerte dramática: close-up + explosión (M, ~2h)
- [x] Extender evento `caught` con posición de colisión `{x, y}` (hallazgo 1)
      — puro, determinista, con test.
- [x] Nuevo `renderer/reanimated/DeathFx.tsx`: al `caught` → congelar tick
      ~900ms visual-only (extender patrón hit-stop de `feel.ts`, única
      instancia, respetar guard de pausa) Y congelar present (última pose,
      hallazgo 2); zoom del tablero ~1.6× centrado en la POSICIÓN DE COLISIÓN;
      dim overlay; explosión de ~10 partículas (burst radial, UI thread);
      luego respawn normal.
- [x] Secuencia con el overlay final: `endRun` en derrota encadena su timer al
      fin del clip (hallazgo 3); caught con vidas restantes sigue el flujo
      normal (respawn + releaseAt).
- [x] Reduced motion: solo flash + fade (sin zoom ni partículas).
- [x] Sonido: `hit` con playback rate ~0.7 (pitch grave) como primer intento;
      si no convence, `explosion.wav` sintetizado propio (decisión abierta).
- [x] Cuidar que `test-lose` siga verde (tiempos del overlay final).
- [x] Verificar fase: typecheck → test → e2e.

### Aplicado — Near-death v2: slow-mo continuo + zoom progresivo

Observación del usuario: la muerte se siente muy breve — el tiempo debería
lentificarse MIENTRAS MÁS CERCA de morir esté el jugador, y debería hacerse
un zoom gradual ante muerte inminente. La explosión al morir queda como está.

Estado actual (v2 D5, `engine/feel.ts`):
- `slowMoScale(threats, powered)`: ESCALONADO — 0.5 si hay drone activo a
  ≤1.2 celdas acercándose; 1 si no. El salto es breve y vuelve a 1 apenas el
  drone recula → "muy breve" (diagnóstico correcto).
- La rampa del loop (SLOWMO_RAMP_MS 200) suaviza el paso, pero el objetivo
  binario hace el efecto on/off.
- Sin zoom de amenaza (el zoom solo existe en el clip de muerte).

Diseño propuesto (a aplicar tras aprobación):

1. **Slow-mo CONTINUO por proximidad** (`feel.ts`, puro):
   - Radio mayor: `SLOWMO_RADIUS` 1.2 → ~2.6 celdas.
   - Escala continua monótona: `d ≥ R` → 1; `d ≤ 0.7` → `SLOWMO_MIN (0.35)`;
     entre medio, interpolación lineal (más cerca = más lento). Requiere
     `closing` como hoy; powered → 1.
   - La amenaza más cercana manda (min de escalas).
   - Parámetros tunables: RADIUS, MIN_SCALE, distancia de colisión (0.7).
2. **Zoom progresivo de amenaza** (solo render, engine intacto):
   - `threatZoom(distance)` puro: 1.0 (lejos) → ~1.10-1.12 (a punto de morir),
     lineal en el mismo radio; powered → 1.
   - Shared value `threatZoom` escrita por frame desde el loop (patrón
     `powerFractionSV` — cero setState por frame) y multiplicada en
     `boardZoomStyle` junto al zoom del clip.
   - **Handoff al clip de muerte**: el clip anima hacia 1.6/1.8 DESDE el zoom
     vigente (con amenaza cercana ~1.10 — el close-up continúa el zoom, no
     salta); en el recover el clip devuelve el zoom a 1.
   - Reduced motion: sin zoom de amenaza (el slow-mo se conserva: es dt, no
     animación).
3. **Tests** (`feel.test.ts`): curva monótona (más cerca → menor escala/zoom),
   bordes (d=R → 1; d≤0.7 → min), closing=false → 1, powered → 1, zoom range.
4. **E2E**: riesgo bajo — el zoom solo aparece con amenaza activa cercana;
   los specs miden movimiento con drones aún en corral. Verificación completa
   de rigor.
5. **Notas de design**: el slow-mo más frecuente alarga la partida en tiempo
   REAL (no en tiempo de juego) — desviación ya aceptada en D5. Tuning final
   con el usuario sobre la constante RADIUS/MIN_SCALE.

TAREAS (al aprobar):
- [x] `feel.ts`: reemplazar `slowMoScale` por versión continua + agregar
      `threatZoomOf(state)` (puro) + constantes.
- [x] Tests de curva y bordes.
- [x] `WakWakScreen`: shared value `threatZoom` por frame; `boardZoomStyle`
      multiplica zoom de amenaza × zoom de clip.
- [x] Verificar: typecheck → test → e2e → visual en dev (amenaza real).

RESULTADO: aplicado y verificado. Muestreo con Playwright (test-lose, 18s):
zoom de amenaza progresivo 1.01→~1.09 a distancia de colisión (frames desde
t≈8.5s, fase chase), handoff al clip CONTINUO (sin salto: clip parte del zoom
vigente y anima a 1.6), y recover a 1. E2E 41/41; 325 tests.
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

### Iteración con el usuario (post-implementación de las 5 fases)

4. **Propuesta de personajes convertida en COMPONENTES** (`preview/
   PropuestaPersonajes.tsx`): `DroneHexFig` (hexágono 3 caras: trapecio luz
   + franja media con asas/visor + punta redondeada, capucha con ranura,
   expresiones fijas por variante: cejas enojadas Cazador, lente Emboscador,
   ojo lateral Caprichoso, sonrisa+marcas de susto Tímido) y `AspiradoraFig`
   (elipse 3/4 con banda frontal + ojitos + botón). Paleta = DRONE_COLORS y
   wobble = DRONE_TUNE del render activo. `PersonajesPreview` ahora muestra:
   implementado → referencia PNG → componentes a escala del juego → detalle.
   Sin SVG (borders trick) ni dependencias nuevas. PENDIENTE: aprobación del
   diseño → recién ahí tocar EntitiesLayer.
   Ajuste v2 (feedback usuario): ojitos de la aspiradora más grandes (0.07s)
   y hexágono "macizo" — top face más bajo (0.15s), franja media más alta
   (0.32s), taper inferior largo (0.30s) + punta redonda, asas más grandes.
   Aspiradora APROBADA por el usuario.
   Ajuste v4 (feedback usuario): drones con cuerpo CUADRADO redondeado —
   APROBADO junto con la aspiradora → IMPLEMENTADO en EntitiesLayer (commit
   del diseño aprobado): drones = cuerpo rect 0.96×0.70s (banda de luz
   rgba-blanca que se adapta a powered/hurt, visor + DroneFace con expresión
   fija, capucha/asas con DRONE_DARKS → POWERED_DRONE_DARK, wobble sin base
   45°); robot = aspiradora círculo top-down (placa rgba, botón-beacon dorado
   en powered, banda frontal con ojitos, puerto lateral) con heading igual
   que antes. ROBOT_COLOR '#E7ECF2', POWERED_ROBOT_COLOR '#FDE047'
   (encendido = dorado súper); drones powered '#475569' (apagados, igual).
   DroneAccessory/DroneLed eliminados. El front local del robot es ABAJO
   (headingAngle 0 = down).
   Ajuste v3 (feedback usuario): cuerpo de los drones CUADRADO redondeado
   (rect 0.96×0.70s, radio 0.15s, banda de luz superior recortada) en vez del
   hexágono — mantiene capucha, asas, visor y expresiones.

NUEVO REQUERIMIENTO del usuario (verificación en dev server):

1. **Diseño de personajes no satisface** → carpeta `preview/` creada:
   `PersonajesPreview` (galería con los componentes REALES, idle corriendo,
   estados normal/powered), ruta dev `/wakwak-preview`
   (`app/wakwak-preview.tsx`). PENDIENTE: el usuario itera el diseño; al
   cerrar se toca `EntitiesLayer`.
2. **Regla de laberinto: SOLO pasillos, sin áreas abiertas 3×3** — confirmado
   que el v1 y el v2 TAMBIÉN las tienen (filas 17-19 desde el MVP; el v2
   agregó filas 3-5). `LaberintoPreview` muestra ACTIVO vs CANDIDATO con
   validador en vivo (`validateLayout`: callejones, inaccesibles, corral,
   pines, y la regla 3×3). Candidato v3 validado (sin 3×3, 6 cuatro-vías,
   175 baterías) en `preview/LAB_CANDIDATO.ts`. PENDIENTE: aprobación del
   usuario → reemplazar LAYOUT + tests (incl. regla 3×3) + E2E.
   NOTA: el validador debe implementar el wrap del túnel (falso positivo
   en (9,0)/(9,18) corregido).
3. **Time-stop de la muerte se sentía perdido** — confirmado: zoom 180ms +
   partículas inmediatas tapaban el stop. Extensión aprobada y aplicada:
   freeze 1300ms (final 1500) + FRAME DE IMPACTO (dim+zoom solos ~250ms,
   zoom 280ms) → onda (160ms) → partículas (250ms). `DEATH_RECOVER_MS` 250.
   PENDIENTE: verificación del usuario en dev.

### F1
- `powerFraction` viaja por `useSharedValue` creada en WakWakScreen y escrita
  en el frame del loop (`snapshot.powerFraction`); BoardBanner la consume con
  `useAnimatedStyle` → cero setState por frame. Verificado E2E test-power.

### F5
- BUG de origen del zoom encontrado en la verificación visual: RN aplica
  transforms alrededor del CENTRO del elemento; la compensación manual
  translate·scale·translate⁻¹ asume origen (0,0) → doble compensación
  desplazaba el tablero. Fix: `transformOrigin: '0 0'` en styles.board.
  Candidato a GOTCHAS (lección reproducible RN/RNW).
- La posición del `caught` se captura en un objeto mutable (caughtAt): TS
  estrecha un `let` asignado solo dentro de un callback a `never` en el uso.
  Candidato a GOTCHAS (TypeScript).
- Sonido: player propio `explosion` reutilizando hit.wav con rate 0.7 (el
  rate NO debe mutar el player compartido de soundHit). Test de
  primeAudioPlayers actualizado 7→8 sonidos.
- Timeline candado: visual (900/1100ms) → desmonte de DeathFx + zoom de
  vuelta (200ms, present sigue congelado) → unfreeze → (derrota) overlay a
  visual+recover+300. test-lose verde con los tres tiempos.
- Verificación visual del clip hecha con seed=test-lose + polling del
  transform del tablero (espera activa del close-up); screenshots borrados.

### F4
- HALLAZGO CLAVE: los sentinelas E2E NO necesitaron cambios — el nuevo layout
  conserva la fila 15 (corredor del spawn c4..c14, topes c3/c15), el corral
  (filas 8-10) y (11,9). seed.ts queda intacto. Los pines están candeados con
  tests nuevos en maze.test.ts (bloque "pines del layout").
- El layout se diseñó con un validador externo (réplica de los invariantes del
  test + pines) iterando en /tmp: candidato B con 26 cruces de 4 vías (baseline
  20) y 207 baterías (baseline 186). Filas largas abiertas (r3/r7/r13/r19) para
  velocidad y escapadas.
- Efecto colateral del nuevo layout: (15,9)-arriba ahora es transitable → los
  tests que asumían "muro arriba del spawn" pasaron a "down" (state.test,
  rules.test) y ai.test re-derivó su celda de sondeo a (13,9) (mismo perfil:
  arriba muro, abajo/left/right abiertos).
- MazeLayer: merge greedy de muros en rectángulos máximos (~45 Views vs ~180);
  subcapa estática memoizada (muros+corral, deps [cellSize]) → el re-dif por
  pickup queda reducido a las edibles. Medición formal de FPS pospuesta (el
  bail-out de React es estructural; se puede medir con ADR 0011 si aparece
  queja de perf).
- Los tests de IA Documentan: con el nuevo maze, las decisiones de scatter
  siguen válidas (esquinas transitables, candado en maze.test).

### F3
- Rotación del robot verificada en runtime: heading −90° yendo a la derecha
  (matrix CSS del elemento). Guard lastDir evita withTiming por frame.
- Los accesorios viven en un wrapper contra-rotado −45° anclado a la esquina
  sup-izq local (que es el vértice visual del rombo): quedan verticales sobre
  el drone con el tilt del wobble (±3-9°) como movimiento propio.
- Verificación visual 360×640 hecha con export+serve+Playwright (pausa por CSS
  para congelar entidades, zoom CSS scale(4-5) para detalle). Los screenshots
  se borraron. HUD limpio: score/nivel/vidas sin solapes.

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
