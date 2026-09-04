# AGENTS.md — tasty-games

App de juegos 2D simples (Web + Android) con Expo SDK 57 / Expo Router / React Native 0.86 / TypeScript. 

## Estado del proyecto

- Completadas: **Fase 0** (bootstrap), **Fase 1** (Memorice), **Fase 2 + 2b** (Solitario con drag & drop), **Fase 3** (Damas chilenas, 2 jugadores locales, MVP sin récord) y **Fase 4** (responsive mobile-first, GameHeader core con ayuda/reinicio, ajustes globales, récord en GameCard, CI mínima). Detalle y checkboxes en `PLAN-IMPLEMENTACION.md`.
- Siguiente: **Fase E** — E2E Android (Maestro) + release Android (`eas build`) + CI completa (Playwright/Maestro). Requiere Java 17 + Android SDK (no instalados en este entorno).
- Verificación actual: `pnpm test` 154/154 · `pnpm e2e:web` 15/15 specs (memorice 2, solitario 3, damas 3, core: ayuda 2 + ajustes 1 + responsive 4).
- Drag & drop: patrón reutilizable en `src/core/ui/drag/useDraggable.ts` (Pan + shared values + `runOnJS`); lo consumen solitario y damas (lift, targets válidos resaltados, settle animado, snap-back).
- **Mobile-first y responsive (D4)**: toda UI debe verse a 360×640 sin scroll innecesario; layouts derivan de `computeLayout(width, height)`; spec E2E `responsive.web.spec.ts` lo candea.

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

## Procesos en background

- **No usar `pkill`** (ni `pkill -f`, ni `pkill -9`): cuelga la sesión del agente y no se continúa el proceso. Aplica a cualquier proceso: servidores de dev (`expo start`), `serve dist`, etc.
- Opción preferida: al lanzar un proceso en background, guardar su PID en `tmp/` (carpeta en la raíz del repo, gitignored; crear si no existe) y detenerlo por PID:
  - Ejemplo: `npx serve dist -l 4173 --single & echo $! > tmp/serve.pid`
  - Detener: `kill $(cat tmp/serve.pid)` (o crear un `tmp/dev-stop.sh` que haga `kill $(cat tmp/*.pid)` y borre los .pid).
  - Si el proceso tiene hijos propios (como el `serve` de `scripts/e2e.mjs`), matar el grupo: `kill -- -$(cat tmp/serve.pid)` lanzándolo antes con `setsid`.
- Alternativa: pedir al usuario que ejecute el comando de detención manualmente.
- `scripts/e2e.mjs` ya gestiona su propio ciclo de vida (export → serve → cleanup al salir); no dejar serves huérfanos manuales: si un e2e falla a mitad de corrida, reintentar `node scripts/e2e.mjs` (reutiliza/mata el servidor en :4173) en vez de matar procesos a mano.
- Síntoma de servidor huérfano en :4173: `e2e.mjs` imprime "Reutilizando servidor activo" y corre contra un `dist/` viejo (cambios recientes "no aparecen"). Detenerlo por PID (o pedir al usuario) y relanzar.

## Gotchas del toolchain

- Reanimated 4 requiere New Architecture (default en SDK 57, no desactivar) y `react-native-worklets` — versiones deben venir de `expo install`, no manual.
- `pnpm exec expo install` agrega paquetes a `dependencies` (incluidos jest/jest-expo/@types/jest): así quedó, no "reordenar".
- Rutas tipadas de Expo Router activadas (`experiments.typedRoutes`): los tipos se generan en `.expo/types/` SOLO al correr `pnpm start` (el export no los regenera); si tsc falla por rutas, arrancar `pnpm start` una vez y detenerlo por PID.
