# Solitario — Reglas (QA)

## Objetivo

Mover las 52 cartas a las 4 pilas de foundation, cada una por palo (♠ ♥ ♦ ♣), en orden ascendente del As al K.

## Tablero inicial

- **Tableau:** 7 columnas. La columna `i` recibe `i+1` cartas; solo la superior está boca arriba.
- **Stock:** 24 cartas boca abajo.
- **Waste:** vacía al inicio.
- **Foundations:** 4 pilas vacías, una por palo (el símbolo del palo se muestra en el slot).

## Movimientos

1. **Robar:** tap en el stock. Con "Robar 1" pasa 1 carta; con "Robar 3", 3. Pasan boca arriba a la waste.
2. **Reciclar:** con el stock vacío, tap devuelve toda la waste al stock (boca abajo), sin límite de pasadas. Cuenta como movimiento.
3. **Waste → tableau / foundation:** solo la carta superior de la waste.
4. **Tableau → tableau:** cualquier subsecuencia boca arriba que baje en rango con colores alternados. Sobre columna vacía solo se acepta K.
5. **Tableau → foundation:** solo el top, mismo palo, siguiente rango.
6. **Foundation → tableau:** solo el top (permitido para "desenterrar" cartas).
7. Al descubrir la carta superior de una columna del tableau, se voltea automáticamente.

## No permitido

- Depositar en la waste o el stock.
- Mover cartas boca abajo.
- Colocar en foundation más de una carta a la vez.
- Mover una subsecuencia hacia la misma columna de origen.

## Fin de partida

- **Victoria:** las 4 foundations completas (52 cartas). Muestra modal con puntaje y guarda récord.
- **Derrota ("Sin movimientos"):** stock y waste vacíos y ninguna jugada tableau↔foundation posible. Modal sin récord. Nota: con waste no vacía siempre se puede reciclar, por lo que el juego no declara derrota mientras quede mazo que ciclar.

## Puntaje (más es mejor)

```
score = max(0, 1000 − 5 × movimientos − floor(segundos/2) − 25 × undos)
```

Partida ganada típica (~120 movimientos, ~5 min): ≈ 250 pts.

## Ajustes (⚙ en el header)

- **Robar 1 / Robar 3:** aplica a la próxima partida (no rebaraja la actual).
- **Deshacer Off/On:** aplica de inmediato. Con On aparece el botón ↩; cada uso resta 25 pts del puntaje final.

## Accesibilidad (selectores estables para E2E)

- Cartas: `solitario-card-<id>` (ej: `solitario-card-S-1` = A♠)
- Pilas: `solitario-stock`, `solitario-waste`, `solitario-foundation-0..3`, `solitario-tableau-0..6`
- Header: `salir-solitario`, `solitario-undo`, `solitario-abrir-ajustes`
- Ajustes: `solitario-ajustes`, `solitario-set-draw-1`, `solitario-set-draw-3`, `solitario-set-undo-off`, `solitario-set-undo-on`, `solitario-cerrar-ajustes`
- Modales: `modal-victoria-solitario`, `modal-derrota-solitario`, `jugar-de-nuevo-solitario`, `salir-al-home-solitario`
