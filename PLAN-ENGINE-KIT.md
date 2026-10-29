# PLAN-ENGINE-KIT — Kit de motor de juegos reutilizable (nombre de trabajo: `tasty-engine`)

**Estado:** En planificación — sin implementación. Decisiones §4 PENDIENTES de OK.
**Fecha:** 2026-10-29
**Branch:** `feature/engine-kit` (creada desde `origin/main`, pusheada vacía al crearla)
**Antecedentes:** [ADR 0010](docs/adr/0010-wakwak-motor-agnostico.md) · [ADR 0014](docs/adr/0014-realtime-timestep-interpolacion.md) · [ARCHITECTURE.md](docs/ARCHITECTURE.md) · [ROADMAP.md](docs/ROADMAP.md) (deuda `mulberry32`) · PLAN-WAK-WAK §4 (histórico, `git show f09c5bb:PLAN-WAK-WAK.md`)

---

## 1. Contexto y objetivo

Los tres juegos en tiempo real (wakwak, serpiente, robo-jump) materializaron dos
variantes del mismo patrón de «motor» (ADR 0010 / ADR 0014): núcleo puro +
timestep fijo + puerto/adaptadores de presentación. El patrón funciona (72 tests
E2E verdes, perf medida con ADR 0011) y ya se duplicó 3 veces: loop rAF con
guard de stall, auto-pausa (AppState/visibilitychange), RNG seedeado, stats del
tick, mapeo evento → sonido/haptics, controles swipe/flotantes.

**Objetivo:** extraer y generalizar esa base como kit reutilizable
(`src/core/engine/`) con wakwak y robo-jump migrados como PRUEBA de que sirve,
sin cambiar el comportamiento de ningún juego ni romper la suite E2E.

**No hay implementación en esta pasada**: este PLAN se commitea para
trazabilidad y se espera OK del usuario antes de implementar (regla de la casa
21-oct: cada commit de esta rama se pushea).

## 2. Validación de los supuestos del ecosistema (oct-2026)

Verificación contra npm registry + GitHub API + docs oficiales (27–29 oct 2026).
Plan-WAK-WAK §4 era de may-2026 (exploración de sept-2026, artículo may-2026).

| Supuesto (ADR 0010 / PLAN §4) | Veredicto | Evidencia (fuente, fecha) |
|---|---|---|
| **RNGE dormido**, última release 2020, techo ~50 entidades | **VIGENTE** | npm `react-native-game-engine` latest 1.2.0, **2020-06-09** (6+ años sin release); repo GitHub 3.1k stars sin actividad de releases; Generalist Programmer (grzegorzotto.dev, actualizada 2026-06-17): "RNGE… effectively unmaintained since 2020… frames drop near ~50 entities" |
| **Skia = renderizador sin motor**, opción crítica como adaptador B | **CAMBIÓ** (paquete migró de dueño) | Repo Shopify/react-native-skia **fue transferido** a `wcandillon/react-native-skia` (homepage del repo de Shopify ya apunta a wcandillon.github.io; repo activo, pushed 2026-10-29). **v3 publicada como unscoped `react-native-skia`** (npm latest 3.8.1, 2026-10-27): backend **Graphite** (Metal/Vulkan), arquitectura multi-thread. La línea 2.x sigue como `react-native-skia@2` (dist-tag `release-2.x` = 2.15.2, 2026-10-24). El paquete scoped `@shopify/react-native-skia` quedó congelado en 2.14.0 (2026-10-01). Implicación: si algún día se materializa el adaptador B, el objetivo de instalación y el runtime cambiaron (v3 multi-thread/no-bridge) |
| **expo-gl** mantenido | **VIGENTE** | npm `expo-gl` 58.0.3 (2026-10-01) — sigue la cadencia del SDK (58 > 57 del repo). Contexto GL, no motor: sin cambios |
| **react-native-wgpu** (Dawn/WebGPU) | **VIGENTE** (estancado en 0.x) | npm 0.5.17 (2026-07-08); última release hace ~3,5 meses. Sigue siendo superficie raw, no motor |
| **@penabt/pixi-expo** hack alive | **CAMBIÓ→MUERTO** (burst may-2026 y sin actividad posterior) | npm 0.9.2 (**2026-05-06**; saltó 0.2→0.9 ese día y no volvió a publicar); GitHub pushed 2026-05-06, 1 star, 0 issues |
| **expo-phaser** muerto | **VIGENTE** | npm latest 0.0.1-alpha.0 (**2018**). Nada desde entonces |
| **rn-game-engine-next** prometedor pero sin adopción | **CAMBIÓ** (congelado) | npm sigue 0.2.0 (**2026-04-08**, sin releases posteriores); GitHub pushed 2026-04-08, 1 star |
| **No existe un motor RN completo** ("the gap") | **VIGENTE** | Artículo citado sigue en línea (HTTP 200). Guía jun-2026 del mismo autor mantiene la matriz: "There is no single React Native game engine that does everything" — solo renderizadores (Skia+Reanimated), un engine muerto (RNGE) y hacks (WebView, Matter.js+Skia). Búsquedas dirigidas ("react native game engine 2026", "expo game engine") NO arrojaron motores nuevos post-may-2026 |
| **¿Alguno motor RN nuevo desde may-2026?** | **NINGUNO relevante** | Doble búsqueda web (2026-10-29): resultados son tutoriales/librerías ya conocidas (Skia, Reanimated, RNGE, Matter.js, Phaser-en-WebView). `rn-game-engine-next` y `@penabt/pixi-expo` se congelaron. Conclusión: **un kit propio sigue siendo la estrategia correcta** |
| **Phaser (web) descartado por E2E/récord** | **VIGENTE** (por decisión de arquitectura) | Phaser está VIVO (npm 4.2.1, 2026-07-09 — v4 GA abr-2026), pero sigue runtime web: WebView = dos runtimes, integración null con récord/haptics/E2E del repo. La razón del descarte es arquitectónica y no cambió |
| Versiones del repo (contexto) | — | `pnpm-lock.yaml`: expo 57.0.19 · react-native 0.86.3 · reanimated **4.5.1** (última estable 4.7.1, 2026-10-02) · worklets 0.10.1 · zustand 5.0.15 · RNGH ~2.32 (última 3.4.0, 2026-10-16). **Skia NO está instalada** (adaptador B = contingencia nunca materializada). Ecosistema al día: RN 0.88.1 (2026-10-27), expo 58.0.21 (2026-10-28) |

**Conclusión de la validación:** nada nuevo en el ecosistema modifica la
decisión ADR 0010. El único evento material es la **migración del paquete Skia**
(scoped→unscoped, v3 Graphite) que afecta SOLO a la contingencia B, no al kit.

## 3. Auditoría del código existente (insumo real del kit)

### 3.1 wakwak — patrón ADR 0010 formal (`src/games/wakwak/engine/`, ~1.800 líneas)

| Archivo | Líneas | Rol | Kit-relevante |
|---|---|---|---|
| `maze.ts` | 313 | laberintos normal/fácil, vecinos/wrap, geometría | No (contenido del juego) |
| `rules.ts` | 647 | `advance(state, dtMs)` por **TICK_MS = 1000/60**, acumulador **DENTRO del estado** (`state.remainderMs`), guard 8 ticks; movimiento celda-celda con progreso 0..1; colisión `wrappedDistance ≤ 0.7`; `worldSnapshot()` alimenta el puerto | **Sí: la malla del loop por pasos** (el while/accumulate) es generalizable; el interior del tick es contenido |
| `ai.ts` | 145 | 4 personalidades puras sobre RNG + maze | No (contenido del juego) |
| `feel.ts` | 154 | hit-stop/slow-mo/zoom **puros**, consumidos por la PANTALLA (no por el engine) | No (contenido, mas la COLOCACIÓN en el loop —multiplicar dt— sí es patrón) |
| `controls.ts` | 70 | swipe clásico (umbral 18px) + flotante re-centrado (umbral 24px, histéresis) | **Sí: duplicado casi 1:1 con serpiente** |
| `levels.ts` | 244 | tablas de knobs 8 niveles ×2 modos | No (contenido del juego) |
| `state.ts` | 160 | store zustand (no exportado); `tick(dtMs)`→eventos; publica solo si cambió; **instrumentación tickStats** | **Sí: tickStats duplicado VERBATIM con robo-jump** |
| `seed.ts` | 287 | `mulberry32` (closure `()=>number`) + hashSeed + sentinelas + `levelRngSeed` | **Sí: la librería RNG** (sentinelas = contenido E2E del juego) |
| `renderer/types.ts` | 40 | puerto formal: `WakWakRenderer { createWorld/present/destroy }` + `WorldSnapshot` | **Sí: esto ES el puerto tipo ADR 0010** |
| `renderer/reanimated/` | — | adaptador A (MazeLayer/EntitiesLayer/DeathFx) | No (adaptador) |
| `WakWakScreen.tsx` | 955 | loop rAF (guard >25ms), auto-pausa por plataforma, eventos→sound/haptics, onGameEnd | **Sí: el plumbing del loop/auto-pausa/end es lo duplicado** |

### 3.2 robo-jump — variante ADR 0014 más cercana al patrón canónico (`src/games/robo-jump/engine/`, ~1.450 líneas)

| Archivo | Líneas | Rol | Kit-relevante |
|---|---|---|---|
| `tuning.ts` | 109 | única fuente de constantes | No (contenido) |
| `rules.ts` | 742 | física AABB, **STEP_MS=8 sub-pasos fijos**, `advance` devuelve **`{state, events, leftoverMs}`** — el acumulador vive en el LLAMADOR (store), no en el estado ← convención ADR 0014 | **Sí: este es el patrón canónico del timestep** |
| `state.ts` | 157 | snapshot interno mutable `getGame()` (cero publicación por frame), publica score ≤5Hz; tickAccumMs en store; tickStats verbatim | **Sí: tickStats + la convención de acumulador** |
| `seed.ts`+`fixtures.ts` | 364 | sentinelas + mundos cerrados para tests/E2E | No (contenido E2E) |
| `components/Renderer.tsx` | 756 | render por shared values leyendo `getGame()` | **Sí/parcial: cumple el espíritu del puerto pero SIN contrato formal** (`renderer/types.ts` no existe) |

**Diferencias exactas entre los dos motores** (las dos variantes reales a unificar):

1. **Timestep:** robo-jump aísla el sobrante (`advance` → `leftoverMs`, ADR
   0014; GOTCHAS: el doble-contado de serpiente fue corregido así); wakwak
   lleva `remainderMs` DENTRO del estado (patrón previo, episodio contrario del
   gotcha). Migración: wakwak adopta la convención ADR 0014.
2. **Puerto:** wakwak lo formaliza (`renderer/types.ts`); robo-jump NO lo tiene
   (el render consume `getGame()` directo). Migración: darle puerto formal a
   robo-jump sin tocar su estrategia de shared values/getGame.
3. **Publicación:** wakwak set() per-frame si cambió (poses interpoladas viven
   en el estado); robo-jump nunca publica por frame (snapshot mutable + throttle
   5Hz). Ambos son VÁLIDOS según naturaleza del juego (celda vs física
   continua) — el kit NO elige por ti: documenta las dos y provee el tapiz
   (timestep + eventos) común.

### 3.3 Duplicación medida (candidatos a extraer, con contenido exacto)

| Utiles | Copias actuales | Estado |
|---|---|---|
| **`mulberry32`** | **5** : wakwak/seed.ts (closure) + robo-jump/rules.ts `randomNext` (serializable) + serpiente/rules.ts `randomNext` + memorice/engine/deck.ts + solitario/engine/deck.ts (closure, fallback Math.random) | 3 formas del MISMO algoritmo; ROADMAP ya lo lista como deuda. Extracción trivial con test de igualdad de secuencias |
| `hashSeed` (FNV-1a) | wakwak/seed.ts + serpiente/seed.ts | idéntico |
| `levelRngSeed` (deriva por nivel, ×7919) | wakwak/seed.ts + serpiente/seed.ts | idéntico |
| **tickStats** (contadores + buffer p95) | wakwak/state.ts + robo-jump/state.ts | verbatim (30 líneas) |
| **Input de dirección**: dominante por eje + flotante re-centrado (`FloatingDrag`) | wakwak/controls.ts (70) ≈ serpiente/controls.ts (78) | casi 1:1 (umbral 18 vs 24, teclado keys); ambos testeado |
| **Loop rAF + guard de stall (>25ms) + cancel al desmontar** | 3 pantallas: WakWakScreen ~432-501, RoboJumpScreen ~471-501, SerpienteScreen ~462-492 | cada clon ~30–60 líneas ×3 |
| **Auto-pausa** (AppState nativo + visibilitychange web, Platform guard) | 3 pantallas | verbatim ~15 líneas ×3 |
| **Eventos→sound/haptics inmediatamente al frente del handler** | 3 pantallas (y GOTCHAS "LO PRIMERO del handler") | patrón, no código idéntico (los sonidos/payloads son por juego) |
| onGameEnd (ref estable + escribir SOLO en overlay/effect) | 3 pantallas + las demás | patrón |
| score/récord, audio, haptics, niveles | — | **ya viven en su lugar** (`GameDefinition.onGameEnd` en core/types; `sound.ts`/`haptics.ts` en core/ui; niveles/tuning como contenido por juego) — el kit NO los toca |

### 3.4 Cobertura de tests que avala la extracción

- **wakwak** `__tests__/`: 148 casos — rules 35, state 23, maze 21 (+mazeLayer
  4), seed 15, ai 13, controls 12, levels 11, feel 8, labFacil 6. Cubre
  determinismo, cadencia implícita (step exacto), power/combo, sentinela E2E.
- **robo-jump** `__tests__/`: 67 casos — rules 34, state 13, fixtures 9, tuning
  7, reachability 3, rules-perf 1. Cubre física por sub-pasos, alcanzabilidad,
  invariantes de generación (tuning).
- (Contexto serpiente: ~78 casos, incl. cadencia con dts chicos — 9×16ms —
  lección GOTCHAS que el kit debe copiar en SUS tests propios.)
- **E2E que candea el extraer:** wakwak (3 specs: base/facil/safari-diag,
  swipe vía CDP), robo-jump (3 specs: base/drag/fixtures), serpiente (3).
  Suite completa hoy: 72 passed + 14 perf-skips (crece por juego).

## 4. Decisión de diseño — PENDIENTES de aprobación del usuario

| # | Decisión | Propuesta | Alternativas |
|---|---|---|---|
| **D1** | **Nombre del kit** | **`tasty-engine`** tal cual (módulo interno en `src/core/engine/`; si algún día se extrae al publicarlo, `@tasty-games/engine`) | (a) otro nombre evocador (`sweet-core`, `fuel`); (b) dejarlo sin nombre público (`src/core/engine/` solo) |
| **D2** | **Convención del timestep** | Unificar en la convención **ADR 0014**: `advanceFixed(...)` devuelve `{state, events, leftoverMs}` — el state NO acumula sobrante. wakwak migra su `remainderMs`-en-estado a esta convención | (a) soportar ambas convenciones (doble API = sobreingeniería); (b) no extraer el timestep (dejar el while en cada juego) |
| **D3** | **Puerto de presentación** | Contrato genérico tipado `RendererPort<S>` (createWorld/present/destroy) + puertos domain-specific POR JUEGO (`WakWakRenderer` extiende; robo-jump incorpora uno nuevo). El kit define la forma, no los adaptadores | (a) solo documentar el patrón (sin tipo base); (b) port único con snapshot genérico sin domain types (pieza dudosa) |
| **D4** | **Hooks de runtime** | `useGameLoop` (rAF JS-thread + dt + guard stall + cancel) y `useAutoPause` (AppState/visibilitychange) en `src/core/engine/`. JS-thread por diseño: TODOS los engines corren en JS (coherente ADR 0010/0014; worklets quedan fuera del kit) | (a) dejar los 3 loops como están (sin extraer); (b) extraer solo useAutoPause (loop se toca menos) |
| **D5** | **Input de dirección** | Un `src/core/engine/direction.ts` con máquina del gesto flotante + eje dominante + mapa de teclas INYECTABLE (thresholds por juego para respetar los umbrales afinados de wakwak 18/24 — PLAN-WAK-POLISH F2). Migrar wakwak + serpiente | (a) no extraer (duplicación aceptable); (b) inyectar también los perfiles completos |
| **D6** | **Alcance Fase 0** | Kit = determinismo (RNG/seed) + timestep + puerto + input dirección + runtime hooks (loop/pausa) + tickStats opcional. FUERA explícitamente: render adaptadores, UI/components, stores juego, niveles/tuning, sentinelas E2E específicos, audio/haptics wrappers (ya en core/ui), ECS/gestión de entidades | (a) sumar serpiente a la migración prueba (3er juego = más valor/más riesgo); (b) extraer también el mapping eventos→feedback (tabla declarativa) |

## 5. Superficie del kit (definición, Fase 0)

**ES el kit** (lo que un futuro juego en tiempo real reutiliza):

- `rng.ts`: `mulberry32(seed)` (closure) + `next(seed)` (transición serializable,
  forma robo-jump/serpiente) + `hashSeed(text)` + `levelSeed(base, level)`.
  UNA implementación del algoritmo, dos APIs derivadas del mismo core step.
- `timestep.ts`: `advanceFixed(state, dtMs, { stepMs, maxSteps, step }) →
  { state, events, leftoverMs }` — puro, sin concepto de juego.
- `port.ts`: `RendererPort<S>` (createWorld/present/destroy) + documentación
  del flujo screen→tick→snapshot→present (el patrón ADR 0010 estandarizado).
- `direction.ts`: eje dominante, estado flotante re-centrado, mapa teclado→Direction.
- `gameLoop.ts`: `useGameLoop({...})` + `useAutoPause({...})` (hooks JS).
- `tickStats.ts`: la instrumentación ADR 0011 (encender/drainear). Opcional.

**NO es el kit** (queda en el juego): reglas/IA/colisiones, niveles y tuning,
sentinelas E2E, mundo/estado del juego, stores zustand, adaptadores de render,
HUD/overlays/modales, sonido/haptics concretos (van por core/ui), score/récord
(vía `GameDefinition.onGameEnd` — la única escritura de récords sigue siendo
`app/juego/[id].tsx`).

**Régimen no soportado (declarado):** juegos por turnos (solitario/damas/memorice
no necesitan timestep); worklets/Skia (adaptador B es material de ADR futuro,
no del core del kit); sensores/tilt (robo-jump fase 2, ROADMAP).

## 6. Fases (orden de ejecución)

### Fase 0 — Superficie y contrato del kit (no-code)

- [ ] Congelar el capítulo §5 como doc corto (`docs/adr/0019-…` draft o sección
      de ARCHITECTURE a Fase 3); listar decisiones D1-D6 aprobadas.
- [ ] Validar con el usuario la propuesta de D1–D6 (este PLAN).

**Criterio de cierre:** D1–D6 con OK explícito del usuario.
**Riesgo:** bajo (solo decidir). **Regresión:** n/a. **Lock:** nada.

### Fase 1 — Utilidades de menor riesgo a `src/core/engine/`

- [ ] `rng.ts` + tests de IGUALDAD DE SECUENCIAS contra las copias actuales:
      candear que `next(seed)` (forma serializable) y las closures producen
      las MISMAS series numéricas (misma semilla → misma secuencia).
- [ ] Migrar los 5 juegos a importar de `@/core/engine/rng` (memorice, solitario,
      wakwak, serpiente, robo-jump `randomNext`); borrar copias locales.
      Regla: sin API nueva — las seeds siguen llegando desde los `engine/` propios.
- [ ] `direction.ts` + tests; migrar wakwak/controls.ts y serpiente/controls.ts
      a thresholds/keys inyectables (los números NO cambian).
- [ ] `gameLoop.ts`: `useAutoPause` + `useGameLoop`; migrar las 3 pantallas
      (wakwak/serpiente/robo-jump) — el comportamiento debe quedar exacto.
- [ ] `tickStats.ts` en `src/core/engine/` (migración de los dos stores).

**Criterio de verde:** `pnpm typecheck` + `pnpm test` completo verde +
`node scripts/e2e.mjs` (la SUITE ENTERA, ≥72 verde) — en especial specs de
swipe/swipe flotante de wakwak, controles de serpiente y drag de robo-jump.
**Riesgo:** medio-bajo (toques en 3 pantallas + 5 juegos); mitigación: PR por
commit-fase y cada commit se pushea. **Regresión:** seed/controls/sentinelas
tests de cada juego + E2E completo. **Lock:** NADA nuevo (sin deps).

### Fase 2 — Runtime: timestep canónico (ADR 0014) + puerto formal

- [ ] `timestep.ts`: `advanceFixed` puro + tests de cadencia (lección
      GOTCHAS: dts de frame chicos 9×16ms Y pasos exactos + sobrante único).
- [ ] Migrar robo-jump: su `advance` interno pasa a consumir `advanceFixed`
      (comportamiento idéntico; `leftoverMs` ya es su contrato); formalizar
      `renderer/types.ts` con `RoboJumpRenderer` sobre su estrategia actual de
      shared values/`getGame()` (SIN cambiar la publicación por frame).
- [ ] Migrar wakwak: `remainderMs` sale del GameState → acumulador en el store
      (`tickAccumMs`, tal cual serpiente/robo-jump); su `advance` consume
      `advanceFixed`; estado queda más chico y serializable (ganancia de
      persistencia futura vía gameStateRepository, ROADMAP wakwak v2).
- [ ] Test de equivalencia: mismas entradas → mismos steps/eventos con la
      convención vieja vs nueva (snapshotted golden antes de migrar).
- [ ] (Opcional, diferido si incomoda el blast radius: migrar serpiente —
      ya está en la convención ADR 0014; sería el tercer consumidor.)

**Criterio de verde:** igual Fase 1 + test de cadencia nuevo verde + E2E de
wakwak (los 3 specs) y robo-jump (los 3 specs) green SIN retocar specs —
los juegos deben quedar idénticos en comportamiento y E2E (mismo seed →
mismo score en los sentinelas E2E: candear valores esperados).
**Riesgo:** MEDIO (regresión de cadencia/colisiones de wakwak — el gotcha
del doble-contado). Mitigación: golden de cadencia antes de tocar, migración
en un commit solo-wakwak y otro solo-robo-jump. **Regresión:** los rules/state
tests existentes de ambos + E2E completo. **Lock:** nada (cero deps nuevas).

### Fase 3 — Documentación y cierre

- [ ] **ADR 0019** (`docs/adr/0019-kit-motor-tasty-engine.md`): qué es el kit,
      por qué ahora (validación §2 adjunta como tabla de evidencia), decisiones
      D1-D6, qué NO entra, referencia a ADR 0010/0014/0001 y al descubrimiento
      de Skia-v3 (contingencia B: paquete cambió de dueño/nombre).
- [ ] ARCHITECTURE.md: nueva sección "Kit de motor (`src/core/engine/`)" +
      actualizar lista core/ui (ver heading Tabla de módulos).
- [ ] ROADMAP.md: cerrar deuda "extraer mulberry32" (hecha); anotar migración
      opcional de serpiente al kit como follow-up y el cambio de paquete Skia
      en el ítem PoC Skia.
- [ ] `docs/GOTCHAS.md` SOLO si apareció lección nueva reproducible.
- [ ] README del kit (`src/core/engine/README.md`): cómo agregar "el siguiente
      juego en tiempo real" con el kit (checklist de integración).
- [ ] Cierre del PLAN: eliminar este archivo en el commit final (convención).

**Criterio de verde:** verificación estándar completa una última vez.
**Riesgo:** bajo. **Lock:** nada.

## 7. Supuestos que NO se pudieron verificar (y por qué)

1. **`useRSXformBuffer` en Skia v3** (¿cambió su API con el backend Graphite?):
   la búsqueda de código de GitHub exige auth (HTTP 401) y el sitio de docs
   tenía otro layout sin la página histórica. El paquete tampoco está en el
   repo, así que el dato queda marcado como "a verificar si se materializa el
   adaptador B". El hecho MATERIAL (paquete transferido a wcandillon + v3
   multi-thread publicada unscoped) SÍ está verificado.
2. **Números de descargas semanales 2026** (RNGE ~2.2k, Skia ~750k): el
   endpoint de descargas de npm no lo consulté (requiere fetch por fecha);
   la cifra es del artículo fuente (jun-2026) con esa atribución, sin
   re-verificación propia.
3. **¿Alguno game engine privado/startup RN post-may-2026?** Las búsquedas
   públicas solo cubren lo indexado en Google; un motor closed-source o muy
   nuevo (sin SEO) podría existir. Riesgo residual bajo para la decisión (el
   criterio del repo: ADR 0001 + New Arch + Jest-testable — un motor nuevo
   tendría que probarlo de todas formas).
4. **Estado de actualización del repo (RN 0.86.3/Expo SDK 57)**: no subí las
   versiones del repo — el PLAN no toca `pnpm-lock.yaml`; se documenta solo
   para contexto de ecosistema (últimas: RN 0.88.1, Expo 58.0.21). Una
   subida de SDK sería otro PLAN.

## 8. Notas / hallazgos

- (2026-10-29) Validación §2 contra npm/GitHub con fechas — el único evento
  material desde may-2026 es la transferencia del paquete Skia (scoped
  `@shopify/react-native-skia` → unscoped `react-native-skia`, v3 Graphite
  multi-thread). No cambia la decisión del kit ni la contingencia A/B.
- (2026-10-29) Auditoría §3: la librería RNG está copiada 5×, el gesto
  flotante 2×, el loop+auto-pausa 3×, y tickStats 2× verbatim — el kit tiene
  insumo REAL, no hipotético.
- (2026-10-29) La convención ADR 0014 (leftover al llamador) es única fuente
  de verdad del sobrante; wakwak es el último lag en la convención — su
  migración es la prueba de fuego más valiosa del kit.
- (pendiente) …
