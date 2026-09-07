# 0002 — Persistencia dual: sqlite nativo + localStorage

**Estado:** Aceptada

## Contexto

expo-sqlite en web estaba (al momento de decidir) en alpha y exige headers `Cross-Origin-Opener-Policy` / `Embedder-Policy` + SharedArrayBuffer, además de WASM en el bundle. La propuesta original ya aislaba el acceso a datos detrás de repositorios.

## Decisión

Los repositorios en `src/core/db/repositories/` existen en **pares**:

- `*.ts` — implementación expo-sqlite (nativo/Android).
- `*.web.ts` — implementación localStorage (web).

Metro resuelve `.web.ts` automáticamente en builds web. Ambas implementaciones mantienen la misma interfaz async.

## Consecuencias

- Sin COOP/COEP ni WASM en el bundle web (D2 confirmado en la Fase 0: bundle sin WASM).
- **Editar siempre las dos implementaciones juntas** y mantener la interfaz sincronizada (ej: `recordsRepository.clearAll()` existe en ambas).
- Las migraciones SQLite solo aplican a la implementación nativa; ver [`ARCHITECTURE.md`](../ARCHITECTURE.md) (sección "Persistencia dual y migraciones").
- No migrar a expo-sqlite web: localStorage es suficiente y estable para
  récords y preferencias.
