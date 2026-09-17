# PLAN-BEST-SCORE

## Contexto

Los récords de **serpiente** y **robo-jump** se guardan pero nunca se muestran:
`bestFor` filtra solo partidas ganadas (`won = 1`) en ambas implementaciones
del repositorio (par dual), y estos juegos registran sus partidas con
`won: false` (robo-jump es endless, D4; serpiente solo gana al llenar el
tablero, prácticamente inalcanzable). Resultado: el ScoreBoard muestra
"—" / "Sin partidas ganadas".

Bug secundario: `ScoreBoard` solo consulta al montar (`useEffect [gameId]`);
tras terminar una partida en la misma pantalla el HUD no refresca.

## Objetivo

El "mejor puntaje" se calcula sobre **todas** las partidas con score,
independientemente de `won` (convención "más es mejor", src/core/types.ts).

## Decisiones de diseño (aprobadas con el usuario)

1. **Global, no opt-in**: `bestFor` deja de filtrar por `won` para todos los
   juegos. Efecto colateral aceptado: en wakwak una run perdida con score
   alto puede aparecer como "Mejor" aunque existan ganadas con score menor.
2. **Refresh del HUD**: `ScoreBoard` recibe prop opcional `refreshKey`;
   `app/juego/[id].tsx` lo incrementa tras cada `save`.

## Checklist

- [x] 1. `recordsRepository.ts` (nativo): quitar `AND won = 1` de `bestFor`.
- [x] 2. `recordsRepository.web.ts` (par dual): quitar filtro `r.won`.
- [x] 3. `ScoreBoard.tsx`: prop `refreshKey?: number` + texto no-compacto
      "Sin partidas ganadas" → "Sin partidas".
- [x] 4. `app/juego/[id].tsx`: incrementar contador tras `save` y pasarlo
      como `refreshKey`.
- [x] 5. Tests: actualizar `recordsRepository.web.test.ts` (asserts que
      esperaban `null` tras partidas perdidas) + caso nuevo mejor score con
      `won:false` + `ScoreBoard.test.tsx` (won:false, refreshKey, placeholder).
      + assertion E2E en `robo-jump.web.spec.ts` (test-lose): el récord del
      chrome muestra el score tras la muerte.
- [x] 6. Verificación estándar: `pnpm typecheck` ✓ → `pnpm test` (498/498) ✓ →
      `node scripts/e2e.mjs`: 72 passed; única falla = `fix-wrap` (ver notas).
- [x] 7. Migración de hallazgos: ADR 0016, GOTCHAS (selector `getByText`),
      ROADMAP (`fix-wrap` preexistente). PLAN pendiente de eliminar en el
      commit de cierre (la suite no está 100% verde por falla preexistente).

## Notas/hallazgos

- Los specs E2E existentes que sondean récords con `won: true` (serpiente,
  wakwak) no se afectan: los registros siguen guardándose igual; solo cambia
  la consulta de mejor.
- `robo-jump.web.spec.ts:57` ya candea la persistencia `won:false`.
- **wakwak E2E (test-win) rompió por el fix funcionando**: tras refresh, el
  récord del chrome ("350 pts") contiene "0 pts" como substring y
  `getByText('0 pts')` (HUD) viola strict mode. Spec corregido a
  `getByLabel('marcador-puntos')` + `toHaveText`. Migrado a GOTCHAS.
- **`fix-wrap` (robo-jump fixtures) falla intermitente PREEXISTENTE**: el
  Robo muere a mitad de la coreografía ("Fin del salto 11 m"); falla igual en
  `main` sin los cambios de este PLAN (verificado con stash). NO tocado aquí;
  migrado a ROADMAP para su corrección aparte.
- `ScoreBoard.test.tsx`: el mount ejecuta el effect 2× (StrictMode) — los
  conteos de llamadas al mock se asierten relativos (calls despegues antes/
  después del refresh), no absolutos.
