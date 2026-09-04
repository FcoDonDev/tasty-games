# Memorice — documentación técnica

Juego de memoria: encontrar todos los pares de cartas con la menor cantidad de intentos.

## Estructura

```
memorice/
├── index.ts              # GameDefinition (contrato con src/core)
├── MemoriceScreen.tsx    # Pantalla: grid, header, modal de victoria
├── engine/
│   ├── deck.ts           # Puro: mazo, shuffle Fisher-Yates con seed, PRNG mulberry32
│   └── state.ts          # Store Zustand propio (no exportar fuera de esta carpeta)
├── components/
│   └── Card.tsx          # Carta con flip animado (Reanimated)
├── __tests__/            # deck.test.ts, state.test.ts
└── __e2e__/              # memorice.web.spec.ts (Playwright)
```

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

- **Views nativos + Reanimated**, sin Skia (decisión D1 del plan raíz).
- Flip en dos fases en `Card.tsx`: rotación 0° → 90° (se intercambia el contenido)
  → 0°, coordinada por `useAnimatedReaction` + `runOnJS` (`showFace`).
  Evita el espejo de un `rotateY` continuo, que se ve mal en RN Web.
- Grid `FlatList numColumns` responsive: 4 columnas (3 si `width < 420`).

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

- Score no escala con la cantidad de pares: `score = max(0, 100 - moves)`.
- El flip-back del mismatch (700 ms) es fijo; no parametrizado por dificultad.
- Sin seed en producción: cada partida baraja con `Math.random()`.
