# Solitario (Klondike)

Implementación del contrato `GameDefinition` para Klondike clásico (draw 1/3 configurable).

## Estructura

```
src/games/solitario/
  index.ts                  # GameDefinition registrado en src/core/game-registry.ts
  SolitarioScreen.tsx       # pantalla: header, board, modales, drag wiring
  components/
    PlayingCard.tsx         # carta visual (palo/rango/dorso)
    Pile.tsx                # pila (stock/waste/foundation/tableau) + gestos por carta
    SettingsModal.tsx       # draw 1|3 + undo on/off (persistido)
  engine/
    deck.ts                 # Card/Suit, mazo 52, mulberry32, deal(seed), sentinels de test
    rules.ts                # PURO: validez de movimientos, hasAnyMove, isWon, scoreFor
    state.ts                # store Zustand: draw/recycle, moveCards, undo (snapshots)
    layout.ts               # PURO: geometría del tablero + hit-testing
  __tests__/                # unit (engine 100% puro, sin RN)
  __e2e__/                  # Playwright (web)
```

## Decisiones clave

- **Score (más es mejor):** `score = max(0, 1000 − 5·moves − floor(segundos/2) − 25·undos)` (`engine/rules.ts`).
- **Undo:** deshabilitado por defecto. Al habilitarlo, cada acción guarda un snapshot inmutable de las pilas; cada undo penaliza el score. `moves` no se revierten.
- **Foundations indexadas por palo:** `foundations[i]` recibe `SUITS[i]` (♠ ♥ ♦ ♣).
- **Layout como fuente única:** `engine/layout.ts` calcula los rects de las 13 pilas a partir del tamaño del contenedor (`onLayout`, síncrono). El render (posición absoluta) y el hit-testing del drag consumen las mismas funciones — nada de `measure()` async.
- **Drag:** patrón reutilizable en `src/core/ui/drag/useDraggable.ts` (`Gesture.Pan` + shared values + `runOnJS`). El punto de drop se computa como origen de la carta + traslación del gesto (coords del tablero, sin conversión a pantalla). Drop válido → `moveCards`; inválido → snap-back animado (`withTiming`).
- **Persistencia de settings:** `preferencesRepository` (KV dual sqlite/localStorage), claves `solitario.drawMode` y `solitario.undo`. El cambio de drawMode aplica al próximo reparto; undo, inmediato.
- **E2E gate:** `app/juego/[id].tsx` solo reenvía el query param `seed` cuando el build se exporta con `EXPO_PUBLIC_E2E=1` (lo hace `scripts/e2e.mjs`). Seeds soportados en `engine/deck.ts`: `test-win` (un drag gana) y `test-move` (reparto determinista para drag legal/ilegal). En producción no existe canal para alterar el reparto.

## Tests

- Unit: `pnpm test -- solitario` (engine puro: reglas, store, layout).
- E2E web: `pnpm e2e:web` — drag legal, snap-back ilegal, victoria forzada → récord + ScoreBoard, salir.

## Regla de dependencias

Nada bajo `src/games/solitario/` importa de `src/games/memorice/` u otros juegos; solo `src/core/`. `mulberry32` está duplicado a propósito (extraerlo a core es refactor opcional).
