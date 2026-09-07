# 0006 — Seeds E2E sentinelas, gated por EXPO_PUBLIC_E2E

**Estado:** Aceptada

## Contexto

Los escenarios E2E necesitan partidas deterministas (victoria forzada, captura obligatoria conocida) sin depender del azar del reparto, y sin que esa determinismo pueda explotarse en producción.

## Decisión

- `GameScreenProps` incluye `initialSeed?: string` (opcional, retrocompatible). Cada juego lo interpreta en su engine (ej: `test-win`, `test-move`, `test-capture` — tableros/repartos **artesanales fijos**, no dependen del PRNG).
- El seed solo llega al juego cuando el build se exporta con `EXPO_PUBLIC_E2E=1` (lo hace `scripts/e2e.mjs`). `app/juego/[id].tsx` reenvía el query param `seed` de `useLocalSearchParams` únicamente en ese caso.

- **En producción no existe canal para alterar el reparto.**

## Consecuencias

- Specs E2E deterministas y repetibles sin assertions frágiles sobre reparto aleatorio.
- Al exportar con `EXPO_PUBLIC_*` hay que usar `--clear` (la cache de Metro sirve transforms viejos con la variable doblada a `undefined` — ver `docs/GOTCHAS.md`).
- Los sentinels son tableros/repartos artesanales escritos a mano, no semillas del PRNG: robustos ante cambios del shuffle.
