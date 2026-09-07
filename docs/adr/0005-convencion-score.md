# 0005 — Convención de score: más es mejor

**Estado:** Aceptada

## Contexto

`recordsRepository.bestFor()` ordena `score DESC`. La primera propuesta de score de memorice premiaba *menos* movimientos, lo que rompería la ordenación del récord para cualquier juego.

## Decisión

**Cada juego define su métrica de score de forma que más sea mejor** (regla documentada en `src/core/types.ts`). Ejemplos:

- Memorice: `score = max(0, 100 − moves)`.
- Solitario: `score = max(0, 1000 − 5·moves − floor(segundos/2) − 25·undos)` (ver su README para el detalle).

## Consecuencias

- `bestFor()` funciona sin conocer el juego: siempre ordena `score DESC`. 
- Un juego sin score (ej: damas en el MVP, ver ADR 0007) simplemente no reporta `onGameEnd` y no genera récord.
- Al agregar un juego, la normalización del score es parte de la definición de sus reglas (función pura testeada en `engine/rules.ts` cuando aplica).
