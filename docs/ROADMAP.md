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
      si hay jank, migrar el adaptador de render a Skia (ADR 0009, el núcleo
      puro no cambia); timing del haptic y del audio contra el pickup

## Wak Wak — v2 (diferido del MVP, ver `src/games/wakwak/README.md`)

- [ ] Niveles progresivos (laberintos/velocidades distintos)
- [ ] Persistencia de partida en curso vía `gameStateRepository` (ADR 0008):
      wakwak es el primer juego que lo necesitaría por su duración real
- [ ] Ojos/drones "comidos" que regresan al corral volando (ojos clásicos) — hoy
      reaparecen directamente
- [ ] Desmultiplicador de dificultad por nivel (velocidad de drones vs robot)

## Deudas técnicas conocidas

- [ ] **React #418 (hydration mismatch)** en consola web: el HTML pre-renderizado
      difiere del primer render cliente (récords leídos de localStorage/sqlite
      durante el render inicial). No bloquea: React se recupera. Mitigación
      típica: posponer la lectura de récords a un `useEffect`. Ver
      `docs/GOTCHAS.md`.
- [ ] Refactor opcional: extraer `mulberry32` a `src/core/` (hoy duplicado en
      cada juego que lo usa, por la regla de aislamiento entre juegos).
- [ ] Pendiente de definición: score/persistencia e IA para damas (revocaría
      [ADR 0007](adr/0007-damas-mvp-local.md)).
