# 0007 — Damas: 2 jugadores locales, MVP sin récord

**Estado:** Aceptada (revisable cuando entre IA/score)

## Contexto

La propuesta original dejaba sin definir quién es el oponente de damas.
El MVP de la app no incluye backend ni partidas en red.

## Decisión

- Damas se juega **2 jugadores locales en el mismo dispositivo**.
- **Sin récord en el MVP**: `onGameEnd` no se invoca; el modal de fin solo anuncia al ganador. No se toca `app/juego/[id].tsx` ni los repositorios para este juego.
- Score/persistencia (y eventualmente IA) se definen en la fase de IA.

## Consecuencias

- Cero acoplamiento de damas con la capa de persistencia.
- El spec E2E de damas valida modal de fin + flujos de salida, no récord.
- Si se agrega IA o score, este ADR se revisa y se adopta la convención de score del ADR 0005 (más es mejor).
- Las reglas implementadas (variante chilena, captura obligatoria, coronación que corta la cadena) están documentadas en `src/games/damas/RULES.md` y en el README del juego.
