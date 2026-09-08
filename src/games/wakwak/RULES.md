# Wak Wak — Reglas (QA)

Maze-chase en tiempo real, un jugador, laberinto propio 19×21.

## Objetivo

**Run continua de 8 niveles**: recoger todas las baterías del laberinto para
superar cada nivel; la dificultad sube con el nivel. La run termina al perder
las vidas o al superar el nivel 8.

## Niveles (progresión)

- 8 niveles definidos (`engine/levels.ts`); mismo laberinto, knobs distintos:
  velocidades, duración del power, fases scatter/chase y salida del corral.
- Nivel 1 más fácil que el MVP; el nivel 3 reproduce los números del MVP; el
  8 es más duro que el MVP.
- Al superar un nivel: interstitial "NIVEL N+1" (~1.5 s) y avanza solo,
  conservando score y **+1 vida** (cap 5).
- **Elroy**: desde el nivel 2, cuando quedan pocas baterías (umbral por nivel)
  el drone Cazador acelera ~5% (solo chase, fuera de power).
- El nivel máximo alcanzado se desbloquea y persiste; se puede iniciar una run
  desde cualquier nivel desbloqueado (botón `NVL` en el header).

## Elementos del tablero

- **Robot aspiradora** (jugador): arranca en (f15,c9), avanza en línea recta
  hasta un muro; gira solo al llegar al centro de una celda.
- **Baterías** (cuadrados dorados): ~180 repartidas; ×10 puntos cada una.
- **Súper baterías** (cuadrados grandes claros): 4, en las esquinas
  (f1c1, f1c17, f15c1, f15c17); ×50 puntos.
- **Chip dorado** (verde): aparece en (f11,c9) al alcanzar el 50% de
  comestibles consumidos; dura 10 s; ×100 puntos. Una vez por nivel.
- **Corral central** con puerta en su borde superior: los 4 drones arrancan
  dentro y salen de forma escalonada (más rápido por nivel).
- **Túnel** (fila 9): los bordes izquierdo/derecho se teletransportan entre sí.

## Vidas y derrota

- 3 vidas (🔋 en el HUD; +1 por nivel superado, cap 5). Si un drone toca al
  robot (distancia < 0.7 celdas): −1 vida, posiciones reiniciadas (robot al
  spawn, drones al corral, baterías intactas) y **el combo se pierde**.
- Con 0 vidas: derrota. El score total de la run se guarda para el récord.

## Súper carga (modo power)

- Al comer una súper batería: modo power (duración por nivel; 6 s en el nivel
  3) en que los drones huyen (más lentos) y el robot puede **comerlos**.
- **Combo (cadena)**: cada drone comido dentro del MISMO power duplica los
  puntos del anterior: 200 → 400 → 800 → 1600 → 3200 (tope). Se reinicia al
  expirar el power o al ser atrapado. El HUD muestra `⚡ COMBO ×N`.
- Presentación: hit-stop paramétrico (60 ms + 25 ms por eslabón, cap 150 ms),
  popup con los puntos, blip con pitch creciente; el HUD anuncia la cadena.
- El drone comido desaparece y reaparece en el corral tras 6 s.
- Cuando el power está por expirar (<⅓ restante), los drones parpadean.
- **Slow-mo**: con un drone acercándose a <1.2 celdas, el tiempo baja a la
  mitad (con rampa) para reaccionar; vuelve a 1 al alejarse.

## Drones (IA por personalidad)

| # | Nombre | Color | Comportamiento (modo chase) |
|---|--------|-------|------------------------------|
| 0 | Cazador | naranja | Persegue la celda del robot; acelera ×1.05-1.06 en modo Elroy |
| 1 | Emboscador | violeta | Apunta 4 celdas adelante del robot (corta el paso) |
| 2 | Caprichoso | celeste | Persigue; ~25% de las decisiones deambula al azar |
| 3 | Tímido | rosa | Persigue de lejos; si está a ≤6 celdas, huye a su esquina |

- Fases globales: **scatter** (7 s en nivel 1, acorta por nivel: cada drone va
  a su esquina) y **chase** alternando; al alternar, los drones invierten su
  rumbo.
- En intersecciones eligen la dirección que minimiza la distancia euclidiana al
  objetivo; **no pueden revertir** salvo que sea la única salida.
- Velocidades por nivel (nivel 3 = MVP, celdas/s): robot 5.5 · drone chase 4.6 ·
  drone huida 3.2 · drone en corral 3.

## Victoria

Al superar el nivel 8: **run completa** + bonus de **100 puntos por vida
restante** (solo el nivel final otorga este bonus). El récord guarda el score
total de la run.

## Puntaje (resumen)

| Evento | Puntos |
|---|---|
| Batería | +10 |
| Súper batería | +50 |
| Drone recogido (modo power), eslabón N del combo | +200·2^(N−1), cap 3200 |
| Chip dorado | +100 |
| Bonus de run completa (nivel 8) | +100 × vidas restantes |

## Controles

- **PC web (teclado):** flechas + WASD.
- **Táctil (nativo y web móvil):** modo configurable (⚙ en el header):
  - **Gestos** (default): swipe en cualquier parte de la pantalla; la dirección
    se emite al cruzar el umbral, sin esperar a levantar el dedo.
  - **Flotante**: pad invisible que nace donde apoyes el dedo; cada dirección
    re-centra el origen (histéresis); anillo de feedback opcional.
- **Pausa** en el header (⏸): congela la simulación; reanudar desde el modal.
- **Niveles** en el header (`NVL n`): selector de nivel de inicio (solo
  desbloqueados).
- El input opuesto al movimiento actual revierte la marcha de inmediato.

## Seeds E2E (solo con `EXPO_PUBLIC_E2E=1`)

- `test-win`: 5 baterías en línea a la izquierda del spawn; drones no salen;
  un swipe a la izquierda gana. Fijado al **nivel 8** (cierra la run).
- `test-level`: igual layout, fijado al **nivel 1** → interstitial "NIVEL 2" y
  avance automático (score conservado, +1 vida).
- `test-lose`: drones salen de inmediato; robot quieto es atrapado 3 veces.
- `test-power`: súper pegada al spawn, drone 0 en roaming en su camino, fase
  chase inicial → 290 pts (4 baterías + súper + drone) y luego derrota.
- `test-combo`: súper pegada al spawn + dos drones alineados en la fila del
  robot, fase chase inicial → 650 pts (súper + cadena 200 + 400) y luego
  derrota. Sin baterías en la fila del robot para que el score sea exacto.
