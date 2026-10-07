# ADR 0017: Modos por juego, récord por clave y gate de primer inicio en el Home

- Estado: Aceptada
- Contexto: PLAN-ACCESIBILIDAD (barrera de entrada, cerrado 2026-10-07)
- Referencias: `src/games/serpiente/engine/rules.ts` (T2), `src/games/wakwak/engine/{maze,levels}.ts` (T4), `src/core/ui/DifficultyModal.tsx` + `app/index.tsx` (T5)

## Contexto

El proyecto se orienta a un público de 3ª edad: la barrera de entrada de
wakwak (laberinto 19×21 con 4 drones, escenario chico) y la falta de
graduación explícita de dificultad bloqueaban a jugadores novatos. Cada juego
decidía "qué es difícil" de forma distinta y el Home navegaba siempre directo
a la pantalla con sus defaults.

## Decisión

1. **Modo = knob de la partida, no mutación en caliente (D5/D8)**: la
   dificultad/modo queda fijado al crear el `GameState` (`state.difficulty` en
   serpiente; `state.maze`+`state.mode` en wakwak — el laberinto viaja en el
   estado como única fuente de geometría). Cambiar el setting aplica a la
   PRÓXIMA run (en serpiente reinicia si hay partida activa).
2. **Récord por clave del modo (D1, extiende [ADR 0016](0016-best-score-sin-filtro-won.md))**:
   `recordGameId(mode)` → `serpiente-facil/dificil`, `wakwak-facil`; el modo
   medio/normal conserva la clave base. El ScoreBoard del chrome consulta la
   clave de la run activa (`onActiveGameId`, prop `refreshKey`).
3. **Estructuras paramétricas, no copias (T4a/T4b)**: el laberinto de wakwak
   es auto-descrito (`MazeData` con cols/rows/bonusCell); los helpers aceptan
   el maze (`toIndex/rowOf/colOf(…, cols)`, `homeCorners(maze)`,
   `parseLayout(layout, expectedDrones)`, `validateLayout(layout, pins?)` con
   pines por modo). El renderer recibe dims por props (`MazeLayer` maze/
   bonusCell, `EntitiesLayer` droneCount). Los sentinelas E2E existentes y
   fixtures de perf pinnean `'normal'` (baselines ADR 0011 comparables).
4. **Gate de primer inicio en el Home (D-T5-1..4)**: los juegos con modos se
   declaran como data (`DIFFICULTY_GATES` en `app/index.tsx`: pref key +
   opciones + default). Al tocar la card se lee la pref EN EL TAP: con pref →
   navegación directa pasando `difficulty=<pref>` como param de ruta (la run
   arranca ya con esa preferencia — sin la carrera del load async del
   screen); sin pref → `DifficultyModal` genérico (core/ui) ANTES de
   navegar. Elegir = persistir + navegar con param; descartar ("Ahora no")
   = persistir el default y quedarse en el Home (no vuelve a preguntar).
5. **`difficulty` viaja SIEMPRE por URL** (fuera del gate `EXPO_PUBLIC_E2E`
   de `[id].tsx`): es elección del usuario, no canal de tampering; el `seed`
   sigue gateado ([ADR 0006](0006-seeds-e2e-sentinelas.md)). La prioridad en
   cada juego: config del sentinela > URL param > setting del usuario.
6. **Wakwak fácil (T4)**: layout propio 11×13 aprobado por el usuario
   (combs verticales, spawn central con corredor completo, corral de 2
   drones, 4 súper, chip en el spawn, 1 fila de túnel) + `LEVELS_FACIL` con
   invariantes medibles (robot/drone ≥1.3, power ≥1.5×, Elroy off) →
   personajes y escenario ×2 al render por cellSize derivado del maze.

## Consecuencias

- Agregar un juego con modos = entrada en `DIFFICULTY_GATES` (hoy: mapa
  local; si un tercero suma modos, generalizar a un campo del registry).
- Los juegos con modo exponen el modo activo en HUD/overlay (wakwak:
  "FÁCIL" en HUD y resumen final; serpiente: dificultad en Ajustes).
- Deep-link directo sin param: primera run usa el default del screen (race
  de pref async aceptable; el flujo normal pasa por el Home).
- Validación nativa (Android) de T2/T4/T5 pendiente — todo verificado en web
  (ver ROADMAP).
