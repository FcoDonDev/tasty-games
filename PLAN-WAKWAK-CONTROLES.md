# PLAN — Controles multiplataforma Wak Wak

## Contexto

Hoy el input de Wak Wak es triple pero incómodo: swipe **solo sobre el
tablero** con detección recién en `onEnd`, D-pad visible permanente en todas
las plataformas (roba alto al tablero a 360×640) y flechas de teclado en web.

Mejores prácticas confirmadas (ports oficiales de Namco: Pac-Man /
Ms. Pac-Man / Championship Edition; reseñas TouchArcade, CultOfMac,
PocketGamer, UX StackExchange):

1. **Swipe en toda la pantalla** es el modo mejor evaluado para maze-chase:
   permite "pre-giro" (mandar la dirección antes de llegar a la esquina,
   el buffer del engine ya lo aplica) y no exige un centro que memorizar.
2. El **D-pad virtual touch** es el modo más criticado ("finicky"); la práctica
   de Namco es ofrecerlo como opción configurable, no único.
3. Input buffering (dirección aplicada en la próxima intersección) — el engine
   ya lo cumple vía `queueDirection`; **el engine no se toca**.

## Objetivo

- **PC web** (puntero fino/teclado): flechas **+ WASD**; sin overlay táctil.
- **Móvil web + nativo**: setting con 2 modos, persistido en
  `preferencesRepository` (clave `wakwak.controlMode`, default `gestos`):
  - **Gestos**: Pan en toda la pantalla, dirección emitida en `onUpdate` al
    cruzar el umbral (una por gesto).
  - **Flotante**: invisible; origen donde apoya el dedo, dirección dominante
    por eje con histéresis, cambiable sin levantar el dedo. El anillo sutil de
    feedback es **configurable** (`wakwak.floatingRing`, default `0`).
- **D-pad visible: eliminado** (gana espacio para el tablero).
- El pipeline `setDirection` → `queueDirection` queda intacto.

## Decisiones de diseño (aprobadas con el usuario)

| Decisión | Elección | Alternativas descartadas |
|---|---|---|
| "Configurable" | Setting con 2 modos (gestos default / flotante), persistido | Solo gestos; joystick flotante relativo siempre activo |
| D-pad visible actual | Eliminarlo | Solo PC web; visible siempre (accesibilidad) |
| Teclado PC | Flechas + WASD | Solo flechas |
| Anillo del modo flotante | Configurable al habilitar el modo (default: oculto) | Siempre visible / nunca |

## Criterios de aceptación

- PC web: WASD/flechas mueven; no aparece toggle de modo táctil.
- Móvil (web con `pointer: coarse` y nativo): ambos modos funcionan; el toggle
  cambia de modo; preferencia sobrevive recarga.
- Modo gestos: swipe desde cualquier punto del área (no solo el tablero) emite
  dirección al cruzar ~24px sin esperar el lift.
- Modo flotante: dirección cambia durante el drag con histéresis (sin jitter en
  diagonales); anillo opcional.
- Sin D-pad: selectores `wakwak-arriba`… fuera; E2E pasa a input de teclado.
- Verificación verde: typecheck + test + e2e (25/25).

## Checklist

- [x] 1. Hook `src/core/ui/useIsTouchDevice.ts` + test
- [x] 2. `src/games/wakwak/engine/controls.ts` (puro: swipe + drag con
      histéresis) + tests
- [x] 3. Teclado WASD + flechas en `WakWakScreen`
- [x] 4. Quitar `DirectionPad`; Pan full-screen modo gestos (`onUpdate`)
- [x] 5. Modo flotante + toggle en header + persistencia (`wakwak.controlMode`,
      `wakwak.floatingRing`)
- [x] 6. Migrar E2E a teclado + spec swipe touch (`hasTouch`)
- [x] 7. Docs (README del juego)
- [x] 8. Verificación estándar: `pnpm typecheck` → `pnpm test` → e2e
      (typecheck ✓, 265 tests ✓, E2E 37/37 ✓)

## Notas / hallazgos

- **Histéresis del pad flotante por re-centrado**: en vez de histéresis
  explícita con umbrales duales, cada dirección emitida re-centra el origen del
  gesto en el punto actual (`engine/controls.ts`). Cambiar a la perpendicular
  cuesta un mini-swipe fresco (24px); invertir cuesta un tramo completo desde
  el commit — sin estados extra y trivialmente testeable.
- **Emulación móvil de Playwright** reporta `pointer: coarse` con
  `isMobile+hasTouch` → el hook de detección funciona en E2E sin canal E2E.
  Swipes reales por CDP `Input.dispatchTouchEvent` (migrado a `GOTCHAS.md`).
- **`test.use({...devices['Pixel 5']})` en un describe falla**
  (`defaultBrowserType` fuerza worker nuevo): especificar opciones una por una
  (migrado a `GOTCHAS.md`).
- **El toggle/ajustes de control solo se muestran en táctil**; en PC web el
  input es exclusivamente teclado (el Pan no existe → no interfiere con el
  mouse). Accesibilidad: el modo flotante (área completa, sin puntería fina)
  reemplaza al D-pad en móvil.
- **E2E 25→37**: la suite creció por 3 specs nuevos de wakwak (WASD, swipe
  táctil fuera del tablero, modal de control + persistencia).

## Destino de hallazgos al cierre

- Hook de detección de touch → lección técnica → `docs/GOTCHAS.md` si aplica.
- Decisión de input multiplataforma → README del juego (y ADR si escala a más
  juegos en tiempo real).
- Actualizar `docs/ROADMAP.md` / `ARCHITECTURE.md` solo si el patrón escala.
