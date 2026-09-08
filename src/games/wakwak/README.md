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

- [ ] Protagonista: robot aspiradora (cuadrado redondeado con franja), NO círculo
      amarillo con boca en V.
- [ ] Enemigos: 4 drones rombo con LED central fijo, NO campanas con ojos que
      siguen la dirección de movimiento. Colores por personalidad
      (naranja/violeta/celeste/rosa), no el cuarteto rojo/rosa/celeste/naranja
      del original.
- [ ] Comida: baterías cuadradas doradas y súper batería; chip dorado como bonus.
      Paleta neón sobre fondo oscuro `#0B1220` (no azul/rosa).
- [ ] Audio: blips/golpes sintetizados propios; sin waka-waka, sirena ni jingle.
- [ ] Nombre y descripción sin referencia a la marca del original.
- [ ] Laberinto: layout propio 19×21 (`engine/maze.ts`), validado por tests
      (conectividad, sin callejones, todo alcanzable).

## Estructura

```
src/games/wakwak/
  index.ts                # GameDefinition registrado en src/core/game-registry.ts
  WakWakScreen.tsx        # orquestador: loop rAF, swipe/teclado, HUD, modales, récord
  components/             # HUD, DirectionPad, Overlays (UI RN estándar, agnóstica)
  engine/                 # NÚCLEO PURO: TS sin RN, determinista, testeado con Jest
    maze.ts               #   laberinto 19×21 propio + vecinos (túnel/corral/puerta)
    rules.ts              #   advance(state, dtMs) por ticks fijos: movimiento,
                          #   colisiones, power mode, chip, win/lose, worldSnapshot()
    ai.ts                 #   4 personalidades: Cazador/Emboscador/Caprichoso/Tímido
    seed.ts               #   mulberry32 + seeds sentinelas E2E
    state.ts              #   store zustand (no exportado fuera de la carpeta)
  renderer/
    types.ts              # PUERTO de presentación (createWorld/present/onDirection)
    reanimated/           # ADAPTADOR A (ADR 0010): MazeLayer + EntitiesLayer
  __tests__/              # 59 tests del núcleo (sin RN)
  __e2e__/                # Playwright web (seeds test-win/test-lose/test-power)
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
- **Input triple:** swipe (Pan sobre el tablero), D-pad accesible (selectores
  E2E estables `wakwak-arriba`...) y flechas de teclado en web. Haptic de
  selección en el D-pad; sonidos vía wrapper `core/ui/sound.ts`.
- **Layout responsive (ADR 0004):** celda = `min(ancho/19, alto/21)` medido con
  `useContainerSize`; sin scroll a 360×640 (spec responsive incluido).
- **E2E gate (ADR 0006):** seeds solo con `EXPO_PUBLIC_E2E=1`. Sentinelas:
  `test-win` (5 baterías en línea → un press gana), `test-lose` (drones
  convergen sobre robot idle), `test-power` (súper pegada al spawn + drone 0 en
  roaming, fase chase → 290 pts y luego derrota).
