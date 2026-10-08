# ADR 0018: Gate de dificultad SIEMPRE (modal en cada inicio) — memorice

- Estado: Aceptada
- Contexto: PLAN-MEMORICE-DIFICULTAD (cerrado 2026-10-08)
- Referencias: [ADR 0017](0017-modos-por-juego-gate-home.md) (gate de primer
  inicio), `app/index.tsx` (DIFFICULTY_GATES), `src/games/memorice/engine/difficulty.ts`

## Contexto

El gate de [ADR 0017](0017-modos-por-juego-gate-home.md) pregunta el modo solo
la PRIMERA vez y luego persiste la preferencia (no vuelve a preguntar). Para
memorice el usuario explicitó el requisito contrario: el modal de dificultad
debe aparecer **SIEMPRE** antes de cada inicio — la elección es del momento,
no un setting permanente. Memorice es además el tercer juego con modos y el
primero cuyo knob de dificultad cambia el TAMAÑO del tablero (nº de pares).

## Decisión

1. **Flag `always` en el gate** (`DIFFICULTY_GATES`): los gates con
   `always: true` abren el `DifficultyModal` en CADA tap de la card, sin
   consultar `preferencesRepository`; elegir navega con `?difficulty=`; el
   descarte ("Ahora no") se queda en el Home y no persiste nada (la pref no
   existe para estos juegos). El gate de primer inicio de serpiente/wakwak
   queda igual (persistencia + navegación directa).
2. **Dificultad = tamaño del tablero (nº de pares)**: fácil 8 (el juego
   original), medio 10, difícil 12. La run fija la dificultad al repartir;
   "Jugar de nuevo" y el reinicio del header REPITEN el nivel de la run (no
   re-abren el modal — la re-elección solo ocurre al volver al Home).
3. **Récord por nivel con la clave base = default** (extiende [ADR
   0017](0017-modos-por-juego-gate-home.md)): `recordGameId()` → `memorice`
   (fácil, retrocompatible con los récords pre-existentes de 8 pares),
   `memorice-medio`, `memorice-dificil`. Nota de contraste: en serpiente la
   clave base es el nivel MEDIO porque su default de siempre era medio; en
   memorice todo el historial ya era el nivel que ahora se llama fácil.
4. **Grilla estandarizada en 4 columnas** (playtest): fácil 4×4, medio 4×5,
   difícil 4×6 — misma forma mental de escanear en cualquier nivel y targets
   mayores en pantallas angostas (el nivel fácil ya no baja a 3 columnas).
5. **Dificultad de la run sin persistence en el screen**: el nivel llega por
   param de URL y la pantalla lo inicializa SINCRÓNICAMENTE (`useState` lazy
   con `parseMemoriceDifficulty`) — el primer reparto ya es del nivel
   correcto, sin la carrera del load async ni re-deal visible (el modal del
   Home provee el param en el flujo normal).

## Consecuencias

- Los juegos que quieran "preguntar SIEMPRE" usan `always: true` (una línea
  de data); los que quieran "preguntar una vez" usan el patrón ADR 0017.
- Sin preferencia persistida que migrar ni borrar para memorice (`prefKey`
  queda declarado por simetría pero sin uso en el flujo `always`).
- El knob de dificultad que altera la GEOMETRÍA del juego (no solo velocidad)
  exige validar layout por nivel: candado en unit (`layout.test.ts`) y E2E
  responsive con `?difficulty=` (sin scroll a 360×640 en las tres grillas).
- El store de un juego puede rezagar estado de fin de partida al desmontar
  (singleton a nivel módulo): los efectos de fin de partida que corren al
  montar deben re-leer el estado con `getState()`, no usar la closure del
  render (ver [GOTCHAS](../GOTCHAS.md)).
- Validación nativa (Android) del modal SIEMPRE + 3 niveles pendiente (ver
  ROADMAP).
