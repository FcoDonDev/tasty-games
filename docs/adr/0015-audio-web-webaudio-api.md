# ADR 0015: Audio en web — ruta primaria Web Audio API con desbloqueo centralizado

- Estado: Aceptada
- Contexto: PLAN-SAFARI-WEBKIT (Fases 2-5, cerrado 2026-09-15)
- Referencias: [ADR 0011](0011-metricas-performance.md) (métricas), `src/core/ui/sound.ts`

## Contexto

Los SFX del proyecto usan `expo-audio` (players de `HTMLMediaElement` en web).
En Safari real (iPhone) el audio de eventos quedaba desfasado y omitido, y el
gameplay mostraba mini-saltos; el síntoma se reproducía igual en Chrome iOS
(que renderiza con **WebKit** — Apple lo exige a todo browser iOS).

Diagnóstico con spec instrumentado (`safari-diag.web.spec.ts`): WebKit rechaza
intermitentemente los `play()` de media elements fuera del call-stack de un
gesto (`NotAllowedError`, ~2/7 en 20s) — resuelto con un unlock por elemento
muteado dentro del primer gesto (Fase 4). Pero la validación en iPhone real
post-fix mostró que la latencia/omisión persistía: la ruta `HTMLMediaElement`
en WebKit-iOS es intrínsecamente deficitaria (retraso documentado de 100ms–1s
en `play()`, buffering deshabilitado por política, descarte de plays
encadenados).

## Decisión

1. **Ruta primaria Web Audio en web** (`src/core/ui/sound.ts`, solo web):
   un `AudioContext` singleton + los 8 buffers decodificados una vez
   (`fetch` → `decodeAudioData`, arrancado en idle por `primeAudioPlayers`,
   pre-gesto) y cada reproducción con un `BufferSourceNode.start()` a través
   de un `GainNode` (volumen 0.5). Latencia ~0, sin lock por elemento, plays
   imposibles de omitir. Los playback rates (combo, explosión) van por
   `source.playbackRate`.
2. **Desbloqueo centralizado a nivel app**: `installAudioUnlockForWeb()`
   (llamado desde `app/_layout.tsx`) instala listeners `once` de
   `pointerdown`/`keydown`/`touchstart` en `document`; el primer gesto real
   de la sesión corre `unlockAudioForWeb()`, que hace `resume()` del contexto
   y conserva el unlock por elemento para el fallback. Ningún juego necesita
   enganchar el unlock (WakWak ya no lo hace en su pantalla).
3. **Fallback a elements**: si no hay `AudioContext`, el buffer no cargó o
   el contexto está suspendido (resume aún no corrido), el sonido cae a la
   ruta de `expo-audio` (players de elementos, con el unlock por elemento de
   Fase 4). El decode fallido de un sonido degrada solo ese sonido.
4. **Nativo intacto**: `expo-audio` sigue siendo la ruta de Android/iOS
   nativo; `playWebAudio` y el unlock son no-op fuera de web.

## Consecuencias

- Los juegos siguen llamando solo al wrapper `core/ui/sound.ts` (regla de
  aislamiento intacta); la estrategia de playback es un detalle de core.
- Nueva dependencia `expo-asset` (resuelve las URIs de assets Metro en web).
- El primer sonido tras la carga puede salir por elements si ocurre antes
  del primer gesto (raro: todo play sale de un gesto).
- Pendiente de medición en dispositivo: si los mini-saltos persisten en iOS
  tras este cambio, la causa es GC de JavaScriptCore (H4) — ver ROADMAP.
