# Plan de mejoras solitario — Fase S1 (auto-move a foundation + sonidos)

> Complemento de `PLAN-IMPLEMENTACION.md` y `PLAN-UI-UX.md`. Estado de ejecución marcado con checkboxes.
> Origen: mejora solicitada por usuario sobre el solitario (Fases 0–4 y U1–U3 completadas).
> Decisiones de usuario: toggle de sonido **global** (ajustes + `useAppStore`) · assets **WAV sintéticos generados** · activadores **doble tap (todas las plataformas) + clic derecho (solo web)**.

---

## 1. Objetivos

1. **Auto-envío a foundation**: doble tap (o clic derecho en web) sobre una carta elegible (as, o la carta siguiente de una foundation) la manda directo al stack superior correspondiente.
2. **Sonidos**: feedback de audio para acciones del solitario (robar, drop válido, snap-back inválido, victoria), con toggle global en Ajustes.

Fuera de alcance: animación de vuelo para el auto-move (commit instantáneo + sonido/haptic); sonidos en memorice/damas.

---

## 2. Checklist de implementación

### A. Engine — auto-move (puro, testable)

- [x] `src/games/solitario/engine/state.ts`:
  - [ ] Extraer helper privado de commit (`_commitMove`) compartido entre `moveCards` y la nueva acción, para no duplicar history/moves/endFlags.
  - [ ] Nueva acción `autoMoveToFoundation(from: PileRef): boolean`:
    - [ ] Mismos guards que `moveCards` (`finishedAt !== null || stuck` → `false`).
    - [ ] `canPickUp(s, from)` → exige `moving.length === 1`.
    - [ ] Target deducido: `foundationIndexFor(moving[0])`; valida con `canDropOnFoundation` → `false` si no aplica.
    - [ ] Ejecuta commit (history, moves+1, startedAt, endFlags), devuelve `true`.
- [x] `src/games/solitario/__tests__/state.test.ts` — casos nuevos:
  - [ ] As de waste → foundation correcta (`true`, carta movida, `moves+1`).
  - [ ] Carta siguiente de foundation-eligible desde tableau top → `true`.
  - [ ] Carta no elegible (rey, o sin encajar) → `false`, estado intacto.
  - [ ] Subsecuencia de tableau con más de 1 carta → `false`.
  - [ ] Carta no-top del tableau (rompe `canPickUp`? no: `canPickUp` permite secuencia; el `length===1` filtra) → `false`.
  - [ ] Con `finishedAt` seteado → `false`.
  - [ ] Undo restaura el estado previo al auto-move (con undoEnabled).

### B. Gesto — doble tap reutilizable

- [x] `src/core/ui/drag/useDraggable.ts`:
  - [ ] `DragCallbacks` gana `onDoubleTap?: (id: string) => void`.
  - [ ] Componer `Gesture.Tap().numberOfTaps(2)` con el Pan existente (`Gesture.Simultaneous` o el agregado que mejor convenga); tap `enabled(enabled)` igual que el Pan.
  - [ ] `onStart` del tap → `scheduleOnRN(callbacks.onDoubleTap, id)` solo si está definido.
  - [ ] El Pan exige `activeOffsetX/Y ±6px` → un tap no lo activa; verificar que el tap no rompa el drag (regresión con specs E2E existentes de drag).
- [x] Damas consume `useDragGesture` sin pasar `onDoubleTap` → comportamiento actual intacto (regresión por E2E).

### C. Clic derecho (web) — `src/games/solitario/components/Pile.tsx`

- [x] `PileCard` acepta `onAutoMove?: () => void` y lo conecta a `onContextMenu` del `Animated.View` (solo dispara en web; en nativo el evento no ocurre).
- [x] `Pile` propaga el callback hacia sus cartas.

### D. Integración — `src/games/solitario/SolitarioScreen.tsx`

- [x] `handleAutoMove(id)`: `findRefByCardId` → `useSolitarioStore.getState().autoMoveToFoundation(ref)` → si `true`: `soundCardDrop()` + `hapticDropCommit()`.
- [x] Pasar `onDoubleTap: handleAutoMove` en `dragCallbacks` (memoizado, estable).
- [x] Pasar `onAutoMove` a los `Pile` (waste, foundation, tableau) para el clic derecho.

### E. Sonido — infraestructura core

- [x] Dep: `pnpm exec expo install expo-audio`.
- [x] Generar WAV sintéticos en `assets/audio/` (script one-off, archivos commiteados, ~5–20KB c/u):
  - [ ] `card-move.wav` — pluck corto (robar del stock).
  - [ ] `card-drop.wav` — snap suave (drop válido / auto-move).
  - [ ] `card-invalid.wav` — thud grave (snap-back).
  - [ ] `game-win.wav` — arpegio breve (victoria).
- [x] `src/core/ui/sound.ts` (patrón `haptics.ts`, juegos no importan expo-audio):
  - [ ] Preload perezoso de los 4 efectos.
  - [ ] API: `soundCardMove()`, `soundCardDrop()`, `soundCardInvalid()`, `soundGameWin()`.
  - [ ] Gate por toggle (`useAppStore.getState().soundOn`) consultado al reproducir.
  - [ ] Gate por plataforma (web incluido: expo-audio soporta HTML5 Audio).

### F. Toggle global de sonido

- [x] `src/core/stores/useAppStore.ts`: `soundOn: boolean`, `toggleSound()`, hydrate con clave `sound_enabled` (default `'1'`), patrón exacto de `dark_mode`.
- [x] `app/ajustes.tsx`: fila "Sonido" con `Switch` (`accessibilityLabel="set-sound"`) en la misma card que Modo oscuro.
- [x] `app/_layout.tsx`: verificar hydrate existente (darkMode ya se hidrata; extender a `soundOn` en la misma ruta).

### G. Sonidos integrados al solitario

- [x] `SolitarioScreen.tsx`:
  - [ ] Draw del stock → `soundCardMove()`.
  - [ ] Drop válido en `handleDragEnd` → `soundCardDrop()` junto a `hapticDropCommit()`.
  - [ ] Snap-back (drop inválido) → `soundCardInvalid()`.
  - [ ] Victoria → `soundGameWin()` junto a `hapticGameWin()`.

### H. Pruebas

- [x] Unit: ver A (autoMoveToFoundation).
- [x] E2E — `src/games/solitario/__e2e__/solitario.web.spec.ts`:
  - [ ] Seed `test-move`: robar A♠ → `dblclick` sobre `solitario-card-S-1` → `Movimientos: 2` + posición de A♠ ≈ `solitario-foundation-0` (< 10px).
  - [ ] Clic derecho (`mouse.click({ button: 'right' })`) sobre una carta elegible (seed `test-win`, K♣) → `Movimientos` incrementa (camino alternativo al doble tap).
- [x] Regresión: los 15 specs existentes pasan sin cambios (drag con Pan intacto tras la composición de gestos).

### I. Verificación (orden obligatorio)

- [x] `pnpm typecheck` (< 5s).
- [x] `pnpm test` (155 + nuevos unit).
- [x] `node scripts/e2e.mjs` (15 + 2 nuevos = 17/17).
- [x] Sin screenshots commiteados; limpiar artefactos temporales.

---

## 3. Riesgos / decisiones en vuelo

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | `Gesture.Simultaneous(pan, tap)` interfiere con el inicio del Pan en web | Cambiar a `Gesture.Race` o `requireExternalGestureToFail`; los 3 specs de drag existentes son la regresión canaria |
| R2 | `onContextMenu` de rn-web no suprime el menú nativo del navegador | `preventDefault` vía wrapper si hace falta (web-only, check `process.env.EXPO_OS === 'web'`) |
| R3 | expo-audio API cambió entre versiones del SDK | Consultar el d.ts instalado tras `expo install` antes de escribir el wrapper |
| R4 | Web autoplay policies | El primer play ocurre tras gesto del usuario (tap/click/drag) → no aplica |
| R5 | El tap del doble-tap dispara el press-in visual de `PileCard` (lift) | Lift solo ocurre con drag activo (`dragActive`), el tap no lo activa → sin conflicto |
