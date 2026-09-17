# Roadmap — trabajo pendiente

Estado del proyecto: Fases 0–4 y U1–U4 completadas; Fase D (deploy web en GCP
Cloud Run) completada. Este documento concentra lo que falta; el detalle de lo
hecho está en `docs/ARCHITECTURE.md` y en el historial de git.

## Fase E — E2E Android + release Android

⚠️ Requiere entorno con Java 17 + Android SDK/ADB (no disponibles en el entorno
de desarrollo). Ver [ADR 0003](adr/0003-e2e-android-dev-build.md).

**E2E Android (Maestro vs dev build)**

- [ ] Instalar Temurin 17 + Android SDK; `pnpm exec expo run:android` (dev build)
- [ ] Dark mode persiste tras recargar (dev build Android)
- [ ] Récords: insertar/leer en Android (expo-sqlite) — verificar DDL +
      `PRAGMA user_version`
- [ ] `memorice.android.yaml` (Maestro): partida completa → modal + récord
- [ ] `solitario.android.yaml`: movimiento legal, ilegal con snap-back,
      victoria forzada
- [ ] `damas.android.yaml`: partida corta hasta captura y fin

**Release Android**

- [ ] `eas build -p android` (preview APK / producción AAB); probar release build
- [ ] Feel-check en device de U1–U3 (ver checklist abajo)
- [ ] Validar landscape por juego en device ([ADR 0009](adr/0009-landscape-movil-por-juego.md)):
      solitario rota y muestra el rail vertical a la izquierda; damas/memorice
      y Home quedan en portrait (lock runtime); salir de solitario re-locka
      portrait. Requiere rebuild del dev build (`app.json` cambió a
      `"orientation": "default"` + plugin `expo-screen-orientation`).

**CI**

- [ ] Ampliar CI web con el job de Playwright (`pnpm e2e:web`)
- [ ] CI Android: Maestro Cloud o emulador en CI (opcional)

## Feel-check en device (diferido de Fase U4)

Lo ejecuta el usuario junto con las validaciones Android. **Release build** en
el Android más lento soportado (Expo Go / simulador no cuentan):

- [ ] Arrastrar y soltar con flick — ¿la velocidad se hereda en el settle?
- [ ] Interrumpir el snap-back a mitad de vuelo (drag nuevo)
- [ ] Drag largo de secuencia completa de tableau
- [ ] Timing del haptic contra el settle visual
- [ ] Feedback de press/haptics general de U1–U3
- [ ] **Wak Wak (tiempo real):** fluidez del loop rAF en el device más lento —
      si hay jank, migrar el adaptador de render a Skia (ADR 0010, el núcleo
      puro no cambia); timing del haptic y del audio contra el pickup

## Wak Wak — v2 (diferido del MVP, ver `src/games/wakwak/README.md`)

- [x] **Niveles progresivos** — hecho en v2 (PLAN-WAK-WAK-V2): 8 niveles con
      knobs por nivel, run continua, interstitial y `wakwak.maxLevel` persistido
      (sin laberintos distintos: mismo layout, dificultad por knobs).
- [ ] Persistencia de partida en curso vía `gameStateRepository` (ADR 0008):
      wakwak es el primer juego que lo necesitaría por su duración real (con la
      run continua de v2 la partida dura más: sube de prioridad).
- [ ] Ojos/drones "comidos" que regresan al corral volando (ojos clásicos) — hoy
      reaparecen directamente.
- [x] **Desmultiplicador de dificultad por nivel** — hecho en v2: velocidades,
      power y timers por nivel (`engine/levels.ts`) + modo Elroy (el Cazador
      acelera al final del nivel).
- [ ] Medición formal de perf del laberinto (muros fusionados + subcapa
      estática memoizada, PLAN-WAK-POLISH F4) — el bail-out de React es
      estructural; medir con el protocolo de ADR 0011 solo si aparece queja.
- [ ] Asset de explosión propio (`explosion.wav` sintetizado) si se quiere más
      dramatismo en la muerte (hoy: `hit.wav` con rate 0.7, verificado).

## Solitario — animaciones fuera de alcance (diferido de PLAN-ESCALA-CONTENIDO)

- [ ] Shake en drop inválido (el snap-back spring + `soundCardInvalid` ya lo
      comunican; evaluar costo/beneficio antes de sumarlo)
- [ ] Cascada tipo Windows en victoria (cartas rebotando al ganar — costo alto
      de maquinaria; el modal de victoria ya entra con `overlayEnter`)
- [ ] Flip en el draw (cartas que montan ya boca arriba en la waste no animan:
      requeriría pasar "rode de robo" como fase al flip, mismo patrón del
      reparto) — solo si se percibe como vacío al robar

## Serpiente — deuda diferida (cierre de PLAN-SERPIENTE)

- [ ] **Validación nativa** (requiere toolchain Android, [ADR 0003](adr/0003-e2e-android-dev-build.md)):
  haptics `hapticHeavy`/`hapticCombo` (Medium) en device, prime selectivo de
  audio, y los dos modos táctiles (swipe sobre HUD + control flotante con
  anillo). Todo validado solo en web a la fecha.
- [ ] **Baselines de performance completas** ([ADR 0011](adr/0011-metricas-performance.md)):
  corrieron las instrumentadas estándar (3 escenarios, `tmp/perf/`);
  faltan las variantes throttle CPU ×4 (`PERF_THROTTLE=4`) y build con
  profiling (`EXPO_PUBLIC_PERF_PROFILING=1`) para `render.board`.
- [ ] **PoC Skia aislado (opcional)**: si se evalúan excepciones futuras a
  [ADR 0001](adr/0001-render-sin-skia.md), hacerlo como V4 en la galería
  `/serpiente-preview` (mismo mock, medible con perf metrics) — no
  reescribiendo el juego en producción. Ver ADR 0014 §Consecuencias.

## Robo Jump — fase 2 (diferida del cierre de PLAN-DOODLE-JUMP)

- [ ] Amenazas del original: UFO (abducción) y black hole (absorción).
- [ ] Power-ups restantes: trampolín (backflip que anula disparo), spring
      shoes, escudo, cohete; plataformas gris (vertical) y amarillo-rojo
      (explota).
- [ ] **Marcador de récord "dibujado en el margen del papel"**: el mejor
      score propio garabateado en el margen a la altura alcanzada (mecánica
      firma del original; requiere leer el récord del juego en la pantalla
      — sin romper D4/récords via `recordsRepository`).
- [ ] Monstruos multi-golpe (2-4 disparos según tamaño, fiel al original;
      hoy mueren de 1) y apuntado al tap ("laser", medir si aporta frente
      al facing actual).
- [ ] Tilt nativo (expo-sensors) y sheet de ajustes/sensibilidad de drag;
      temas visuales y misiones/logros.
- [ ] Medición del juice (partículas/loops de monstruos) en device Android
      con [ADR 0011](adr/0011-metricas-performance.md) — hoy validado solo
      en web (~63 fps con pools/loops activos).
- [ ] Fix menor: warning Reanimated "transform overwritten by layout
      animation" en `FloatingPopup` (robo-jump) — wrap del `entering`/
      `exiting` en un Animated.View externo.

## Deudas técnicas conocidas

- [ ] **Personalizar los iconos PWA**: hoy son escalados de
      `assets/images/icon.png` ([ADR 0013](adr/0013-pwa-instalable-sin-service-worker.md));
      diseñar el set propio (192/512, maskable, apple-touch-icon 180×180) y
      regenerar `public/`.
- [ ] **Offline vía Service Worker** (solo si aparece el caso de uso real):
      SW mínimo network-first + skipWaiting + auto-reload, integrado al export
      de forma deliberada — ver [ADR 0013](adr/0013-pwa-instalable-sin-service-worker.md)
      por qué se omitió (riesgo de cache-stale contra el flujo e2e).
- [ ] **`viewport-fit=cover` + safe-areas iOS**: el default (sin safe-areas)
      funciona; sumarlo solo probándolo con notch real en device (diferido de
      PLAN-PWA).
- [ ] **Landscape sin adaptar en damas/memorice**: el patrón existe
      ([ADR 0009](adr/0009-landscape-movil-por-juego.md): `supportsLandscape` +
      `useLandscapeMobile` + `GameHeader variant="vertical"`); ambos juegos
      quedan portrait-locked hasta adoptarlo.
- [ ] **React #418 (hydration mismatch)** en consola web: el HTML pre-renderizado
      difiere del primer render cliente (récords leídos de localStorage/sqlite
      durante el render inicial). No bloquea: React se recupera. Mitigación
      típica: posponer la lectura de récords a un `useEffect`. Ver
      `docs/GOTCHAS.md`.
- [ ] Refactor opcional: extraer `mulberry32` a `src/core/` (hoy duplicado en
      cada juego que lo usa, por la regla de aislamiento entre juegos).
- [ ] Pendiente de definición: score/persistencia e IA para damas (revocaría
      [ADR 0007](adr/0007-damas-mvp-local.md)).
- [ ] **Performance (métricas, [ADR 0011](adr/0011-metricas-performance.md))**:
      - Validar comparabilidad de relojes UI→JS en Android (`_getAnimationTimestamp`
        vs `performance.now` del JS thread) — hoy solo validado en web.
      - Persistir métricas en sqlite (sesiones nativas) — hoy memoria + consola.
      - Mover `dragKey` a shared value en el patrón de drag (`src/core/ui/drag/`)
        para eliminar los pases baratos de todas las pilas al iniciar/terminar un
        drag (los PileCard internos ya saltan por memo).
      - Guardado debounceado del estado en curso: mover a idle solo si la medición
        en dispositivo muestra jank (web/nativo es µs hoy).
- [ ] **Audio/jank iOS web (PLAN-SAFARI-WEBKIT F5, ADR 0015)**: validar en
      iPhone real que cada SFX suena inmediato tras la migración a Web Audio;
      si los mini-saltos persisten, medir con Safari-Mac + Web Inspector +
      `EXPO_PUBLIC_PERF_METRICS=1` (`perf-metrics-wakwak`): los contadores
      `jsStall.*`/`uiFrame.maxDt` deciden si se ataca GC de JavaScriptCore
      (conecta con D-WW del PLAN-PERFORMANCE) o se cierra como límite del
      motor. Los stalls residuales de WebKitGTK (32-41 por 20s en corridas
      con carga de máquina) quedan atribuidos al motor y sin attack.
- [ ] **E2E `fix-wrap` (robo-jump) falla intermitente**: el Robo muere a mitad
      de la coreografía de teclado (overlay "Fin del salto 11 m") y el spec
      espera el overlay oculto. Confirmado PREEXISTENTE en `main` (falla
      también sin los cambios de PLAN-BEST-SCORE; en suite a veces pasa).
      Sospechoso: dependencia de timing real (keyboard.down 1500 ms + drops
      de frame) — reproducir con `node scripts/e2e.mjs -- -g "fix-wrap"`.
