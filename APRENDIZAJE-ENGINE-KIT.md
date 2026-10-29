# APRENDIZAJE-ENGINE-KIT — Desentrañando los fundamentos de nuestro propio motor

**Estado:** Documento de aprendizaje vivo — crece con cada fase del kit. Sin
implementación (companion del [PLAN-ENGINE-KIT.md](PLAN-ENGINE-KIT.md)).
**Fecha de arranque:** 2026-10-29 · Branch `feature/engine-kit`
**Uso:** cada capítulo trata UN aspecto técnico: teoría (con fuentes) → ejemplo
mínimo en TS → cómo lo intentaron resolver la librería de referencia
(`react-native-game-engine`, aquí "RNGE") y los motores grandes → cómo lo
resolverá nuestro kit (módulo, fase, tests). Al cerrar el PLAN, este documento
migra a su destino definitivo (tarea en Fase 3 del PLAN).

---

## 0. Qué es "un motor" y qué elegimos ser

La línea que separa motor de librería, según Nystrom (Game Programming Patterns):

> "With libraries, you own the main game loop and call into the library.
> An engine owns the loop and calls into *your* code."

Un **motor** (Unity, Godot, Phaser) es un runtime *dueño* del loop, del clock,
del render y de los assets: tú escribes callbacks que él invoca. Una
**librería** te entrega piezas y TU app tiene el loop.

**Cómo lo resuelve tasty-engine:** somos deliberadamente "librería + patrón"
(ADR 0010): la pantalla React conserva el ownership del loop (rAF en JS thread);
el kit presta la maquinaria (timestep fijo, RNG, input, auto-pausa) y define el
puerto de presentación. Un motor RN "dueño" no es posible de todos modos: el
browser/host posee el event loop y RN corre en el JS thread del host (Nystrom,
§"You may need to coordinate with the platform's event loop": *"[en browser]
the event loop will run the show, and you'll use it as your game loop too"*).
Esta es la raíz de por qué el gap de ADR 0010 existe.

**Referencia a la implementación:** superficie del kit = §5 del PLAN (Fase 0).

---

## 1. El game loop: por qué un juego no es una app

### Teoría

Una app React "no hace nada" hasta que hay input (event loop del host). Un juego
"sigue avanzando sin input" — el mundo tiene su propio reloj (Nystrom, *Game
Loop*: "Unlike most other software, games keep moving even when the user isn't
providing input"). El loop mínimo:

```ts
// El shape de todo loop de juego (Nystrom)
while (true) {
  processInput();  // sin bloquear
  update(dt);      // avanza la simulación paso a paso
  render();        // dibuja el estado actual
}
```

Dos propiedades que el loop debe garantizarse (Nystrom):
1. **Procesa input sin esperar** por él.
2. **Corre a velocidad consistente** independiente del hardware — ahí entra el
   timestep (cap. 2).

En RN el loop anfitrión es `requestAnimationFrame` del runtime (web: browser;
nativo: el scheduler de React Native). Nuestros tres juegos usan exactamente ese
patrón: `WakWakScreen.tsx` (~L432), `RoboJumpScreen.tsx` (~L471),
`SerpienteScreen.tsx` (~L462).

### Ejemplo mínimo (nuestro estilo)

```ts
let raf = 0, last = 0;
function frame(now: number): void {
  const dt = Math.min(25, now - (last || now)); // guard de stall (ADR 0011)
  last = now;
  store.tick(dt);            // simulación
  renderer.present(clip);    // presentación
  raf = requestAnimationFrame(frame);
}
raf = requestAnimationFrame(frame);
// cleanup: cancelAnimationFrame(raf) al desmontar
```

### Cómo lo intentó RNGE

Su `GameLoop.js`/`GameEngine.js` instalan un rAF idéntico (`DefaultTimer.js`,
~40 líneas, acreditado a `react-game-kit` de FormidableLabs — otrora también
muerta). La idea "timer inyectable" era buena (`<GameEngine timer={...}/>`);
la maquinaria era tan pequeña que **el loop nunca fue el valor** de la librería.

**Bug que explica mucho:** en `DefaultTimer.loop()` el re-agendamiento es
incondicional al final de cada callback — y la issue #64 ("Default timer
doesn't stop when calling `.stop()`", 2021, **sigue abierta**) documenta que
`stop()` deja un rAF zombi por estado de closure adelantado en un frame. El
autor respondió "lo reproduzco el fin de semana"… nunca lo hizo. Lección: en el
código más caliente del juego (el loop), un bug pequeño queda pegajoso por
años si el módulo no tiene tests.

### → tasty-engine

`src/core/engine/gameLoop.ts` (Fase 1): hook `useGameLoop({ onFrame, clampMs,
paused })` con cancelación probada. Test de regresión explícito del caso RNGE
(stop no deja rAF pendiente; re-start funciona). El guard de stall (dt > 25 ms,
presupuesto de ADR 0011) vive acá, no en cada pantalla.

---

## 2. El tiempo: timestep variable vs fijo vs acumulador

### Teoría

Cuatro opciones (Nystrom + Fiedler, artículo canónico "Fix Your Timestep!"):

1. **Fijo sin sincronizar** — `update(dt=1/60)` corriendo lo más rápido posible.
   Simple, pero la velocidad depende del hardware.
2. **Fijo con sleep** — compensa el extra de tiempo esperando; si el frame
   tarda más de 16 ms, el juego SILENCIOSamente corre lento (el sleep no
   viaja hacia atrás).
3. **Variable** (`update(dtReal)`) — se adapta al hardware, pero **mata el
   determinismo**: no hay estabilidad de física (osciladores explotan, balas
   atraviesan paredes) y el mismo input produce outputs distintos según el
   framerate (Nystrom: *"non-deterministic and unstable"*).
4. **Fijo + acumulador** (la recomendada): *el render produce tiempo y la
   simulación lo consume en pasos de dt* (Fiedler):

```ts
let acc = 0, last = now();
function frame() {
  const dtReal = clamp(now() - last, 0, 0.25); // anti-espiral por frame
  last = now();
  acc += dtReal;
  while (acc >= DT) {           // DT fijo
    step();                     // SIEMPRE dt exacto
    acc -= DT;
  }
  render(acc / DT);             // sobrante 0..1 → interpolación (cap. 3)
}
```

El **spiral of death** (Fiedler): si simular X s cuesta >X s de wall-clock, la
deuda crece y el juego "entra en espiral". Se acota con un tope de pasos por
frame (aceptando un frame lento en vez de morir).

**Dato clave para el E2E**: el mismo `dt` en el mismo orden ⇒ misma simulación
(determinismo). Ese es el requisito que nuestras sentinelas E2E (ADR 0006)
exigen y que RNGE jamás ofreció.

### Cómo lo intentó RNGE

Solo opción 3: `delta = currentTime - previousTime` en wall-clock, sin
acumulador, sin paso fijo, sin tope. Consecuencia práctica documentada en la
propia issue #64 (comentario de 2021): *en una iPad/pantalla de 120 Hz "todo
en pantalla se mueve dos veces más rápido"* — el defecto clásico del timestep
variable, versionado en el README durante años sin remedio.

### Cómo lo resuelven los motores grandes

| Motor | Convención | Nota oficial |
|---|---|---|
| Unity | `FixedUpdate()` (física) + `Update()` (por frame) | docs.unity.com: el intervalo "isn't fixed in practice" — la física corre en pasos fijos de *in-game time* |
| Godot | `_physics_process` a `physics_ticks_per_second` (default 60) desacoplado del framerate + `_process` variable | docs.godotengine.org: "independent of your game's actual framerate"; interpolación de física integrada opcional |
| Bevy | Schedule `FixedUpdate` con `Time::<Fixed>` (default 64 Hz) | docs.rs/bevy: "run as many times as needed to catch up" |
| Phaser | `Phaser.Core.TimeStep` con rAF y dt variable (smoothing + factor de interpolación opcional) | runtime web; su nicho es casual web, donde determinismo dura poco |

Observa: **sitios distintos, misma respuesta** (paso fijo para la
simulación, render desacoplado). RNGE es la excepción del ecosistema.

### → tasty-engine

`src/core/engine/timestep.ts` (Fase 2): `advanceFixed(state, dtMs, { stepMs,
maxSteps, step }) → { state, events, leftoverMs }` — equivalente TS del
acumulador de Fiedler, con guard anti-espiral (`maxSteps`, como `MAX_SUBSTEPS`
de robo-jump y el `guard < 8` de wakwak). Convención **ADR 0014**: el sobrante
NO viaja en el estado — lo guarda el llamador (única fuente de verdad; el bug
del doble-contado es GOTCHAS de serpiente). Tests de cadencia con dts chicos
(9×16 ms) + pasos exactos, lección GOTCHAS.

Hoy coexisten dos variantes en el repo: wakwak acumula dentro del estado
(`state.remainderMs`). Migrarlo es la prueba de fuego del kit (PLAN Fase 2).

---

## 3. Separar simulación de presentación: el puerto y la interpolación

### Teoría

El loop fijo deja la simulación "presentable" solo en instantes discretos;
el render ocurre a otra cadencia. Fiedler: interpolar entre el estado previo
y el actual con `alpha = acc / DT`:

```ts
render(alpha) {
  pos = lerp(prev.pos, curr.pos, alpha); // 0..1 del paso
}
```

Nuestro repo ya hace esto de dos maneras:
- **wakwak**: `floatPos(entity)` interpola por progreso 0..1 dentro de la
  celda (las posiciones viven en el estado), y `worldSnapshot()` las entrega
  al adaptador — es `render(alpha)` disfrazado de snapshot.
- **serpiente** (ADR 0014): el estado va en celdas discretas y el RENDER
  desliza cada nodo con `getStepProgress()` (alpha) desde el loop — el
  engine intacto, la interpolación en el adaptador.
- **robo-jump**: física continua (sub-pasos de 8 ms); el render no usa alpha
  sino que lee el estado mutado por shared values (`getGame()`).

La lección de arquitectura: la interpolación es asunto del **adaptador**, no
del núcleo — por eso ADR 0014 la deja en el renderer y el puerto no cambia.

### Cómo lo intentó RNGE

No separaba nada: el render era la reconciliación de React. Su
`GameEngine.updateHandler` corre TODOS los systems y termina:

```js
let newState = this.props.systems.reduce((state, sys) => sys(state, args), this.state.entities);
// ...
this.setState({ entities: newState }); // cada frame, SIEMPRE
```

y `DefaultRenderer` mapea cada entidad con `renderer` a un elemento JSX (una
View por entidad). Resultado medido por un usuario (issue #18, 2020): *"the
FPS dropped from 60 to around 30 only with this code"* — con un `GameEngine`
**vacío** (sin systems ni entities). El techo de ~50 entidades del ADR 0010
viene exactamente de acá: no es un detalle optimizable, es el modelo
(setState-per-frame + View-per-entity).

### → tasty-engine

`src/core/engine/port.ts` (Fase 2): `RendererPort<S>` con
`createWorld/present/destroy` — wakwak ya implementa ese contrato
(`renderer/types.ts`), a robo-jump se le formaliza sobre su estrategia actual
(shared values + `getGame()`, cero reconciliación por frame). El kit NO elige
por ti (PLAN D3): wakwak publica si cambió; robo-jump nunca publica un frame.
Ambos son válidos (discreto vs continuo); el kit solo prohíbe lo que
experimentó RNGE: *reconciliación de React como mecanismo de render per-frame*.

---

## 4. Determinismo y RNG sembrado

### Teoría

Determinismo = mismo estado + mismos inputs + misma semilla ⇒ misma salida.
Sirve para: E2E repetible, replays, netcode (Fiedler: *deterministic lockstep*)
y debugging (Nystrom). Requiere PRNG sembrado NO global (`Math.random` es
indeclinable), y —si el estado debe serializarse— que el PRNG sea una
**transición de estado**, no una closure:

```ts
// forma closure (API cómoda)
const rng = mulberry32(seed);          // () => number
// forma transición (serializable)
const next = (seed: number): { value: number; seed: number } => {
  const a = (seed + 0x6d2b79f5) | 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, seed: a };
};
```

Ambas son **el mismo algoritmo** (mulberry32): la transición es el cuerpo del
closure con el estado expuesto. Derivación de streams por nivel
(`levelRngSeed(base, level)`; wakwak ×7919) evita patrones correlacionados.

### Cómo lo intentó RNGE

Historia cero: sin RNG propio, sin seed, sin contrato de determinismo (los
systems usan el estado mutable que el usuario quiera). Consecuencia para
nuestro proyecto: con esa base NUNCA hubiera podido implementar sentinelas
E2E repetibles (ADR 0006).

### → tasty-engine

`src/core/engine/rng.ts` (Fase 1): **una** implementación, **dos APIs**
(`mulberry32` closure + `next` transición) + `hashSeed` (FNV-1a, string→uint32)
+ `levelSeed(base, lvl)`. Test de igualdad de secuencias contra las copias
actuales. Deuda ROADMAP ("extraer mulberry32") se cierra acá. Los sentinelas
se quedan por juego (son contenido E2E, no librería).

---

## 5. Input de dirección: buffering y gesto flotante

### Teoría

Un juego en tiempo real no se cae si el input llega entre pasos: se **bufferiza**
y se consume en el paso siguiente. Decisiones clásicas:
- **Buffer acotado con prioridad al último** (wakwak: cola de 2, el nuevo
  prepondera y el viejo queda como fallback) — el "último input prevalece" del
  Pac-Man Dossier.
- **Reversa inmediata** (si el input es oposición de la dirección vigente,
  gira YA, no espera la intersección).
- **Gesto flotante con re-centrado** (histéresis): al emitir una dirección, el
  origen salta al punto actual — girar a la perpendicular cuesta un mini-swipe
  y invertir cuesta 2× threshold. Sin esto, las diagonales emiten giros falsos.

```ts
// eje dominante: una decisión, dos gestos
const dominant = (dx: number, dy: number): Direction =>
  Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
```

### Cómo lo intentó RNGE

`DefaultTouchProcessor` construía con **RxJS** un mini-DSL de streams
(press/long-press/move-delta por touch-id). Poderoso y pesado (rxjs como
dependencia transversal de un engine), y constantemente desbordado: issues
#55 (multi-touch, 26 comentarios), #71 ("Best way to handle touch as
directional control", abierta) — la librería nunca regaló abstracción de
input de dirección; cada usuario lo cocinó.

### → tasty-engine

`src/core/engine/direction.ts` (Fase 1): eje dominante + máquina del gesto
flotante re-centrado + mapa de teclas **inyectable** (los thresholds tuned de
wakwak 18/24 no se tocan — D5). Migración con tests existentes de wakwak (12)
y serpiente (4) portados. Lo que NO entra: la mecánica específica (disparo
dirigido de robo-jump es su regla).

---

## 6. Eventos discretos: la API de salida del núcleo

### Teoría

El núcleo no conoce sonidos ni haptics ni animaciones: **emite eventos** y el
adaptador decide qué hacer con cada uno. Dos detalles que nuestro repo ya
sufrió y resolvió:
1. **Payload completo**: si un evento necesita la POSICIÓN de la causa
   (muerte de wakwak), el engine la manda en el payload — inferirla del estado
   posterior produce flashes en la celda equivocada (GOTCHAS serpiente).
2. **Disparo LO PRIMERO del handler** para audio/haptics sensibles a latencia
   (GOTCHAS: el round-trip de `seekTo().then()` sumaba desfase).

```ts
type GameEvent =
  | { type: 'battery' }
  | { type: 'caught'; x: number; y: number } // posición de la causa, no la inferimos
  | { type: 'won' };
```

### Cómo lo intentó RNGE

Arreglo `events` por frame + `dispatch()` con `setTimeout(0)` — la cola se
limpia cada frame y hay `onEvent` global. La idea (cola por frame) era
correcta; el contenido era tarea del usuario: sin tipos, sin contrato.

### → tasty-engine

El kit define solo la CONVENCIÓN: `advanceFixed` devuelve los eventos del
frame; el mapeo evento→feedback queda por juego (los sonidos/payloads son
contenido). Opción futura (D6-b, no aprobada): una tabla declarativa
evento→feedback en core/ui — hoy sería sobreingeniería.

---

## 7. Ciclo de vida: pausa, app al fondo, reduced motion

### Teoría

Tres gatillos de congelación que no puede manejar el núcleo (necesitan
plataforma):
- **App al fondo**: `AppState` (nativo) / `visibilitychange` (web) →
  auto-pausa; al volver, descartar el dt acumulado (el `last = null` del loop).
- **Pausa del jugador**: el `tick` no avanza acumulador ni publica eventos —
  el render congela interpolaciones (ADR 0014).
- **Reduced motion** (`useReducedMotion`): saltos discretos sin tweening.

```ts
// uso de nuestros screens hoy (idéntico ×3 → duplicación a extraer)
document.addEventListener('visibilitychange', onVisibility);
const sub = AppState.addEventListener('change', (s) => {
  if (s.match?.(/background|inactive/) && jugando()) pausar();
});
```

### Cómo lo intentó RNGE

Solo un boolean `running` en props con `UNSAFE_componentWillReceiveProps` —
ni AppState, ni visibility, ni reduced motion (años antes de que el
ecosistema los llamara). Solo entregaba "el loop": su manejo del ciclo de vida
era trivial (`running` on/off).

### → tasty-engine

`gameLoop.ts` trae `useAutoPause({ shouldPause, onPause })` (Fase 1): una sola
implementación con guard de plataforma, testeable con las APIs de RN mokeadas
de Jest. Regresión E2E: Hoy no hay spec que candee explícitamente la
auto-pausa; el comportamiento observable (pantalla pausada, dt descartado)
se valida en la suite completa tal como hasta ahora.

---

## 8. Testing headless de un motor

### Teoría

Si el núcleo es puro (sin RN, sin render), el motor se testea SIN UI:
- **Unit de reglas** (35 tests de wakwak-rules, 34 de robo-rules).
- **Golden de cadencia**: mismas entradas → mismos pasos/eventos (guardamos
  la salida ANTES de refactorizar y comparamos después — el plan de la Fase 2).
- **Semillas**: `perf-level-1`/`towerPlatforms()` (fixtures con mundos
  cerrados, `closed: true` de robo-jump que anula la generación).
- **E2E con seeds** (sentinelas) y CDP para gestos (GOTCHAS).
- **Perf harness** (ADR 0011): `advanceSamples`, p95 de `loop.advance`,
  stalls; snapshot de wall-clock presupuesto.

### Cómo lo intentó RNGE

Imposible de testear por unidad: el engine ES un componente React (los systems,
entidades y el loop viven dentro del ciclo de vida del componente). El único
testing realista era manual o E2E. Esto es directamente la causa de que el
bug del timer viviera 5 años abierto sin fix.

### → tasty-engine

Regla estructural del repo (AGENTS/ARCHITECTURE): engines puros + tests
junto al código. El kit es el caso extremo: cada módulo de
`src/core/engine/` es puro o hook inyectable, testeable sin render
(incluido el caso "stop no deja rAF" — RNGE bug).

---

## 9. Cómo operan los motores grandes (síntesis)

Todos los motores conocidos comparten la misma anatomía mínima; la diferencia
es DÓNDE corre y qué poseen:

| Motor | Modelo de código | Loop | Timestep | Pausa |
|---|---|---|---|---|
| **Unity** (C#/C++ nativo) | OOP: GameObjects + components (`MonoBehaviour`) | Player loop nativo | `FixedUpdate` (física, en in-game time) + `Update` (por frame) + `LateUpdate` | Runtime nativo; `OnApplicationPause` |
| **Godot** (C++/GDScript) | Árbol de Nodes con `_process`/`_physics_process` por nodo | `MainLoop`/`SceneTree` | `physics_ticks_per_second` (60 default) desacoplado del render; interpolación integrada | `process_mode` POR NODO (pausa jerárquica nativa) |
| **Bevy** (Rust, ECS) | Systems + schedules sobre componentes (ECS) | Schedules (el runtime arma el orden) | `FixedUpdate` schedule, `Time::<Fixed>` 64 Hz con catch-up | schedules con flag de pausa / check de estado |
| **Phaser** (JS web) | Scenes + Game Objects sobre Canvas/WebGL | `Phaser.Core.TimeStep` (rAF) + scenes | dt variable con smoothing (determinismo no objetivo) | `scene.pause()`/scene states |
| **RNGE** (JS RN, muerta) | CES por entidades + systems (setState-per-frame) | rAF JS thread | dt variable sin acumulador (¡120 Hz = ×2!) | `running` prop |

**Lo que copiamos**: de Unity/Godot la separación física-fija vs render, y de
Godot la idea de "congelar por zonas" (nuestro `feel.ts` escala el dt — el
equivalente aproximado de un `process_mode = PAUSED` parcial por nodo).
**Lo que NO copiamos**: árboles de escena, ECS, engines dueños del
thread/runloop — incompatibles con RN donde el loop raíz es del host y el
render es React.

La lectura del patrón: **todas** son "simulación con paso fijo desacoplada
del render" — incluso Phaser lo mitiga con smoothing. RNGE es la única
del listado que ni siquiera lo intentó. No es casual que sea la dormida.

---

## 10. Autopsia completa de react-native-game-engine (el antecedente clave)

*(la versión compacta para decisiones vive en PLAN-ENGINE-KIT.md §2.B; acá el detalle con código)*

**Línea de vida:** 1.0 (enero 2020) → 1.2.0 (**jun 2020**, última release de código) →
patch-1 (2022) → commits posteriores **solo README en dic-2024** (enlazar el
juego comercial "Cannon Ball Sea" del autor). Issue #78 *"is there anyone who
is maintaining this library yet?"* (2023) abierta sin respuesta efectiva. Hoy
~6.6k descargas/mes (oct-2026) frente a ~5.9M de Skia — se usa, nadie lo
mantiene.

**Causa 1 — el modelo de render no escalaba (arquitectónica):**
`updateHandler` hacía `this.setState({ entities })` **cada frame** y el
`DefaultRenderer` montaba una View por entidad. Evidencia: issue #18
(Android performance, abierta desde 2019, 34 comentarios): 60→30 fps con un
GameEngine VACÍO en device físico. El propio README recomienda Godot/Unity
para uso comercial — el autor lo dijo primero.

**Causa 2 — el tiempo estaba mal hecho (técnica):** rAF crudo, delta
variable sin acumulador ni paso fijo: en 120 Hz la partida corre ×2
(issue #64, comentarios 2021). Sin determinismo no hay seeds/replays/E2E —
de ahí que su comunidad nunca construyó pruebas automatizadas confiables.

**Causa 3 — el core tenía bugs pegajosos:** el timer no paraba (issue #64,
diagnosticada por un usuario con parche propuesto; el fix nunca llegó);
la librería era intesteable por diseño (engine = componente React), sin unit
tests propios, sin hot path crítico protegido.

**Causa 4 — el ecosistema la despachó:** componentes de clase +
`UNSAFE_componentWillReceiveProps`, sin TypeScript de serie (issues #14, #60,
#80 pidiendo tipos), sin New Architecture (Fabric); mientras RN 2020-2026
iba hacia Reanimated (UI-thread), Skia (GPU), Expo SDK. Su "glue"
rAF+CES era replicable en un fin de semana (así lo hicimos), y el valor
potencial (motor completo) exigía justo lo que el modelo no permitía
(rendimiento por frames). Issues #72 (drift de Expo SDK) y #79 (re-render
por entities change) son testimonio del abandono.

**Lecciones aplicadas directamente a tasty-engine** (mapa a decisiones):

| Lección de RNGE | Decisión del kit |
|---|---|
| setState-per-frame = techo 50 entidades | el kit prohíbe reconciliación por frame; publication strategy por juego (D3), interpolation en adaptador |
| dt variable → no determinismo, ×2 en 120 Hz | timestep fijo obligatorio con acumulador convención ADR 0014 (D2) + test de cadencia |
| timer con bug vivo 5 años | `useGameLoop` con tests de cancel/restart/stride desde el día 1 (Fase 1) |
| sin tipos / drift de TS | módulos TS strict + tipos de puerto propios (todo el kit) |
| núcleo como componente React → intesteable | núcleo puro + hooks; cero imports de RN en engine/ |
| sin RNG / input / ciclo de vida propios | rng/direction/gameLoop del kit (Fase 1) llenan exactamente esas carencias |
| README decía "usá Godot para comercial" | nuestro kit NO pretende ser "motor completo": superficie acotada §5 (Fase 0, D6) |

**Respuesta directa a "¿podemos determinarlo?"**: sí, con evidencia directa
(código fuente del repo master, issues propias numeradas, releases npm con
fechas, downloads actuales) + testimonios públicos (comments de bberak en
#18 y #64). Conjetura residual (no verificable): motivos personales del
mantenedor (no hay blog/anuncio del porqué del abandono); en 2024
solo volvió a enlazar su juego.

---

## 11. Preguntas abiertas para desentrañar DURANTE la implementación

(Que este doc cierra fase a fase — se actualiza con cada hallazgo):

- [ ] ¿La convención `leftoverMs` cambia el feel de wakwak? (Fase 2: golden
      antes/después, E2E igual).
- [ ] ¿`useGameLoop` con inyección de clock basta para testear stalls en Jest?
      (Fase 1: el mock de performance.now de RN).
- [ ] ¿Un solo `direction.ts` sostiene perfiles tan distintos como wakwak
      (histéresis 18/24) y serpiente (24)? (Fase 1: tests portados verde).
- [ ] ¿El puerto `RendererPort<S>` con genérico simple alcanza, o caemos en
      costos de abstracción? (Fase 2: robo-jump debe quedar igual).
- [ ] Añadir SERPIENTE como tercer consumidor (opción D6-a) — más valor
      (convención única), +blast radius. Decidir con datos de Fase 2.

## 12. Fuentes (acceso 2026-10-28/29)

- Nystrom, *Game Programming Patterns* — Game Loop:
  https://gameprogrammingpatterns.com/game-loop.html
- Fiedler, "Fix Your Timestep!": https://gafferongames.com/post/fix_your_timestep/
- RNGE repo + fuentes `src/` (master):
  https://github.com/bberak/react-native-game-engine (+ issues #18, #64, #78)
- npm registry + api.npmjs.org (releases y descargas, 28 oct 2026).
- GitHub API: Shopify/react-native-skia → wcandillon/react-native-skia,
  penabt/pixi-expo, ahsanmunyr/rn-game-engine-next, api.npmjs.org (releases y descargas).
- Unity docs — Execution order / FixedUpdate:
  https://docs.unity.com/engine/7000.0/manual/scripting/managing-time-and-frame-rate/fixed-updates
- Godot docs — Idle and Physics Processing / Physics interpolation:
  https://docs.godotengine.org/en/stable/tutorials/scripting/idle_and_physics_processing.html
- Bevy — `bevy::time::Fixed` + Fixed Timestep cheat book:
  https://docs.rs/bevy/latest/bevy/time/struct.Fixed.html,
  https://bevy-cheatbook.github.io/fundamentals/fixed-timestep.html
- Phaser — `Phaser.Core.TimeStep` (docs API; runtime web).
- ADRs del repo: 0010 (motor agnóstico), 0014 (timestep fijo), 0011 (perf).
