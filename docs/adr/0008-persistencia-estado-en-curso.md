# 0008 — Persistencia del estado en curso de una partida

**Estado:** Aceptada

## Contexto

La partida de solitario vivía solo en el store Zustand en memoria: salir de la
pantalla y reingresar repartía una partida nueva. El usuario pidió que el
"estado actual" sobreviva el ciclo salir/entrar (auto-resume).

Alternativas evaluadas:

1. **Reutilizar `preferencesRepository`** (tabla `preferences`, KV de strings):
   cero migraciones, pero semánticamente es "preferencias", no estado de juego;
   el crecimiento del patrón (más juegos con partida guardada) quedaba escondido
   en una clave genérica.
2. **Zustand `persist` middleware**: acopla el store del engine a la capa de
   persistencia y su hidratación async es incómoda con los repos duales.
3. **Nuevo repositorio `gameStateRepository`** en el patrón de persistencia dual
   (ADR 0002) con tabla propia: +1 migración, pero separación limpia y reutilizable
   por memorice/damas a futuro.

## Decisión

3. Nuevo repositorio **`gameStateRepository`** (par dual expo-sqlite +
   localStorage, ADR 0002) con tabla `game_state (game_id TEXT PRIMARY KEY,
   state TEXT)` — migración `SCHEMA_VERSION` 2. Interfaz async:
   `get(gameId) / set(gameId, json) / clear(gameId)`; el valor es un blob JSON
   serializado por el propio juego.

Complementarias:

- **Auto-resume sin preguntar**: al entrar al juego se restaura el estado
  guardado; si no hay (o es inválido), se reparte una partida nueva.
- **El blob lo define el juego** (`engine/persistence.ts` puro en cada juego:
  `serialize`/`parse` con validación defensiva). El repositorio solo mueve
  strings; un JSON corrupto degrada a reparto nuevo, nunca a crash.
- **No se persiste el historial de undo** (puede crecer a cientos de KB): tras
  restaurar, el undo queda disponible desde el próximo movimiento. Los flags de
  fin (`finishedAt`/`stuck`) tampoco: se recalculan con `endFlags`.
- **Guardar solo partidas en curso**: el save (debounce 300 ms vía
  `store.subscribe`) omite el estado virgen (`startedAt === null`) y los
  terminales (ganada/trabada). Se descarta el guardado al ganar, perder y
  reiniciar manualmente.
- **Los seeds E2E fuerzan reparto fresco** y limpian el guardado: el canal para
  alterar el reparto (ADR 0006) sigue cerrado en producción.

## Consecuencias

- La partida de solitario sobrevive salir/entrar (y recarga web).
- Agregar partida persistente a otro juego = su `engine/persistence.ts` + una
  llamada `get/set/clear(gameId)`; ninguna otra capa cambia.
- `game_state` crece a lo sumo una fila por juego (~2 KB cada una).
- El restore recalcula fin de partida: un estado "trabado" guardado (si
  existiera) restaure muestra su modal de derrota y se descarta.
