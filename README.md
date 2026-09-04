# tasty-games
Aplicación con múltiples juegos 2d simples (Web + Android) — Expo SDK 57 / Expo Router / TypeScript.

Documentación clave:

- `PLAN-IMPLEMENTACION.md` — plan por fases + checklist de avance
- `propuesta-app-juegos.md` — propuesta original (contiene decisiones ya revocadas, ver plan)
- `AGENTS.md` — convenciones del repo para agentes

## Comandos

```bash
pnpm install          # setup (requiere pnpm; .npmrc fija node-linker=hoisted)
pnpm start            # dev server
pnpm web              # dev server web
pnpm test             # tests unitarios (jest)
pnpm typecheck        # tsc --noEmit
```

## Pruebas E2E (Playwright — web)

```bash
pnpm e2e:web        # headless (export + serve + tests, un solo comando)
pnpm e2e:headed     # con ventana de navegador visible
pnpm e2e:ui         # UI mode interactivo (timeline, steps, watch)
pnpm exec playwright test --debug   # inspector paso a paso
pnpm e2e:report     # abre el reporte HTML del último run
```

- Todos los comandos usan `scripts/e2e.mjs`: exporta el build web (output visible),
  sirve `dist/` en :4173, corre Playwright y limpia el servidor al salir.
  Si ya hay un servidor activo en :4173, lo reutiliza sin re-exportar.
- Filtros: `pnpm e2e:web -- -g "salir"` corre solo los tests que coinciden.
- **Registros de resultados**: el reporte HTML queda en `playwright-report/` y los
  artefactos de fallo (traza `retain-on-failure`, snapshots) en `test-results/`.
  Ambos están gitignored.
