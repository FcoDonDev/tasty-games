# 0012 — Previews de diseño dev-only dentro del módulo del juego

**Estado:** Aceptada

## Contexto

El pulido de Wak Wak (PLAN-WAK-POLISH) exigió iterar el diseño de los
personajes con el usuario. Tocar el render del juego directamente para "probar"
cada propuesta es caro y arriesgado (el render es la capa con gestos, física
visual y candados E2E), y mostrar PNGs de referencia no refleja cómo se vería
el diseño en la UI (escala real, wobble, paleta, fondo del tablero).

## Decisión

- Cada módulo de juego puede tener una carpeta `preview/` **dentro de su propio
  módulo** (`src/games/<id>/preview/`) con pantallas de iteración de diseño,
  expuestas en una ruta dev-only (ej. `/wakwak-preview` vía `app/
  wakwak-preview.tsx`). No hay navegación de producción hacia ellas (solo
  entrada manual por URL); si más adelante hace falta ocultarlas en builds de
  release, se gatean con `__DEV__`.
- Las previews usan los COMPONENTES REALES de render (no screenshots): misma
  paleta, mismas proporciones por celda, y los idle loops del UI thread que
  correrían en juego — así la aprobación del usuario es sobre el resultado
  final y no sobre una aproximación.
- Comparadores en vivo: la preview puede mostrar lado a lado el estado
  ACTIVO del juego (importando los componentes del `renderer/` del mismo
  módulo) y CANDIDATOS (layouts, figuras, expresiones) con validadores puros
  re-derivados del engine (ej. `validateLayout`).
- Reglas de dependencia intactas: la preview solo importa de su propio juego
  (`src/games/<id>/…`) y del core; el juego activo NUNCA importa de `preview/`.
  El diseño iterado se implementa en el `renderer/` recién cuando el usuario lo
  aprueba (el preview queda como herramienta de comparación histórica).

## Consecuencias

- Iteración de diseño barata y visual (escala/wobble/paleta reales), sin tocar
  la capa con riesgo hasta tener aprobación explícita.
- El código de preview es desechable por diseño: puede borrarse al cerrar el
  requerimiento si deja de aportar (no es deuda).
- Primer caso: `src/games/wakwak/preview/` (PersonajesPreview — galería de
  personajes normal/powered + propuesta del usuario; LaberintoPreview —
  comparador ACTIVO vs CANDIDATO con `validateLayout`, que candó la regla
  "sin áreas abiertas 3×3" y el wrap del túnel del laberinto v3).
