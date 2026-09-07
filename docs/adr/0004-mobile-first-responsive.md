# 0004 — Mobile-first y responsive con medición real

**Estado:** Aceptada

## Contexto

La app targetea móvil (Web + Android). Los primeros layouts derivaban de `useWindowDimensions` + reserva hardcodeada del chrome (`CHROME_HEIGHT = 190/200`) que adivinaba el alto de header/scoreboard: si no coincidía, sobraba espacio o las cartas quedaban más chicas de lo posible.

## Decisión

1. **Toda interfaz debe verse bien a 360×640 sin scroll innecesario** y aprovechar el espacio disponible. Criterio de aceptación para cualquier UI nueva; lo candea el spec E2E `responsive.web.spec.ts`.
2. **Los layouts derivan del tamaño REAL medido**, no de dimensiones de ventana con constantes adivinadas: `useContainerSize` (`src/core/ui/useContainerSize.ts`, basado en `onLayout`) mide el contenedor y alimenta `computeLayout` / `computeCardSize` de cada engine. El tablero renderiza recién medido (layout `null` hasta el primer layout).

## Consecuencias

- `CHROME_HEIGHT` eliminado de los engines de layout: las firmas significan "tamaño real del área de juego".
- El patrón `flex: 1` + `computeLayout` se combinan (ver la nota de diseño en `docs/UI-UX.md`): flex distribuye el contenedor, computeLayout reparte la geometría interna con precisión.
- Cambiar firmas de `computeLayout` toca engine + tests de cada juego; regresión controlada por tests existentes.
