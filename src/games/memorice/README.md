# Memorice — documentación técnica

Juego de memoria: encontrar todos los pares de cartas con la menor cantidad de intentos.

## Estructura

```
memorice/
├── index.ts              # GameDefinition (contrato con src/core)
├── MemoriceScreen.tsx    # Pantalla: grid, header, modal de victoria, juice
├── engine/
│   ├── deck.ts           # Puro: mazo, shuffle Fisher-Yates con seed, PRNG mulberry32
│   ├── difficulty.ts     # Puro: niveles (nº de pares), recordGameId, parse del param
│   ├── layout.ts         # Puro: columnas y tamaño de carta (por total de cartas)
│   └── state.ts          # Store Zustand propio (no exportar fuera de esta carpeta)
├── components/
│   └── Card.tsx          # Carta con flip animado (Reanimated)
├── __tests__/            # deck.test.ts, difficulty.test.ts, layout.test.ts, state.test.ts
└── __e2e__/              # memorice.web.spec.ts (Playwright)
```

## Dificultades (PLAN-MEMORICE-DIFICULTAD)

- **La dificultad = nº de pares** (`engine/difficulty.ts`): fácil 8 (el juego
  original), medio 10, difícil 12.
- El Home muestra el modal de dificultad **SIEMPRE** antes de entrar (flag
  `always` en `DIFFICULTY_GATES` de `app/index.tsx`); la elección **no se
  persiste** (D6 del PLAN). Deep-link `/juego/memorice?difficulty=<nivel>`
  entra directo (canal del contenedor); sin param → fácil.
- La pantalla inicializa la dificultad **sincrónicamente** desde el param
  (`useState` lazy): el primer reparto ya tiene el nivel correcto, sin re-deal.
- Récords con claves separadas vía `recordGameId()` (patrón serpiente):
  `memorice` = fácil (retrocompatible), `memorice-medio`, `memorice-dificil`;
  el ScoreBoard del header consulta la clave de la run vía `onActiveGameId`.
- "Jugar de nuevo" y el reinicio del header repiten el nivel de la run.

## Juice (sonidos y haptics)

- Reutiliza los wrappers de `src/core/ui/` (regla del repo: los juegos no
  importan expo-haptics/audio directo): flip → `soundCardMove` +
  `hapticSelection`; match → `soundCardDrop` + `hapticDropCommit`; victoria →
  `soundGameWin` + `hapticGameWin`. Sin assets nuevos (players de solitario).
- El sonido respeta el switch global de Ajustes (`soundOn`, gateado en
  `core/ui/sound.ts`); los haptics son no-op en web.
- El flip-back del mismatch (timer de la UI) es silencioso a propósito.
- Prime en idle al montar: `primeAudioPlayers(['cardMove', 'cardDrop', 'gameWin'])`.

## Flujo de estado

- El store (`engine/state.ts`) es **lógica pura**: `flipCard`, `resolveMismatch`, `reset`.
  No tiene timers.
- El timing de UI vive en la pantalla: cuando `flipped.length === 2` (mismatch),
  un `useEffect` programa `resolveMismatch()` tras `MISMATCH_CLEAR_MS` (700 ms).
  Así los tests unitarios son deterministas y sin relojes.
- El cronómetro no usa ticks: `startedAt`/`finishedAt` son timestamps y la duración
  es un delta de `Date.now()` (inmune a throttling en background).
- El reporte de fin (`onGameEnd`) se emite **una única vez** (`hasReportedRef`).
  Es el único canal hacia persistencia; el juego nunca importa expo-sqlite.

## Decisiones de render

- **Views nativos + Reanimated**, sin Skia ([ADR 0001](../../../docs/adr/0001-render-sin-skia.md)).
- Flip en dos fases en `Card.tsx`: rotación 0° → 90° (se intercambia el contenido)
  → 0°, coordinada por `useAnimatedReaction` + `scheduleOnRN` (`showFace`).
  Evita el espejo de un `rotateY` continuo, que se ve mal en RN Web.
- Grid responsive con `columnsForWidth`: 4 columnas SIEMPRE — grilla
  estandarizada 4×4 (fácil), 4×5 (medio) y 4×6 (difícil) también en pantallas
  angostas (menos filas, cartas más grandes).

## Convenciones E2E

- Cada carta expone `accessibilityLabel="carta-N"` (N = posición 1-based, estable
  dentro de la partida). Son los selectores de Playwright (`exact: true` — sin
  exact, `carta-1` colisiona con `carta-10`...).
- El modal de victoria expone `accessibilityLabel="modal-victoria-memorice"`.
- El spec juega con un algoritmo determinista (mapa símbolo→posición); ojo con
  los clicks diferidos: un click sobre botón `disabled` (mismatch pendiente) lo
  ejecuta Playwright cuando se habilita, desincronizando el modelo del test.

## Cómo correr los tests

```bash
pnpm test -- memorice   # unitarios (deck + state)
pnpm e2e:web            # E2E web completo (orquestado por scripts/e2e.mjs)
pnpm e2e:ui             # E2E con UI mode para debug
```

## Limitaciones conocidas

- Score no escala con la cantidad de pares: `score = max(0, 100 - moves)`
  (convención "más es mejor", [ADR 0005](../../../docs/adr/0005-convencion-score.md));
  los récords se comparan solo dentro de cada nivel (claves separadas).
- El flip-back del mismatch (700 ms) es fijo; no parametrizado por dificultad.
- Sin seed en producción: cada partida baraja con `Math.random()`.
- Deep-link con `?difficulty=` arbitrario bypasea el modal (canal de
  serpiente; en producción solo llega del flujo normal del Home).

## Documentación relacionada

- `RULES.md` — reglas implementadas (fuente para QA; condensado in-app en
  `GameDefinition.rules`).
- `docs/ARCHITECTURE.md` — arquitectura general y UI compartida de core.
