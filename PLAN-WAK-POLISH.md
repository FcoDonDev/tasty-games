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

Referencia técnica para #4: *The Pac-Man Dossier* (Jamey Pittman) — cornering
(ventana de pre/post-turno alrededor del centro de la celda, ventaja real de
distancia) e input buffering (la dirección se retiene hasta que puede aplicarse).
Nuestro motor en grilla no implementa diagonales como el original (duplicaría la
complejidad sin retorno claro); se adoptan las dos prácticas anteriores en su
versión adaptada.

## Decisiones de diseño (aprobadas con el usuario)

| Tema | Decisión | Alternativas descartadas |
|---|---|---|
| Laberinto | **Ambos**: nuevo LAYOUT (topología) + look visual (muros segmentados con borde neón). Revisar seeds E2E. | Solo topología / solo look |
| Muerte | **Close-up + explosión**: zoom del tablero ~1.6× centrado en el robot, dim, burst de partículas, ~900ms congelado (visual-only), luego respawn. Reduced motion → solo flash + fade. | Solo explosión sin zoom |
| Personajes | **Siluetas + accesorios** (sin ojos/expresiones): accesorio distinto por personalidad, wobble/LED propios; robot rota hacia su dirección y cambia de estado al powered. Resguardo legal intacto. | Ojos/emojis (margen legal ambiguo); solo tamaño/velocidad |
| Maniobrabilidad | **Paquete estándar** (fundamentado en el Dossier): buffer de 2 direcciones, ventana de giro pre/post-centro, swipe threshold 24→18px. Sin diagonales. | Solo sensibilidad de gestos |

## Notas de estado actual (levantamiento)

- Personajes: `renderer/reanimated/EntitiesLayer.tsx` — robot = cuadrado
  redondeado con franja; drones = 4 rombos idénticos que difieren solo en color
  (`DRONE_COLORS`) y wobble genérico ±3°. `EntityFrame` NO recibe `dir`
  (sí viaja en `worldSnapshot` de `engine/rules.ts`).
- Muerte (`caught` en `rules.ts` + `handleEvents` en `WakWakScreen.tsx`):
  shake + flash 300ms. El engine resetea posiciones AL TICK SIGUIENTE → la
  secuencia dramática exige congelar el dt del loop (patrón hit-stop de
  `engine/feel.ts`, única instancia) para que el clip corra antes del respawn.
- Laberinto: `LAYOUT` 19×21 en `engine/maze.ts` (muros = bloque por celda en
  `MazeLayer.tsx`). `engine/seed.ts` tiene celdas hardcodeadas para sentinelas
  E2E (`test-win`/`test-lose`/`test-power`) y `BONUS_CELL` es `toIndex(11, 9)`.
  Cambiar el layout obliga a re-posicionar sentinelas y re-verificar specs.
- Maniobrabilidad: `Robot.queued` es UN solo slot (`rules.ts`);
  `robotArrive` lo aplica solo al llegar al centro de celda; reversa inmediata
  en `queueDirection`. `SWIPE_THRESHOLD = 24` en `engine/controls.ts`.
- Mensajes: `components/Hud.tsx` muestra combo (`key={chain}`) y power en la
  fila superior; los popups de score ya flotan sobre el tablero
  (`spawnPopup` en `WakWakScreen.tsx`).

## Restricción legal (recordatorio)

Checklist del README del juego: los drones siguen siendo "rombos con LED
central" y el robot un aspirador — los accesorios NO imitan campanas con ojos
que siguen la dirección ni círculo con boca en V. Audio de explosión:
sintetizado propio (sin jingles del original). Actualizar el checklist si algo
cambia de expresión.

## Checklist de tareas (orden de ejecución)

### Fase 1 — Mensajes de combo/booster sobre el tablero (S, ~0.5h)
- [ ] Nuevo `components/BoardBanner.tsx`: banner flotante centrado sobre el
      tablero (~20% superior) para `⚡ COMBO ×N` (pop con spring por eslabón,
      re-monta por `key={chain}`) y `SÚPER CARGA` con barra de tiempo restante
      (alimentada por `powerFraction` del snapshot).
- [ ] `Hud.tsx`: dejar solo score/vidas/nivel (quitar combo y power).
- [ ] Conservar labels E2E (`wakwak-combo`, etc.) en los nuevos elementos.
- [ ] Reduced motion: solo FadeIn/FadeOut (sin transforms).
- [ ] Verificar fase: typecheck → test → e2e.

### Fase 2 — Maniobrabilidad (S-M, ~1.5h)
- [ ] Buffer de 2 direcciones: `Robot.queued: Direction | null` → cola de 2;
      `robotArrive` consume la primera viable. Reversa inmediata sin cambios.
- [ ] Ventana de giro (pre/post-turn): aplicar la dirección encolada tan pronto
      sea válida dentro de la celda (no solo en el centro exacto); pivote
      visual suavizado. Lógica determinista en `moveEntity`/`robotArrive`.
- [ ] `SWIPE_THRESHOLD` 24→18px en `engine/controls.ts` (flotante hereda).
- [ ] Tests: `rules.test.ts` (buffer 2, ventana de giro), `controls.test.ts`
      (threshold). Verificar regresión del determinismo (seed).
- [ ] Verificar fase: typecheck → test → e2e.

### Fase 3 — Personalidad de personajes (M, ~2h)
- [ ] Pasar `dir` en `EntityFrame` (desde `worldSnapshot`, que ya lo entrega).
- [ ] Drones: accesorio por personalidad — Cazador (0) = antena spike,
      Emboscador (1) = platillo/radar, Caprichoso (2) = hélice, Tímido (3) =
      domo; wobble con frecuencia/amplitud y tamaño propios por drone; LED con
      patrón distinto (punto/anillo/estrella/línea).
- [ ] Robot: rotación según `dir` (franja del cepillo apunta hacia donde va);
      luz de antena que cambia al powered.
- [ ] Actualizar checklist legal del README (si cambia alguna expresión).
- [ ] Verificación visual 360×640 (screenshots se borran al terminar).
- [ ] Verificar fase: typecheck → test → e2e.

### Fase 4 — Laberinto: topología + look (M, ~2-3h)
- [ ] Nuevo LAYOUT en `engine/maze.ts`: pasillos más variados (cruces en T,
      corredores asimétricos) manteniendo TODOS los invariantes de
      `maze.test.ts` (conectividad, sin callejones, túnel con wrap, corral con
      puerta, 4 spawns, borde completo salvo túnel).
- [ ] Re-posicionar sentinelas en `engine/seed.ts` (spawn, baterías en línea
      de `test-win`, drones de `test-lose`/`test-power`) y re-verificar specs.
- [ ] `MazeLayer.tsx`: muros como segmentos fusionados (runs horizontales/
      verticales) con borde/glow neón — menos Views y estilo arcade.
- [ ] Revisar `BONUS_CELL` (11,9): la celda debe seguir siendo camino SIN
      batería (hallazgo PLAN-WAK-WAK §8).
- [ ] Verificar fase: typecheck → test → e2e (atención a `test-win`/
      `test-lose`/`test-power`).

### Fase 5 — Muerte dramática: close-up + explosión (M, ~2h)
- [ ] Nuevo `renderer/reanimated/DeathFx.tsx`: al `caught` → congelar loop
      ~900ms visual-only (extender patrón hit-stop de `feel.ts`, única
      instancia, respetar guard de pausa); zoom del tablero ~1.6× centrado en
      la posición real del robot; dim overlay; explosión de ~10 partículas
      (burst radial, UI thread, `withSequence`/`withTiming`); luego respawn
      normal. Derrota final: secuencia más larga antes del overlay (hoy ~800ms).
- [ ] Reduced motion: solo flash + fade (sin zoom ni partículas).
- [ ] Sonido de explosión sintetizado en `core/ui/sound.ts` (o `soundHit` con
      playback rate bajo — decidir al implementar).
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

(a completar durante la implementación)
