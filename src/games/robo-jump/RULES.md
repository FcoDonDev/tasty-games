# Robo Jump — Reglas (fuente QA)

Convención de score: **más es mejor** — el score son los METROS que subiste
(`round(altura_máxima / 10)`). Endless: no hay victoria; la partida termina
cuando el Robot cae por debajo de la vista o toca un monstruo.

## Reglas (candeadas por `engine/`)

- **R1 — Auto-rebote**: el Robot salta siempre; el jugador solo controla el
  movimiento horizontal (drag 1:1 con clamp de 24 u/evento; teclado ←/→ a
  260 u/s en web).
- **R2 — Colisión de plataformas**: solo al CAER (`vy > 0`) cruzando el
  borde superior. Subir atraviesa sin colisión.
- **R3 — Tipos de plataforma**: verde (fija), azul (oscila horizontal), marrón
  (se rompe al pisarla: no rebota y desaparece; SIEMPRE trae una compañera
  verde a su altura+36 u que la sustituye — D16, la cadena nunca muere en
  una brown). Bajo la cámara se eliminan: no hay descenso.
- **R4 — Spring**: impulso `SPRING_V` (más fuerte que el salto normal).
- **R5 — Hélice turbo**: ascenso sostenido 4 s a velocidad fija; anula el
  disparo y DESTRUYE monstruos al atravesarlos (fiel al original). Se
  CONSUME al recogerla (el ícono deja la plataforma).
- **R6 — Wrap-around lateral**: salir por un borde = entrar por el opuesto.
- **R7 — Cámara**: sube solo cuando el Robot cruza la línea del 40%
  superior; nunca baja.
- **R8 — Monstruos**: estático y móvil. Muerte por contacto, SALVO:
  aplaste (cayendo sobre la cabeza → rebote + muerte del monstruo) o hat
  activo (los atraviesa letales).
- **R9 — Disparo**: tap en el área de juego (Espacio/↑ en web) dispara
  HACIA el punto tocado (apuntado: dirección = toque − Robot; sin
  gravedad, velocidad constante); teclado: horizontal según `facing`.
  Despawn al salir de la vista (bordes o tope/base de cámara, sin wrap);
  máx 3 activas; mata por contacto.
- **R10 — Dificultad**: escalada por bandas de 1000 u (gaps más anchos, más
  plataformas azules/marrones, más monstruos desde los 800 u). La x de cada
  plataforma nueva se genera dentro de la VENTANA alcanzable desde la
  plataforma previa (`reachForGap` — D16).
- **R11 — Récord**: `won: false` siempre; score = metros (más es mejor).

## Seeds E2E (solo con `EXPO_PUBLIC_E2E=1`)

- `test-win` — torre central en el eje X: el auto-rebote asciende solo
  (score crece sin input); muerte via drift lateral + caída.
- `test-lose` — monstruo estático anclado en el eje del primer rebote:
  colisión sin input.
