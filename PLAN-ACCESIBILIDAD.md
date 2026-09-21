# PLAN-ACCESIBILIDAD — Bajar la barrera de entrada

> Estado: PLAN aprobado (cubicación cerrada con el usuario). Implementación NO iniciada.
> Orden de ejecución: T1 → T2 → T3 → T4. Cada tarea cierra con la verificación
> estándar verde antes de pasar a la siguiente.

## Contexto y objetivo

Bajar la barrera de entrada para jugadores con poca velocidad de reacción
(3ª edad) y poco manejo de tecnología:

1. **Serpiente** necesita niveles de dificultad y controles visibles (D-pad).
2. **Wak Wak** necesita un modo fácil con laberinto reducido (personajes y
   escenario ×2).
3. **Damas** debe ocultarse hasta implementar CPU como contrincante y mejorar
   la UI/UX multijugador.

Cubre juegosexistentes y core (registro, tipos). No crea juegos nuevos.

## Decisiones de diseño (aprobadas con el usuario)

| # | Decisión | Elección | Alternativas descartadas |
|---|---|---|---|
| D1 | Récords por dificultad | **Claves separadas** (`serpiente-facil`, `serpiente-dificil`, `wakwak-facil`): sin migración de DB ni schema; la clave base (`serpiente`, `wakwak`) = modo normal/medio, retrocompatible con récords existentes | Columna `difficulty` en `game_records` (SCHEMA_VERSION +1): más trabajo y riesgo sin beneficio real |
| D2 | Ubicación D-pad serpiente | **Ambas** (bajo el tablero —default— u overlay translúcido inferior) + **tamaño configurable S/M/XL** | Solo bajo el tablero / solo overlay |
| D3 | Wak Wak fácil | **Toggle Fácil/Normal que abarca los 8 niveles**: UN layout reducido compartido con velocidades propias por nivel en fácil | Pista fácil aparte de 1 nivel / 8 layouts distintos |
| D4 | Damas oculta | **Solo del listado del Home**: deep link `/juego/damas` sigue vivo (QA manual y specs de performance intactos) | Ocultar también la ruta (404) |

## Referencias (buenas prácticas, punto 2 del requerimiento)

- [Google Playables design best practices](https://developers.google.com/youtube/gaming/playables/certification/best_practices_design):
  targets táctiles **≥48dp con separación ≥8dp**, estilos por estado de botón,
  soporte de teclado para toda la navegación.
- Patrón dominante en clones de Snake web (portrait): **D-pad visible bajo el
  tablero** + swipe como modo alternativo; tamaño XL recomendado para
  dispositivos chicos o jugadores que prefieren botones (snakegame3d).
- Escritorio: teclado (flechas/WASD) ya cubierto en serpiente y wakwak; en PC
  el D-pad no se muestra.

## Tareas

### T1 — Damas oculta del listado (S, ~3 h)

- [ ] `GameDefinition` (`src/core/types.ts`): campo opcional `hidden?: boolean`.
- [ ] `src/games/damas/index.ts`: `hidden: true` + nota en `RULES`/README.
- [ ] `app/index.tsx`: filtrar `GAME_REGISTRY` para el listado del Home
      (`getGameById` intacto → deep link sigue funcionando).
- [ ] Specs: ajustar `src/core/__e2e__/responsive.web.spec.ts` (candea la tile
      "Jugar Damas" en el Home y su posición en la grilla) y revisar
      `pwa.web.spec.ts` / specs del Home si cuentan juegos.
- [ ] Specs que NO cambian: `performance.web.spec.ts` (navega por deep link) y
      `src/games/damas/__e2e__/damas.web.spec.ts` (deep link).

### T2 — Serpiente: niveles de dificultad (M, ~1 día)

- [ ] `engine/rules.ts`: tipo `Difficulty = 'facil' | 'medio' | 'dificil'`;
      tabla de velocidad por dificultad; `stepMs(eaten, difficulty)`:
      - **Fácil**: inicio ~180ms (≈5,5 celdas/s), -2/comida, piso 110ms
        (nunca supera ≈9 celdas/s).
      - **Medio**: números actuales (140 / -4 / piso 70).
      - **Difícil**: inicio ~110ms, -5/comida, piso ~55ms.
      `advance()` usa la dificultad del estado (sin parámetros extra en el loop).
- [ ] `SerpienteConfig` + `GameState` (campo `difficulty`) + store: el reset
      toma la dificultad vigente; `setDifficulty` en el store (si el juego está
      `playing`, se aplica al reiniciar — sin cambios a mitad de partida, o
      pausa+aplicar en vivo: decidir al implementar y documentar).
- [ ] Seeds sentinelas E2E: la seed fuerza la dificultad (patrón `wrap`); el
      config manda sobre la preferencia persistida.
- [ ] Récords (D1): `SerpienteScreen` calcula el gameId según dificultad
      (`serpiente` / `serpiente-facil` / `serpiente-dificil`). El resto de la
      app (best, ScoreBoard) no cambia.
- [ ] UI: selector fácil/medio/difícil en `SettingsSheet.tsx` +
      persistencia `PREF_DIFFICULTY`; indicar dificultad en HUD/EndOverlay.
- [ ] Tests: `rules.test.ts` por nivel (velocidad inicial, aceleración, piso)
      + regresión; E2E: jugar partidas fácil y difícil vía seed.

### T3 — Serpiente: controles visibles (M-L, ~1,5 día)

- [ ] `ControlMode` suma `'botones'` (tercer modo junto a gestos/flotante).
- [ ] Nuevo componente D-pad (4 direcciones, `PressableScale`, feedback press
      ya aprobado): targets ≈64px en XL (≥48dp mínimo con separación ≥8dp),
      `accessibilityLabel` estables (`serpiente-btn-arriba`, etc.).
- [ ] Al presionar un botón se encola la dirección vía `queued` (engine ya lo
      soporta); haptics con `haptics` wrapper (`hapticSelection`).
- [ ] Configurable (D2): ubicación (bajo el tablero —default— / overlay
      translúcido inferior) y tamaño (S/M/XL) en Ajustes, persistidos.
- [ ] Layout D4: se deriva del tamaño real medido (`useContainerSize`); a
      360×640 el tablero sigue sin scroll con el D-pad bajo el tablero.
- [ ] En escritorio (no táctil): mantener solo teclado; sin D-pad.
- [ ] Tests unitarios del componente + E2E: specs de serpiente migrados a
      botones para estabilidad (targets reales vs swipes).

### T4 — Wak Wak: toggle Fácil/Normal con laberinto reducido ×2 (L, ~2,5-3 días)

- [ ] Refactor `engine/maze.ts`: parametrizar dimensiones (hoy `MAZE_COLS=19`,
      `MAZE_ROWS=21` son constantes de módulo). Blast radius mecánico:
      `rules.ts`, `seed.ts`, `ai.ts`, `renderer/reanimated/MazeLayer.tsx`,
      popups en `WakWakScreen.tsx`, tests.
- [ ] **Sesión de diseño previa** (con el usuario, igual que el layout v3):
      iterar el laberinto reducido (~11×13, solo pasillos, corral sellado,
      4 súper, túnel) en `preview/LaberintoPreview.tsx` con `validateLayout`
      hasta aprobarlo. Regla dura: sin áreas abiertas 3×3.
- [ ] Tabla de velocidades Fácil por nivel (menor que Normal en cada uno:
      nivel 1 fácil ≈ robot 4,0 celdas/s; power más largo, scatter más largo).
- [ ] Corral reducido → **2 drones** en Fácil (los otros 2 quedan fuera del
      spawn; verificar IA/cadenas/combo con 2).
- [ ] Toggle Fácil/Normal en el picker de niveles + persistencia; el modo
      Fácil corre los 8 niveles sobre el layout reducido.
- [ ] Récords (D1): `wakwak-facil` en `onGameEnd` cuando corre en Fácil.
- [ ] Seeds sentinelas nuevos para el laberinto reducido (los pins actuales —
      fila 15, corral, scatter — no aplican al layout nuevo).
- [ ] Tests: invariantes del layout nuevo (`maze.test.ts`), `levels.test.ts`
      con ambas tablas, `rules.test.ts`/`seed.test.ts` parametrizados, E2E
      fácil (jugar nivel 1 fácil hasta ganar/perder vía seed).

### T5 — Verificación estándar (por tarea y al cierre)

- [ ] `pnpm typecheck` → `pnpm test` → `node scripts/e2e.mjs` (suite entera
      verde; a la fecha 72 passed + 14 perf-skips, crece con los nuevos specs).
- [ ] Verificación visual puntual en dev server (viewport 360×640): D-pad S/M/XL
      y overlay; tamaño del laberinto fácil; selector de dificultad.
- [ ] Docs al cierre: README/RULES de serpiente, wakwak y damas; ROADMAP
      (CPU damas queda como pendiente), ARCHITECTURE/UI-UX si aplica.

## Notas / hallazgos

(completar durante la implementación)

- Cubicación previa (plan mode): total estimado ~5-5,5 días. T4 es el más
  complejo por el refactor de dimensiones del laberinto y el diseño del layout.
- El renderer de wakwak ya es paramétrico en `cellSize` → con ~11×13 celdas el
  escalado ×2 sale casi gratis en render; el costo real está en el engine.
- `parseLayout` ya lanza ante layouts inválidos y `validateLayout` candea
  callejones/áreas 3×3/pines: reutilizar para el laberinto fácil.

## Migración de hallazgos al cierre (destinos)

- Lección técnica RN/Reanimated/Jest/Playwright → `docs/GOTCHAS.md`.
- Decisión transversal (D1 récords por clave de dificultad; D2 controles) →
  ADR nuevo en `docs/adr/`.
- Detalles por juego → `src/games/<id>/README.md`.
- CPU damas + UI/UX multijugador (pendiente que motivó T1) → `docs/ROADMAP.md`.
