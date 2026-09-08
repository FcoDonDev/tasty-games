# Wak Wak — Reglas (QA)

Maze-chase en tiempo real, un jugador, laberinto propio 19×21.

## Objetivo

Recoger **todas las baterías** del laberinto (incluidas las 4 súper baterías)
antes de perder las 3 vidas.

## Elementos del tablero

- **Robot aspiradora** (jugador): arranca en (f15,c9), avanza en línea recta
  hasta un muro; gira solo al llegar al centro de una celda.
- **Baterías** (cuadrados dorados): ~180 repartidas; ×10 puntos cada una.
- **Súper baterías** (cuadrados grandes claros): 4, en las esquinas
  (f1c1, f1c17, f15c1, f15c17); ×50 puntos.
- **Chip dorado** (verde): aparece en (f11,c9) al alcanzar el 50% de
  comestibles consumidos; dura 10 s; ×100 puntos. Una vez por partida.
- **Corral central** con puerta en su borde superior: los 4 drones arrancan
  dentro y salen de forma escalonada.
- **Túnel** (fila 9): los bordes izquierdo/derecho se teletransportan entre sí.

## Vidas y derrota

- 3 vidas (🔋 en el HUD). Si un drone toca al robot (distancia < 0.7 celdas):
  −1 vida, posiciones reiniciadas (robot al spawn, drones al corral, baterías
  intactas).
- Con 0 vidas: derrota. El score obtenido se conserva para el récord.

## Súper carga (modo power)

- Al comer una súper batería: 6 s en que los drones huyen (más lentos) y el
  robot puede **comerlos** (×200 puntos cada uno).
- El drone comido desaparece y reaparece en el corral tras 6 s.
- Al activarse, los drones mantienen rumbo hasta su próxima intersección y ahí
  huyen; al terminar el modo vuelven a cazar.

## Drones (IA por personalidad)

| # | Nombre | Color | Comportamiento (modo chase) |
|---|--------|-------|------------------------------|
| 0 | Cazador | naranja | Persegue la celda del robot |
| 1 | Emboscador | violeta | Apunta 4 celdas adelante del robot (corta el paso) |
| 2 | Caprichoso | celeste | Persigue; ~25% de las decisiones deambula al azar |
| 3 | Tímido | rosa | Persigue de lejos; si está a ≤6 celdas, huye a su esquina |

- Fases globales: **scatter** (5 s: cada drone va a su esquina) y **chase**
  (15 s) alternando; al alternar, los drones invierten su rumbo.
- En intersecciones eligen la dirección que minimiza la distancia euclidiana al
  objetivo; **no pueden revertir** salvo que sea la única salida.
- Velocidades (celdas/s): robot 5.5 · drone chase 4.6 · drone huida 3.2 ·
  drone en corral 3.

## Victoria

Al recoger el último comestible: victoria + bonus de **100 puntos por vida
restante**. El récord guarda score, duración y resultado.

## Puntaje (resumen)

| Evento | Puntos |
|---|---|
| Batería | +10 |
| Súper batería | +50 |
| Drone recogido (modo power) | +200 |
| Chip dorado | +100 |
| Bonus de victoria | +100 × vidas restantes |

## Controles

- **Swipe** sobre el tablero (dirección dominante del gesto).
- **D-pad** bajo el tablero (accesible, labels `wakwak-arriba/abajo/izquierda/derecha`).
- **Flechas del teclado** (web).
- **Pausa** en el header (⏸): congela la simulación; reanudar desde el modal.
- El swipe opuesto al movimiento actual revierte la marcha de inmediato.

## Seeds E2E (solo con `EXPO_PUBLIC_E2E=1`)

- `test-win`: 5 baterías en línea a la izquierda del spawn; drones no salen; un
  swipe a la izquierda gana.
- `test-lose`: drones salen de inmediato; robot quieto es atrapado 3 veces.
- `test-power`: súper pegada al spawn, drone 0 en roaming en su camino, fase
  chase inicial → 290 pts (4 baterías + súper + drone) y luego derrota.
