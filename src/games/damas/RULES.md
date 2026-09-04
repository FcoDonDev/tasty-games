# Damas — Reglas (QA)

Variante chilena/latina, tablero 8×8, 2 jugadores locales (MVP).

## Objetivo

Capturar todas las fichas del rival o dejarlo sin movimientos legales.

## Tablero inicial

- Tablero 8×8; solo las **casillas oscuras** son jugables (32 en total).
- 12 fichas por bando sobre casillas oscuras: **Jugador 1** (fichas claras) en
  las filas 5–7, **Jugador 2** (fichas oscuras) en las filas 0–2.
- **Jugador 1 empieza.**

## Movimientos

1. **Peón:** avanza 1 casilla en diagonal **hacia adelante** (jugador 1 sube,
   jugador 2 baja).
2. **Captura de peón (regla chilena):** salta una ficha rival adyacente en
   diagonal, **hacia adelante o hacia atrás**, aterrizando en la casilla vacía
   inmediata detrás de ella.
3. **Dama (coronada):** se desliza **cualquier distancia** en diagonal por
   casillas vacías.
4. **Dama vuela (captura):** recorre cualquier distancia en diagonal, salta una
   ficha rival (la primera que encuentre) y aterriza en **cualquier casilla
   vacía detrás de ella** (antes de la siguiente ficha).
5. **Captura obligatoria:** si existe alguna captura, es obligatorio capturar;
   los movimientos silenciosos quedan prohibidos (se puede elegir cuál captura
   hacer; no se exige la de mayor cantidad).
6. **Multi-salto obligatorio:** tras cada captura, si desde la casilla de
   aterrizaje existe otra captura, la cadena **debe continuar**. El jugador
   arrastra la ficha hasta el destino final de la cadena (el salto completo se
   ejecuta de una vez, incluidas las fichas capturadas en el camino).
7. **Fichas capturadas:** se retiran al finalizar la cadena; mientras dure la
   cadena permanecen en el tablero como bloqueo (no se pueden saltar de nuevo,
   capturar dos veces ni aterrizar sobre ellas).
8. **Coronación:** el peón que aterriza en su última fila se corona (muestra ★)
   y **el turno termina** aunque existan más capturas.

## No permitido

- Mover hacia atrás con un peón (solo capturando).
- Saltar fichas propias.
- Capturar dos veces la misma ficha en una cadena.
- Aterrizar sobre una casilla ocupada.
- Hacer un movimiento silencioso cuando existe captura.

## Fin de partida

- **Gana** quien captura todas las fichas rivales o deja al rival sin
  movimientos legales. Modal "¡Gana Jugador N!".
- **MVP sin récord:** no se guarda puntaje (la convención de score se definirá
  al agregar IA en Fase 4).

## Interacción

- **Drag & drop:** arrastrar la ficha hasta una casilla resaltada (azul) y
  soltar. Soltar fuera de un destino válido devuelve la ficha a su casilla
  (snap-back animado).
- Solo son arrastrables las fichas del jugador en turno con al menos un
  movimiento legal.

## Accesibilidad (selectores estables para E2E)

- Casillas oscuras: `damas-celda-<0..63>` (32 elementos)
- Fichas: `damas-ficha-<player>-<sufijo>` (estándar: `1-1..1-12`, `2-1..2-12`)
- Header: `salir-damas`, `damas-turno-1|2`
- Modal de fin: `modal-fin-damas`, `jugar-de-nuevo-damas`, `salir-al-home-damas`

## Seeds de test (solo builds E2E, `EXPO_PUBLIC_E2E=1`)

- `?seed=test-capture`: captura obligatoria determinista (42→35→28) con el
  juego aún en curso.
- `?seed=test-win`: la captura 42→35→28 captura la última ficha rival → modal
  de fin con un solo drag.
