# Serpiente (quinto juego)

Clásico snake arcade en tiempo real: come, crece y no te muerdas. Tablero
propio 20×20, velocidad progresiva, especial cada 5 comidas.

- Plan: `PLAN-SERPIENTE.md` (raíz, temporal). Reglas QA: `RULES.md`.
- Dirección: Arcade jugoso, tema **V2 Escamas arcade** (D17), convergido
  con la preview V2 (`preview/`, ruta dev `/serpiente-preview`).
- Render (`components/Board.tsx`): Views nativos + Reanimated (ADR 0001).
  - **Cuerpo continuo (D19)**: segmento punto-medio por par contiguo +
    taper por rol (cabeza 1.12 / cuerpo 1.0 / cola 0.72); glow focalizado
    en comida y punto del especial.
  - **Movimiento interpolado (D20)**: el engine avanza a saltos discretos
    (D8); el renderer desliza cabeza+cola (y cada nodo hacia su upstream)
    en UI-thread con el progreso del acumulador (`getStepProgress`, D21).
    Congelado en pausa/hit-stop/muerte; reduced motion = saltos discretos.
  - **Ring del especial (D18)**: arco de depletion (dos mitades + rotación,
    `arcAngles` puro) en vez de texto; el a11y anuncia los segundos.
  - Ondulación `slither` 1800 ms, pulso de comida 800 ms, popup deriva 750 ms.
- Ticks fijos (D8/D21): `advance` consume `dtMs` en pasos y devuelve
  `leftoverMs`; el acumulador vive SOLO en el store (`tickAccumMs`) y es la
  única fuente de verdad del tiempo fraccionario.
