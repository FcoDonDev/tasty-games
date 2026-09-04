# Reglas — Memorice

Documento para QA y para el futuro modal de ayuda in-app. Describe las reglas
**tal como están implementadas**, no las teóricas.

## Objetivo

Encontrar todos los pares de cartas iguales memorizando sus posiciones.

## Configuración

| Parámetro | Valor implementado |
|---|---|
| Cartas | 16 (8 pares) |
| Símbolos | Emojis de frutas/verduras (`engine/deck.ts: MEMORICE_SYMBOLS`) |
| Baraja | Aleatoria en cada partida (Fisher-Yates con `Math.random()`) |
| Grid | 4 columnas (3 en pantallas angostas, ancho < 420 px) |

## Reglas de juego

1. Todas las cartas empiezan boca abajo (mostran `?`).
2. **Tap en una carta** la voltea. Solo puede haber **máximo 2 cartas boca arriba**
   a la vez; mientras haya 2 sin resolver, el resto queda deshabilitado.
3. **Primera carta del turno**: queda boca arriba esperando la segunda.
4. **Segunda carta**:
   - Si el símbolo coincide → **par encontrado**: ambas quedan boca arriba fijas
     (resaltadas con el color primario) y se cuenta 1 intento.
   - Si no coincide → **fallo**: se cuenta 1 intento y ambas se voltean boca abajo
     automáticamente a los **700 ms**.
5. Tap en una carta boca arriba o ya emparejada: ignorado (no cuenta intento).
6. El **cronómetro arranca** con el primer flip de la partida.

## Fin del juego

- **Victoria**: cuando los 8 pares están encontrados. Aparece un modal con
  puntaje e intentos, y opciones "Jugar de nuevo" y "Salir".
- No hay derrota ni límite de tiempo: se puede seguir intentando indefinidamente.

## Puntaje

- `score = max(0, 100 - intentos)` — **más puntaje es mejor** (convención global
  de la app, ver `src/core/types.ts`).
- Partida perfecta: 8 intentos → 92 puntos.
- Solo se registra el resultado al ganar (`won: true` siempre al terminar).
- El récord se guarda al cerrar el modal (vía el contenedor del juego, no el
  juego mismo).

## Fuera de alcance del MVP

- Dificultades (4×4 / 6×6 / pares con tiempo).
- Multijugador por turnos.
- Sonido/animación de celebración.
