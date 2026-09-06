# AGENTS.md — tasty-games

App de juegos 2D simples (Web + Android) con Expo SDK 57 / Expo Router / React Native 0.86 / TypeScript. 

## Estado del proyecto

- Completadas: **Fase 0** (bootstrap), **Fase 1** (Memorice), **Fase 2 + 2b** (Solitario con drag & drop), **Fase 3** (Damas chilenas, 2 jugadores locales, MVP sin récord), **Fase 4** (responsive mobile-first, GameHeader core con ayuda/reinicio, ajustes globales, récord en GameCard, CI mínima) y **Fases U1–U3 de UI/UX** (drag que sigue el dedo en UI thread + haptics; tableros al 100% del área medida con onLayout + récord en chromeBar + safe areas; botones con feedback de press `PressableScale` + overlays con fade + solitario que parte desde arriba). Detalle y checkboxes en `PLAN-IMPLEMENTACION.md` y `PLAN-UI-UX.md`.
- Siguiente: **Fase U4** — feel-check en device (release build, flick/interrupción/haptics) y luego **Fase E** — E2E Android (Maestro) + release Android (`eas build`) + CI completa (Playwright/Maestro). U4/E requieren Java 17 + Android SDK (no instalados en este entorno).
- Verificación actual: `pnpm test` 155/155 · `pnpm e2e:web` 15/15 specs (memorice 2, solitario 3, damas 3, core: ayuda 2 + ajustes 1 + responsive 4).
- Drag & drop: patrón reutilizable en `src/core/ui/drag/useDraggable.ts` (Pan + shared values escritas en `onUpdate`, velocity handoff al settle/snap-back, `scheduleOnRN` — no `runOnJS` deprecado); lo consumen solitario y damas (lift, targets válidos resaltados, settle animado, snap-back).
- UI compartida en `src/core/ui/`: `PressableScale` (feedback de press, CSS transition 120ms/scale 0.97), `overlayAnimation` (builders FadeIn/FadeOut perezosos-memoizados), `useContainerSize` (medición real del contenedor), `haptics` (wrapper expo-haptics). Los juegos no importan expo-haptics/reanimated builders directamente.
- **Mobile-first y responsive (D4)**: toda UI debe verse a 360×640 sin scroll innecesario; layouts derivan del tamaño REAL medido con `useContainerSize` (onLayout), no de `useWindowDimensions` con constantes adivinadas; spec E2E `responsive.web.spec.ts` lo candea.

## Comandos

- Gestor de paquetes: **pnpm únicamente** (no npm/yarn). `.npmrc` fija `node-linker=hoisted` — requerido por Metro, no borrar.
- Instalar paquetes nativos/de Expo **solo** con `pnpm exec expo install <pkg>` (respeta la matriz de compatibilidad del SDK). `pnpm add` directo solo para paquetes JS puros (ej. zustand).
- Verificación: `pnpm typecheck` (tsc --noEmit) → `pnpm test` (jest, preset jest-expo). Un solo test: `pnpm test -- <patron>`.
- Verificar build web sin dev server: `CI=1 pnpm exec expo export --platform web` (genera `dist/`, ya gitignored).
- E2E web: `pnpm e2e:web` (orquestador único: export → serve :4173 → Playwright → cleanup). Tras bump de `@playwright/test` re-instalar binarios: `pnpm exec playwright install chromium`.
- Android dev build requiere Java 17 + Android SDK/ADB — **no están instalados en este entorno**; `pnpm android` fallará hasta instalarlos.

## Arquitectura

- Registro de juegos: `src/core/game-registry.ts`. Agregar un juego = crear `src/games/<id>/` con un `GameDefinition` (contrato en `src/core/types.ts`) + una línea en el registro. **Regla dura: nada bajo `src/games/<a>/` importa de `src/games/<b>/`**; solo puede depender de `src/core/`.
- Cada juego tiene su propio store Zustand en `engine/state.ts`, no exportado fuera de su carpeta. Engines (`rules.ts`, `deck.ts`, `board.ts`) deben ser funciones puras sin UI — ahí vive el riesgo y los tests.
- El único lugar que escribe récords es `app/juego/[id].tsx` vía `recordsRepository`; los juegos llaman `onGameEnd(result)` y nunca importan expo-sqlite.
- **Convención de score: más es mejor**: Cada juego debe definir su propia métria de score en sus reglas (Ej: memorice usa `100 - moves`).

## Persistencia dual 

Los repositorios en `src/core/db/repositories/` existen en pares: `*.ts` (expo-sqlite, nativo) y `*.web.ts` (localStorage). Metro resuelve `.web.ts` automáticamente en web. **Editar siempre las dos implementaciones y mantener la misma interfaz async.** 

Justificación: La web no utiliza expo-sqlite (alpha + exige headers COOP/COEP) — no se debe migrar.

## Migraciones SQLite

Nunca editar el DDL existente en `src/core/db/schema.ts`. Sumar `SCHEMA_VERSION` +1 y agregar un array de statements a `MIGRATIONS[]`; `client.ts` aplica pendientes vía `PRAGMA user_version`.

## Convenciones del repo

- Alias `@/` → `src/` está configurado en DOS lugares: `tsconfig.json` paths y `jest moduleNameMapper` en `package.json`. Al tocar uno, tocar el otro.
- Render: Views nativos + react-native-reanimated + gesture-handler. 
- Componentes interactivos llevan `accessibilityLabel` estable: son los selectores que usarán Maestro (Android) y Playwright (web) en E2E.


## Pruebas

- Tests unitarios en `__tests__/` junto al código, patrón `**/__tests__/**/*.test.@(ts|tsx)`.
- Pruebas E2E
    - Android: contra dev build (`expo run:android`)
    - WEB: Playwright (specs en `src/games/<id>/__e2e__/*.web.spec.ts`).
- Escenarios deterministas E2E vía seeds sentinelas (`initialSeed`, ej. `test-win`) — solo activos cuando el build se exporta con `EXPO_PUBLIC_E2E=1` (lo hace `scripts/e2e.mjs`); en producción no existe canal para alterar el reparto.

### Estrategia de testing

- Todo nuevo desarrollo debe tener sus propios test unitarios.
- Cada modificación a modulos existentes implica ejecutar los test para validar regresiones.
- Si la correción es sencilla entonces aplicala y notificala. Si es compleja y/o requiere definiciones que pueden afectar otros componentes, entonces valida con usuario antes de corregirla.
- Si existen errores en modulos que no se modificaron en la sesion entonces no los corrijas automaticamente, reporta al usuario los hallazgos y enfocate en los errores que si se deben a los cambios aplicados. 

## Verificación (flujo estándar)

Orden obligatorio para cualquier cambio, siempre con timeout explícito en los comandos largos:

1. `pnpm typecheck` (rápido, <5s).
2. `pnpm test` (jest, ~3s). Un solo paquete: `pnpm test -- <patron>`.
3. E2E web completo: `node scripts/e2e.mjs` (orquestador: export → serve :4173 → Playwright → cleanup). Un solo intento; si se aborta a mitad, ver sección siguiente ANTES de reintentar.
4. Verificación visual puntual (solo si hay que mirar algo que los specs no cubren): exportar (`CI=1 pnpm exec expo export --platform web`), servir dist manualmente y abrir con el navegador (viewport 360×640). Borrar los screenshots al terminar (`rm -f u*.png`); nunca commitearlos.

Condiciones para considerar "verde" un cambio: typecheck + test + e2e 15/15. Los screenshots mid-gesto (ej. `getComputedStyle(el).transform` con mouse down sostenido) son el método para verificar animaciones que los specs solo validan por resultado final.

## Procesos en background (estrategia predefinida — no reinventar)

**Regla dura: NUNCA usar `pkill`** (ni `pkill -f`, ni `pkill -9`): cuelga la sesión del agente. Detener SIEMPRE por PID o grupo de procesos.

**Lanzar un servidor en background** (guardar PID en `tmp/`, gitignored; crear si no existe):

```bash
setsid npx serve dist -l 4173 --single > tmp/serve.log 2>&1 &
echo $! > tmp/serve.pid
```

- Usar `setsid` SIEMPRE que el proceso tenga hijos propios (el `serve` de e2e.mjs los tiene): permite matar el grupo entero con un solo `kill`.
- Lanzar con `& echo $! > tmp/...pid` en UNA línea puede hacer colgar la llamada de la herramienta bash (espera el stdout del job): redirigir el output a un log (`> tmp/serve.log 2>&1`) y correr el lanzamiento como su propio comando corto. Si la llamada igualmente expira por timeout, el proceso SÍ quedó vivo (setsid sobrevive) — verificar con `curl` antes de relanzar para no duplicar servidores.

**Detener por PID** (grupo si fue lanzado con setsid):

```bash
kill -- -$(cat tmp/serve.pid)   # grupo de procesos (setsid)
kill $(cat tmp/serve.pid)       # proceso simple
rm -f tmp/serve.pid tmp/serve.log
```

**Detectar un huérfano** (PID file perdido, corrida de e2e abortada, servidor de una sesión anterior):

```bash
lsof -t -i :4173 | head -5     # PID del proceso en el puerto
kill -- -$(lsof -t -i :4173)   # o kill <pid> si no es grupo
curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:4173/   # 000/err = puerto libre
```

**Tabla de decisión cuando algo "se cuelga" o el E2E corre contra dist viejo:**

| Síntoma | Causa | Acción |
|---|---|---|
| `e2e.mjs` imprime "Reutilizando servidor activo" y los cambios "no aparecen" | huérfano en :4173 sirviendo `dist/` viejo | detener por PID (`lsof -t -i :4173`) y relanzar `node scripts/e2e.mjs` |
| El E2E se aborta a mitad de corrida | el usuario/cancelación mató al orquestador pero no a su `serve` | detener huérfano por PID y reintentar `node scripts/e2e.mjs` (no matar nada a mano sin PID) |
| La llamada de bash con `... & echo $!` expira por timeout | la shell espera el stdout del job | el proceso sigue vivo (setsid): verificar puerto con `curl` y guardar el PID con `lsof` si hace falta |
| "Te colgaste" repetido con e2e/serve | llamadas re-lanzando servers sobre un puerto ocupado | siempre: `curl` al puerto primero → `lsof` por PID → `kill` → relanzar |

Nunca relanzar `serve`/`e2e.mjs` sin haber confirmado con `curl` que el puerto está libre o que el servidor existente sirve el `dist/` recién exportado.

## Gotchas del toolchain

- Reanimated 4 requiere New Architecture (default en SDK 57, no desactivar) y `react-native-worklets` — versiones deben venir de `expo install`, no manual.
- `pnpm exec expo install` agrega paquetes a `dependencies` (incluidos jest/jest-expo/@types/jest): así quedó, no "reordenar".
- Rutas tipadas de Expo Router activadas (`experiments.typedRoutes`): los tipos se generan en `.expo/types/` SOLO al correr `pnpm start` (el export no los regenera); si tsc falla por rutas, arrancar `pnpm start` una vez y detenerlo por PID.
