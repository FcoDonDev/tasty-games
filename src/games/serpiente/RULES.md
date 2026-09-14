# Serpiente — Reglas (QA)

Snake arcade en tiempo real, un jugador, tablero propio 20×20.

## Objetivo

Comer para crecer y sumar puntos sin chocar. La partida termina al morir
(auto-colisión o muro con atravesar apagado) o al llenar el tablero
(victoria).

## Tablero y movimiento

- Grilla fija 20×20 (400 celdas); la serpiente arranca de 4 celdas al centro,
  mirando a la derecha.
- Paso fijo con velocidad progresiva: `max(70, 140 − comidas×4)` ms por
  celda (~7 → 14 celdas/s).
- El input se encola (máx 2, último-gana); la reversa de 180° está prohibida
  y se descarta junto con los duplicados.

## Elementos del tablero

- **Comida** (dorada): +10 puntos, +1 segmento, +1 comida. Siempre hay una en
  una celda libre.
- **Especial** (violeta): aparece cada 5 comidas en una celda libre alejada
  de la cabeza; **caduca a los 8 s**; +50 puntos y +1 segmento.

## Borde (setting `serpiente.wrap`, default: atravesar)

- **Atravesar**: salir por un borde entra por el opuesto.
- **Muro**: salir del tablero mata.

## Derrota y victoria

- Derrota: chocar contra el propio cuerpo (la cola que se libera ese mismo
  paso no cuenta) o contra el muro con atravesar apagado.
- Victoria: llenar las 400 celdas.
- Al cerrar (derrota o victoria): bonus de supervivencia **+1 punto por
  segundo jugado**.

## Puntaje (resumen, más es mejor)

| Evento | Puntos |
|---|---|
| Comida | +10 |
| Especial | +50 |
| Bonus de supervivencia al cerrar | +1/s |

## Controles

- **PC web (teclado):** flechas + WASD. Los ajustes (⚙, borde atravesar/muro)
  también están disponibles en PC.
- **Táctil (nativo y web móvil):** modo configurable (⚙ en el header):
  - **Gestos** (default): swipe en cualquier parte; la dirección se emite al
    cruzar el umbral (24 px), sin esperar a levantar el dedo.
  - **Flotante**: pad invisible que nace donde apoyes el dedo y re-centra el
    origen con cada dirección.
- **Pausa** en el header (⏸): congela la simulación.

## Seeds E2E (solo con `EXPO_PUBLIC_E2E=1`)

- `test-win`: 399 segmentos con la comida pegada a la cabeza; un tick gana.
- `test-lose`: cabeza mirando al muro con atravesar apagado; un tick muere.
- `test-crecer`: comida justo adelante; un tick come y crece.
