# ADR 0016: Best score sin filtro por victoria

- Estado: Aceptada
- Contexto: PLAN-BEST-SCORE (cerrado 2026-09-17)
- Referencias: `src/core/db/repositories/recordsRepository{,.web}.ts`, `src/core/ui/ScoreBoard.tsx`, `src/core/types.ts` (convención de score)

## Contexto

Los récords de serpiente y robo-jump se guardaban pero nunca se mostraban:
`bestFor` filtraba solo partidas ganadas (`won = 1`) y ambos juegos registran
sus partidas con `won: false` (robo-jump es endless; serpiente solo gana al
llenar el tablero, casi inalcanzable). El ScoreBoard mostraba "—" / "Sin
partidas ganadas". memorice/solitario/wakwak no lo evidenciaban porque sí
producen partidas ganadas.

Bug secundario: `ScoreBoard` solo consultaba al montar; tras terminar una
partida en la misma pantalla el récord del chrome quedaba desactualizado.

## Decisión

1. **`bestFor` ya no filtra por `won`** (global, no opt-in por juego): el
   "mejor puntaje" se calcula sobre todas las partidas con score, consistente
   con la convención "más es mejor" de `GameResult`. El desempate por
   `duration_ms ASC` se conserva.
2. **`ScoreBoard` acepta `refreshKey?: number`**: `app/juego/[id].tsx`
   incrementa un contador tras cada `save` y lo pasa como prop, de modo que
   el récord del chrome se refresca sin salir de la pantalla.
3. Texto vacío no-compacto: "Sin partidas ganadas" → "Sin partidas".

## Consecuencias

- Aceptado (aprobado con usuario): en wakwak una run perdida con score alto
  puede aparecer como "Mejor" aunque existan ganadas con score menor.
- Efecto visible: los récords de robo-jump y serpiente ahora se muestran.
- Lección de spec E2E en [GOTCHAS](../GOTCHAS.md) (selector `getByText` vs
  récord refrescado).
