# Damas (variante chilena)

Implementación del contrato `GameDefinition` para damas chilenas 8×8, 2 jugadores
locales en el mismo dispositivo (MVP sin récord — decisión L5 de la fase).

## Estructura

```
src/games/damas/
  index.ts                  # GameDefinition registrado en src/core/game-registry.ts
  DamasScreen.tsx           # pantalla: header (salir/turno/movimientos), board, modal de fin, drag wiring
  components/
    Piece.tsx               # ficha visual (peón/dama, color por jugador) + gesto Pan
  engine/
    board.ts                # PURO: tablero 8×8 (índices 0..63), Piece, setup, sentinels de test
    rules.ts                # PURO: movimientos legales, captura obligatoria, multi-salto, coronación, fin
    state.ts                # store Zustand: turno, applyMove, reset (sin persistencia)
    layout.ts               # PURO: geometría del tablero + hit-testing por casilla
  __tests__/                # unit (engine 100% puro, sin RN)
  __e2e__/                  # Playwright (web)
```

## Decisiones clave

- **Reglas chilenas (L1):** peón mueve 1 diagonal adelante y captura adelante y
  atrás; dama "vuela" (mueve/captura cualquier distancia en diagonal).
- **Captura obligatoria con elección libre (L2):** si existe captura, es
  obligatoria (no se exige la de mayor cantidad, a diferencia de damas
  internacionales). La cadena de multi-salto continúa obligatoriamente mientras
  haya capturas desde la casilla de aterrizaje; solo se ofrecen cadenas maximales.
- **Fichas capturadas como bloqueo:** durante una cadena, las fichas ya
  capturadas permanecen en el tablero (no se pueden saltar, capturar dos veces
  ni aterrizar sobre ellas). El origen de la ficha que se mueve queda vacío
  durante la generación de la cadena (se puede volver a pasar/aterrizar allí).
- **Coronación termina el turno (L3):** un peón que aterriza en su fila de
  coronación se corona y la cadena termina ahí.
- **Fin de juego (L4):** pierde quien queda sin fichas o sin movimientos
  legales. No hay regla de tablas en el MVP.
- **Sin récord (L5):** `onGameEnd` no se invoca; el modal de fin solo anuncia al
  ganador. Score/persistencia se definirán en Fase 4 (IA).
- **Drag & drop:** mismo patrón de solitario (`src/core/ui/drag/useDraggable.ts`):
  lift con spring (1.08), targets válidos resaltados (casillas destino con borde
  y glow), settle animado (120 ms) en drop válido y snap-back con spring en
  drop inválido. El drop point es el centro de la casilla de origen + traslación
  del gesto; `hitTestSquare` (coords del tablero) decide el destino.
- **Layout como fuente única:** `engine/layout.ts` calcula `square`/posiciones a
  partir del tamaño del contenedor; render e hit-test consumen las mismas funciones.
- **E2E gate:** seeds solo con `EXPO_PUBLIC_E2E=1` (lo hace `scripts/e2e.mjs`).
  Sentinels en `engine/board.ts`: `test-capture` (captura obligatoria
  determinista) y `test-win` (un drag gana). Tableros artesanales fijos, sin PRNG.

## Tests

- Unit: `pnpm test -- damas` (55 casos: board, rules —el más exhaustivo—, state, layout).
- E2E web: `pnpm e2e:web` — snap-back ilegal (captura obligatoria), captura legal
  con cambio de turno, victoria forzada → modal **sin récord**, jugar de nuevo, salir.

## Regla de dependencias

Nada bajo `src/games/damas/` importa de otros juegos; solo `src/core/`
(`useDraggable`, tema, tipos del contrato).
