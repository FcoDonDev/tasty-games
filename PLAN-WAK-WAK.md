# PLAN-WAK-WAK — Nuevo juego de laberinto "Wak Wak"

**Estado:** En planificación — decisión de motor de juego PENDIENTE (ver §4).
**Fecha:** 2026-09-08
**Branch:** `feature-wak-wak`

---

## 1. Contexto

Se incorpora un nuevo juego inspirado en Pac-Man (maze-chase en tiempo real) al
registro de juegos (`src/core/game-registry.ts`). Es el **primer juego en tiempo
real** del proyecto (memorice, solitario y damas son por turnos), lo que introduce
un patrón nuevo: loop de juego continuo con enemigos con IA.

Antes de implementar se verificó en la web el riesgo de copyright de un juego
"homólogo" al original.

## 2. Resguardo legal (verificado en la web)

Precedente rector: **Atari, Inc. v. North American Philips Corp. (7th Cir. 1982)**
— el caso de *K.C. Munchkin*, un clon homólogo de Pac-Man que fue bloqueado por
orden judicial **a pesar de tener otro nombre, otro laberinto y mecánicas
distintas**, porque copió la *expresión* del original.

| Protegido por Bandai Namco → EVITAR | No protegido (scenes à faire) → usar libremente |
|---|---|
| Círculo amarillo con boca en V ("gobbler") | Idea maze-chase, reglas y mecánicas |
| Fantasmas campana con ojos que miran hacia donde van | Laberinto propio, puntos/comida, power-ups que invierten roles |
| Sonidos distintivos (waka-waka, sirena, jingle) | Túnel wraparound, tabla de puntaje, vidas, bonus de fruta |
| Nombre y trade dress "Pac-Man" | IA de enemigos con personalidades, modo "frightened" |

**Conclusión: cambiar solo el nombre NO basta.** Se requiere expresión visual y
sonora original. Traducción a Wak Wak:

- Protagonista: **robot aspiradora** (silueta cuadrada-redondeada con cepillo) — no un círculo amarillo.
- Enemigos: **4 drones antivirus** (cuerpos angulares con hélices, indicador LED giratorio — no ojos perseguidores, no campanas).
- Comida: **baterías**; power-up: **súper carga** que invierte roles; bonus: **chip dorado**.
- Paleta: fondo oscuro tech/neón (no azul/rosa del original); laberinto 100% propio.
- Audio: sonidos propios (no imitar waka-waka ni sirena).
- La descripción visible al usuario no referencia "Pac-Man".

**Nota sobre el nombre "Wak Wak"**: es onomatopeya de dominio público (no es la
marca registrada), pero evoca el sonido del original. Se acepta con la mitigación
anterior (audio propio, expresión visual propia). Reevaluar si se distribuye
públicamente en stores.

## 3. Decisiones aprobadas (con el usuario)

| Decisión | Elección |
|---|---|
| Tema visual | Robot y drones (estilo tech/neón) |
| Nombre | Wak Wak (`id: 'wakwak'`, icono 🤖) |
| Alcance v1 | MVP completo: 1 laberinto, 4 enemigos con IA diferenciada, power-up, 3 vidas, score (más es mejor), récord vía `recordsRepository`, pausa, sonido propio básico. Sin niveles progresivos ni persistencia de partida en curso (v2, ROADMAP) |
| Motor de juego | **PENDIENTE — explorar alternativas con librerías/frameworks de juegos JS antes de decidir (§4)** |

### Diseño de juego (independiente del motor)

- **Win**: recolectar todas las baterías del laberinto.
- **Lose**: los drones atrapan al robot 3 veces (3 vidas).
- **Score (convención más-es-mejor, ADR 0005)**: batería ×10, drone en modo flee ×200, chip dorado ×100, bonus final por vidas restantes.
- **Power-up (súper carga)**: temporal; invierte roles (los drones huyen, se pueden recoger por puntos).
- **IA de drones (4 personalidades)**: perseguidor directo, emboscador (apunta n celdas adelante del robot), aleatorio-tímido, alternante scatter/chase. Determinista vía RNG seedeado (`mulberry32`).
- **Input**: swipe direccional sobre el tablero (cola de dirección de 1) + flechas del teclado en web (QA).
- **Responsive (ADR 0004)**: laberinto propio ~21×17, escalado por celda desde el tamaño real medido (`useContainerSize`), 360×640 sin scroll.

### Principio rector: implementación agnóstica al motor (dentro de lo técnicamente factible)

El juego se diseña con un **núcleo lógico desacoplado de la capa de presentación**,
de modo que cambiar de motor de render no obligue a reescribir reglas, IA ni
estado. Se materializa como puertos y adaptadores dentro de `src/games/wakwak/`:

1. **Núcleo puro (`engine/`)** — TypeScript sin dependencias de RN/Reanimated/Skia:
   `maze.ts`, `rules.ts`, `ai.ts`, `state.ts`, `seed.ts`. Todo determinista y
   testeable con Jest sin render. `advance(state, dtMs, input)` es el único punto
   de entrada del tick.
2. **Puerto de presentación (`renderer/types.ts`)** — interfaz acotada que el
   núcleo no conoce y que cada motor implementa como adaptador:
   - `createWorld(maze, entities)` / `destroyWorld()`
   - `present(snapshot)` — posiciones/estados de entidades + celdas cambiadas (consumido por frame)
   - eventos discretos hacia el núcleo: `onDirection(dir)`, `onPause()`
   El adaptador es el ÚNICO archivo que importa la librería de render elegida
   (Views+Reanimated, Skia, WebGL, WebView...).
3. **Loop como adaptador** — el núcleo expone `tick(dtMs)`; cada adaptador decide
   quién lo llama (rAF JS, `useFrameCallback` de Reanimated, ticker de Pixi/Phaser,
   worklet). El núcleo no conoce requestAnimationFrame.
4. **Límite de factibilidad reconocido**: un puerto de "present" por frame tiene
   costo si el motor elegido renderiza por su cuenta (canvas/GL). Para motores
   autónomos (Phaser, Pixi) el adaptador puede invertir el flujo (el motor empuja
   y el núcleo es consultado); la regla que NO se negocia es que reglas/IA/estado
   viven en `engine/` puro y que solo `renderer/` importa la librería. Si una
   librería exigiera invadir el núcleo, se descarta en §4 y se documenta.

Con esto, la migración A→B→C (si el feel-check lo exige) toca solo `renderer/`
y `WakWakScreen.tsx`.

### Contrato arquitectónico (válido sea cual sea el motor)

- Juego aislado en `src/games/wakwak/`; solo depende de `src/core/`; nada importa de otros juegos.
- La lógica (reglas, IA, colisiones, outcome) vive en funciones **puras y deterministas** testeadas con Jest, separada de la capa de render (ver puerto de presentación arriba).
- El récord lo escribe únicamente `app/juego/[id].tsx` vía `onGameEnd(result)`; el juego no toca expo-sqlite.
- Seeds E2E sentinelas (`initialSeed`: `test-win` / `test-lose` / `test-power`) solo activos con `EXPO_PUBLIC_E2E=1` (ADR 0006).
- Componentes interactivos con `accessibilityLabel` estable (selectores Maestro/Playwright).

## 4. EXPLORACIÓN — Motor de juego (PENDIENTE de decisión con el usuario)

**Exploración web extendida realizada (2026-09-08).** El usuario pide evaluar
librerías/frameworks de juegos JS y hacks/workarounds posibles. Marco de
referencia clave: no existe hoy un "motor de juego React Native" completo — el
artículo *"The React Native game engine gap in 2026"* (grzegorzotto.dev, mayo 2026)
mapea el ecosistema en una matriz 2×2 (GPU nativo × capa de motor completo) y
concluye que la celda "GPU nativo + motor completo" está vacía: solo hay
**renderizadores** (Skia+Reanimated, expo-gl, react-native-wgpu), un engine
**dormido** (RNGE), o el motor web **embebido en WebView** (runtime separado).
Esto ordena las alternativas reales de este proyecto:

### 4.1 Alternativas nativas (un solo runtime, integradas con el app)

| Alternativa | Estado 2026 (fuentes) | Régimen de performance | Encaje con este proyecto |
|---|---|---|---|
| **A. Views + Reanimated 4 (baseline repo)** | Stack ya presente; patrón validado para drag en damas/solitario | Fluida con pocas entidades (~50 entidades es el techo reportado para Views sin batching); loop en JS thread | Wak Wak tiene ~5 entidades móviles + grilla estática: dentro del régimen holgado. Riesgo residual: jank en devices lentos |
| **B. @shopify/react-native-skia + Reanimated 4** | ~750k descargas/semana; "la única GPU path nativa creíble en RN" (generalistprogrammer, grzegorzotto); v2.6.x requiere RN 0.79+/React 19; batching de sprites vía `useRSXformBuffer` (1 draw call) | 60+ fps con cientos de sprites; loop ideal vía `useFrameCallback` | Candidata fuerte si A falla. **Costo web**: CanvasKit WASM 2.9 MB gz (async, CDN o `setup-skia-web`) + 3–5 MB de binarios nativos. Contradice ADR 0001 (scopeada a juegos por turnos) → exige ADR nuevo |
| **C. react-native-game-engine (RNGE)** | Dormido: última release 1.2.0 en junio 2020; ~2.2k descargas/semana; el propio README recomienda Godot/Unity para uso comercial | Renders por View, techo ~50 entidades en Android medio | Nuestro juego cabe en su régimen, pero sumar una dependencia muerta contradice la mantenibilidad; preferible A (mismo patrón, sin dependencia) |
| **C'. rn-game-engine-next (v0.2.0, abr 2026)** | Nuevo engine para New Architecture; dos modos: Views (30–40 fps, setState por frame) y `SkiaGameEngine` (SharedValue + worklet, 60–120 fps, cero re-renders) | Prometedor arquitectónicamente; adopción casi nula (~6 descargas/semana) | Demasiado nuevo para apostar; interesante como referencia de patrón (valida el diseño de §3) |
| **D. expo-gl / react-native-wgpu puros** | Mantenidos (expo-gl 55.0.13, may 2026; wgpu sobre Dawn, RN 0.81+). Son contextos GL, no motores | Manual todo: loop, batching, texturas | Solo si quisiéramos construir el motor a mano; sin beneficio sobre A/B para 5 entidades. Descartada por costo |

### 4.2 Hacks / workarounds para usar motores web dentro de RN

| Workaround | Qué implica | Veredicto |
|---|---|---|
| **E1. Phaser/PixiJS en WebView** | Mount de WebView + bundle web del juego; bridge JS↔JS (postMessage) para score/haptics/récord. "Funciona y se distribuye hoy" (grzegorzotto), pero: **5–10× más lento en Android WebView** que en Chrome desktop; dos runtimes que no comparten nada; "RN-as-a-launcher", no integración | El más viable de los hacks, pero rompe la arquitectura del repo: récord/persistencia/sonido/haptics/E2E Maestro quedarían fuera del juego; startup cost del WebView. Descartado como base; viable solo si algún día se porta el juego completo a web standalone |
| **E2. @penabt/pixi-expo (v0.2.0, feb 2026)** | Adapter **PixiJS v8 sobre expo-gl**: monta el WebGL context de expo-gl en Pixi; API PixiView drop-in; limitado: sin Canvas 2D ni HTMLText | Hack real y reciente que permitiría usar el ecosistema PixiJS en nativo. Riesgo: paquete de autor único, v0.2, adopción mínima; expo-gl debajo hereda sus límites de perf. Se documenta como opción exploratoria; no candidata para MVP |
| **E3. expo-phaser (Phaser-CE sobre expo-gl)** | Parchea globals (`document.readyState`, `window.PIXI`, texturas vía expo-asset) para correr Phaser 2 (phaser-ce) dentro de GLView | Phaser-CE es la línea muerta de Phaser 2 (2017); el repo de expo no se mantiene para SDK moderno. Descartado (histórico del hack) |
| **E4. three.js + expo-gl (expo-three / R3F nativo)** | Issues de performance crónicos en Android (EXGL peor que WebGL, issue #26 expo-three); **@react-three/native "pre-alpha, unusable" (pmndrs, dic 2025)**; three.js es escena 3D — overkill para grilla 2D | Descartado; el path 3D+WebGPU (react-native-wgpu, R3F v10) es el futuro pero "raw" hoy y exige dev build custom + resolver config + sin Expo Go |

### 4.3 Síntesis y criterios

1. Un solo runtime integrado (excluye E1 como base); 2. ~5 entidades móviles: el
requisito real es modesto — la GPU-canvas (B) es sobreingeniería salvo evidencia
de jank; 3. mantener núcleo puro testeable + seeds E2E (§3); 4. costo de bundle
y de integración; 5. mantenibilidad: preferir lo ya presente en el repo.

**Camino propuesto (encaja con el diseño agnóstico de §3)**: MVP con **A**
(Adaptador Reanimated en `renderer/`), feel-check en release build; si hay jank,
**migrar el adaptador a B (Skia)** sin tocar `engine/` — el cambio queda
confinado a `renderer/`. E2 (pixi-expo) queda documentado como workaround de
referencia. Decisión final en **ADR nuevo** (+ salvedad de alcance en ADR 0001).

> **DECISIÓN (2026-09-08, aprobada por el usuario):** se implementa el MVP con el
> **adaptador A (Views + Reanimated 4)**, siguiendo el diseño agnóstico de §3.
> El adaptador B (Skia) queda definido como contingencia documentada, no se
> construye en el MVP. Detalle y justificación en
> [ADR 0009](docs/adr/0009-wakwak-motor-agnostico.md).

## 5. Estructura (detalle de UI/render a definir según §4)

```
src/games/wakwak/
  index.ts            GameDefinition (id 'wakwak', icon 🤖, rules condensadas)
  WakWakScreen.tsx    orquestador: wiring núcleo↔adaptador, pausa, modales, onGameEnd
  engine/             NÚCLEO PURO — sin dependencias de RN ni del motor de render
    maze.ts           laberinto propio (layout ASCII → grid), helpers
    rules.ts          ticks, movimiento en grilla, colisiones, power mode, outcome
    ai.ts             4 personalidades deterministas, scatter/chase, frightened
    state.ts          store zustand (no exportado fuera de la carpeta)
    seed.ts           mulberry32 + seeds E2E sentinelas
  renderer/           PUERTO + ADAPTADORES (aquí vive TODO lo dependiente del motor)
    types.ts          puerto de presentación (createWorld/present/onDirection...)
    reanimated/       adaptador A: Views + shared values (stack del repo)
    skia/             adaptador B: canvas Skia (contingencia, solo si hay jank)
  components/         HUD, modales, overlays (UI RN estándar, agnóstica)
  __tests__/          maze, rules, ai, state
  __e2e__/            wakwak.web.spec.ts
  assets/audio/*.wav  sonidos propios
  README.md           detalle técnico + checklist legal de expresión original
  RULES.md            fuente QA de reglas
```

Cambios en core (mínimos): línea en `game-registry.ts`; nuevos IDs de sonido en
`src/core/ui/sound.ts` + wavs; haptics vía wrapper existente.

## 6. Checklist de tareas (orden de ejecución)

- [x] 1. **Decisión de motor** (§4) con el usuario; documentar en ADR nuevo ([ADR 0009](docs/adr/0009-wakwak-motor-agnostico.md); salvedad de alcance en ADR 0001 → tarea de cierre)
- [x] 2. Engine `maze.ts`: laberinto propio (diseño original) + tests
- [x] 3. Engine `rules.ts`: ticks, colisiones, túnel, power mode, win/lose + tests
- [x] 4. Engine `ai.ts`: 4 personalidades deterministas + tests
- [x] 5. Engine `state.ts` + `seed.ts` (sentinelas `test-win`/`test-lose`/`test-power`, velocidad reducida si `EXPO_PUBLIC_E2E=1`) + tests
- [x] 6. Puerto de presentación `renderer/types.ts` (contrato agnóstico) — revisar que `engine/` no importe nada de RN
- [ ] 7. UI: laberinto estático responsive (360×640 sin scroll)
- [ ] 8. UI: adaptador del loop + entidades (motor elegido) + input swipe/teclado vía el puerto
- [ ] 9. UI: HUD, pausa, modales pausa/derrota/victoria, sonidos + haptics
- [ ] 10. Assets de audio propios + nuevos IDs en `core/ui/sound.ts`
- [ ] 11. Registro en `game-registry.ts` + verificación de wiring del récord
- [ ] 12. Spec E2E `wakwak.web.spec.ts`
- [ ] 13. Docs: `README.md` (incluye checklist legal de expresión original) + `RULES.md`
- [ ] 14. Verificación estándar: `pnpm typecheck` → `pnpm test` → `node scripts/e2e.mjs` (25/25) → revisión visual 360×640
- [ ] 15. Cierre: migrar hallazgos (ADR motor, GOTCHAS si aplica, ROADMAP: v2 niveles + persistencia partida en curso), actualizar ARCHITECTURE/UI-UX si corresponde, eliminar este PLAN en el commit final

## 7. Riesgos

- **Performance en tiempo real**: primer juego del proyecto con loop continuo. Mitigación: decisión §4 con opción de migración A→B conservando la lógica pura; feel-check en release build (ver ROADMAP feel-check device).
- **E2E de juego en tiempo real**: flakiness por timing. Mitigación: motor determinista + seeds + velocidad reducida en builds E2E.
- **Audio**: los .wav deben crearse (sintetizados). Si no están a tiempo, v1 sale mudo y queda en ROADMAP (no bloquea).
- **Regla de aislamiento entre juegos**: `src/games/wakwak/` solo importa de `src/core/`; `mulberry32` sigue duplicado en el juego (deuda ya anotada en ROADMAP).
- **Legal**: verificado en §2; el riesgo residual es el "total concept and feel" — mitigado por expresión original; checklist legal incluido en el README del juego.

## 8. Notas / hallazgos (durante la implementación)

- (2026-09-08) Exploración extendida de motores (§4): no existe motor de juego RN
  completo ("the gap", grzegorzotto.dev 2026); RNGE dormido desde 2020 (techo ~50
  entidades por Views); Skia+Reanimated es la GPU path nativa creíble pero solo
  renderizador; hacks viables documentados: Phaser en WebView (5–10× más lento en
  Android, dos runtimes) y @penabt/pixi-expo (Pixi v8 sobre expo-gl, v0.2).
- (2026-09-08) Decisión de diseño: núcleo `engine/` puro + puerto de presentación
  en `renderer/types.ts` con adaptadores intercambiables (A Reanimated → B Skia);
  la migración queda confinada a `renderer/` y `WakWakScreen.tsx`.
- (pendiente) …
