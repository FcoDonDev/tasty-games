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
    SettingsModal.tsx       # draw 1|3 + undo on/off + tamaño del contenido (persistido)
  engine/
    deck.ts                 # Card/Suit, mazo 52, mulberry32, deal(seed), sentinels de test
    rules.ts                # PURO: validez de movimientos, hasAnyMove, isWon, scoreFor
    state.ts                # store Zustand: draw/recycle, moveCards, undo (snapshots), restore
    persistence.ts          # PURO: serialize/parse del estado en curso (blob JSON, validación defensiva)
    layout.ts               # PURO: geometría del tablero + hit-testing
  __tests__/                # unit (engine 100% puro, sin RN)
  __e2e__/                  # Playwright (web)
```

## Decisiones clave

- **Score (más es mejor):** `score = max(0, 1000 − 5·moves − floor(segundos/2) − 25·undos)` (`engine/rules.ts`,
  convención en [ADR 0005](../../../docs/adr/0005-convencion-score.md)).
- **Draw 1 / Draw 3 configurable:** setting in-game (`SettingsModal`), aplica al
  **próximo reparto** (cambiarlo a mitad de partida no rebaraja).
- **Undo:** deshabilitado por defecto. Al habilitarlo, cada acción guarda un snapshot inmutable de las pilas; cada undo penaliza el score. `moves` no se revierten.
- **Solo se reportan victorias** vía `onGameEnd` (paridad con memorice); el modal
  de sin-movimientos no genera récord (`hasAnyMove()` igualmente testeada).
- **Foundations indexadas por palo:** `foundations[i]` recibe `SUITS[i]` (♠ ♥ ♦ ♣).
- **Layout como fuente única:** `engine/layout.ts` calcula los rects de las 13 pilas a partir del tamaño del contenedor (`onLayout`, síncrono). El render (posición absoluta) y el hit-testing del drag consumen las mismas funciones — nada de `measure()` async.
- **Drag:** patrón reutilizable en `src/core/ui/drag/useDraggable.ts` (`Gesture.Pan` + shared values escritas en `onUpdate` + velocity handoff al settle/snap-back + `scheduleOnRN`). El punto de drop se computa como origen de la carta + traslación del gesto (coords del tablero, sin conversión a pantalla). Drop válido → `moveCards` con settle animado; inválido → snap-back con spring.
- **Auto-move a foundation:** doble tap (todas las plataformas, `maxDelay(500)`) o
  clic derecho (solo web) sobre una carta elegible (as, o la siguiente de una
  foundation) la envía directo a su foundation. Engine puro: `autoMoveToFoundation(from)`
  exige una sola carta (`canPickUp` + `length === 1`) y valida con
  `canDropOnFoundation`. **Vuelo animado:** commit inmediato + vuelo inverso
  reutilizando la maquinaria de settle del drag (`dragKey` + tx/ty compartidos:
  la carta se re-monta en la foundation desplazada hacia el origen y glisa con
  spring 400ms/0.8 hasta offset 0). El guard `finishFlight` por id evita que el
  callback de un spring interrumpido mate un vuelo posterior; agarrar la carta
  en vuelo interrumpe limpio (el `onStart` del Pan ya cancela las animaciones).
  Sonido/haptic se disparan antes del commit.
- **Guard de auto-move durante drag:** el clic derecho sobre la carta arrastrada
  (que sigue al cursor) no dispara el auto-move — `handleAutoMove` ignora el gesto
  si `dragRef.current !== null`; el Pan termina con snap-back limpio (evita la
  "carta flotando").
- **Sonidos:** draw → `soundCardMove()`, drop válido/auto-move → `soundCardDrop()`,
  snap-back → `soundCardInvalid()`, victoria → `soundGameWin()`. Infraestructura en
  core (`src/core/ui/sound.ts`, mismo patrón que haptics), toggle global en Ajustes
  (`useAppStore.soundOn`, persistido con clave `sound_enabled`, default on).
  **Latencia:** el sonido se dispara ANTES del commit del store (validación espejo
  de `commitMove` permite decidir el drop sin commitear) y `play()` es
  fire-and-forget tras `seekTo(0)`; los players se precalientan al montar la
  pantalla (`primeAudioPlayers`) — el primer movimiento no paga la creación del
  player. Ver [ADR 0011](../../../docs/adr/0011-metricas-performance.md) y
  PLAN-PERFORMANCE (métricas con `EXPO_PUBLIC_PERF_METRICS=1`).
- **Persistencia de settings:** `preferencesRepository` (KV dual sqlite/localStorage), claves `solitario.drawMode`, `solitario.undo` y `solitario.contentScale`. El cambio de drawMode aplica al próximo reparto; undo y tamaño del contenido, inmediato (`contentScale` vive en el store como pref de presentación y sobrevive a `reset()`/`restore()`).
- **Tamaño del contenido (setting, 3 niveles):** `Compacto 0.85 · Normal 1.0 ·
  Grande 1.2` (`ContentScale` en `engine/state.ts`). Implementado como **caja de
  contenido** en `PlayingCard` (`contentWidth/Height = base × scale`): los pips
  se posicionan en fracciones de esa caja (región centrada, nunca se recortan)
  y las esquinas escalan solo en TAMAÑO, ancladas a los bordes de la carta (a
  1.2 la caja excede el marco: offsets de esquina tomados de la caja se
  recortarían — verificado visualmente a 360px). La geometría del View y el
  hit-testing no cambian.
- **Animaciones (todas `transform`/`opacity` + `ReduceMotion.System`, UI thread):**
  - **Reparto:** onda por columna de tableau (`FadeIn` 180ms + delay 50ms/columna,
    < 550ms total), acotada a la fase `dealing` local de la pantalla — un
    `entering` permanente re-animaría en cada cambio de pila. El drag del
    tableau se habilita al terminar (timer `DEAL_ANIM_TOTAL_MS`); con seed E2E
    no hay animación (determinismo de los specs); con motion reducido, sin delays.
  - **Flip de carta:** dos fases 0°→90°→0° (patrón memorice, sin espejo rotateY
    en web), 250ms, contenido se intercambia en el cruce por 90°
    (`useAnimatedReaction` + `scheduleOnRN` — el cambio de `faceUp` es visible
    incluso con motion reducido). El progreso se inicializa según el `faceUp`
    actual y el primer run del effect no anima: una carta que ya nace boca
    arriba (deal/restore/seed) no voltea al montar. Los montajes ya faceUp
    (draw a waste, undo entre pilas) no animan — solo transiciones en caliente
    (revelado en tableau, revertido por undo).
  - **Fuera de alcance (anotados en ROADMAP):** shake en drop inválido (el
    snap-back + sonido ya lo comunican), cascada tipo Windows en victoria.
- **Auto-resume (partida en curso persistida, [ADR 0008](../../../docs/adr/0008-persistencia-estado-en-curso.md)):** al entrar se restaura el estado guardado en `gameStateRepository` (blob JSON de `engine/persistence.ts`). Guardado debounceado (300 ms) con `store.subscribe` — solo partidas en curso (omite el estado virgen y los terminales). Se descarta al ganar, perder (sin movimientos) o reiniciar manualmente. No se persiste el historial de undo (tras restaurar, disponible desde el próximo movimiento); `finishedAt`/`stuck` se recalculan con `endFlags`. JSON corrupto o forma inválida degrada a reparto nuevo, nunca a crash. Los seeds E2E fuerzan reparto fresco y limpian el guardado.
- **Cartas más grandes:** `PADDING 4` / `GAP 2` en `engine/layout.ts` — a 360px
  portrait la carta pasa de 45 a 48px (el ancho con 7 columnas es el límite
  duro; los offsets de fan y el hit-testing ya escalan con `cardWidth`).
- **Landscape móvil ([ADR 0009](../../../docs/adr/0009-landscape-movil-por-juego.md)):**
  único juego con `supportsLandscape: true` en el registro. Con
  `useLandscapeMobile()` (landscape real + dimensión corta ≤ 480) el contenedor
  pasa a fila con `GameHeader variant="vertical"` (rail de ~64px a la
  izquierda, labels a11y intactos) y la carta crece a ~71px: `computeLayout`
  no cambia, la carta la limita `alto/4.6` en vez del ancho. En nativo el
  contenedor libera la rotación (`unlockAsync`) mientras el juego está montado.
- **E2E gate:** `app/juego/[id].tsx` solo reenvía el query param `seed` cuando el build se exporta con `EXPO_PUBLIC_E2E=1` (lo hace `scripts/e2e.mjs`). Seeds soportados en `engine/deck.ts`: `test-win` (un drag gana) y `test-move` (reparto determinista para drag legal/ilegal). En producción no existe canal para alterar el reparto.

## Tests

- Unit: `pnpm test -- solitario` (engine puro: reglas —el más exhaustivo del
  proyecto—, store, layout, hit-testing, persistencia: round-trip
  serialize/parse, blob inválido → null, restore recalcula `stuck`).
- E2E web: `pnpm e2e:web` — drag legal, snap-back ilegal, victoria forzada → récord + ScoreBoard, salir; auto-move (doble tap, doble tap humano con pausa, clic derecho, clic derecho durante drag no mueve); auto-resume (la partida en curso se restaura tras recargar); setting tamaño del contenido (`solitario.contentScale.web.spec.ts`: aplica al instante, persiste tras recargar, drag con Grande activo candea geometría/hit-testing); landscape (`solitario.landscape.web.spec.ts`, viewport 740×360): rail a la izquierda, carta >60px, sin scroll, drag legal en modo rail.

**Labels a11y estables** (selectores de Playwright/Maestro): `solitario-card-<id>`,
`solitario-tableau-<i>`, `solitario-foundation-<i>`, `solitario-stock`,
`solitario-waste`, `modal-victoria-solitario`, `modal-derrota-solitario`,
`salir-solitario`, `solitario-undo`, `solitario-ajustes`,
`solitario-set-escala-c/n/g`, más los de core
(`salir/reiniciar/ayuda-solitario`, `modal-ayuda-solitario`, `record-solitario`).

## Regla de dependencias

Nada bajo `src/games/solitario/` importa de `src/games/memorice/` u otros juegos; solo `src/core/`. `mulberry32` está duplicado a propósito (extraerlo a core es refactor opcional — ver `docs/ROADMAP.md`).

## Documentación relacionada

- `RULES.md` — reglas implementadas (fuente para QA; condensado in-app en
  `GameDefinition.rules`).
- [ADR 0006](../../../docs/adr/0006-seeds-e2e-sentinelas.md) — seeds E2E
  sentinelas (`test-win`, `test-move`).
