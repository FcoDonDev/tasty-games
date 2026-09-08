# PLAN-SOLITARIO-LANDSCAPE

## Requerimiento

1. **Cartas más grandes** en solitario sin afectar la jugabilidad.
2. **Modo landscape móvil**: UI más grande + barra de navegación (`GameHeader`) al
   costado izquierdo para liberar la zona de juego. Solo mobile; desktop web sin cambios.

Rama de trabajo: `feature/solitario-landscape`.

## Contexto técnico

- El tamaño de carta se calcula en `src/games/solitario/engine/layout.ts` (`computeLayout`):
  `cardWidth = min(ancho/7 columnas, alto/4.6, cap 128px)`. En portrait 360px → carta de
  **45px** (el ancho limita). En landscape liberando el header → **~69px** (+53%).
- Dos barras sobre el tablero: la *chrome bar* del contenedor
  (`app/juego/[id].tsx`, título + score + ayuda) y el `GameHeader`
  (`src/core/ui/GameHeader.tsx`: Salir / Movimientos / undo / ⚙ / ↻ / ?).
- `app.json` tiene `"orientation": "portrait"`: Android nativo está bloqueado en vertical.
- Hit-testing (`hitTestPile`), fan de waste y offsets ya escalan con `cardWidth`:
  agrandar la carta no toca la lógica de juego.

## Decisiones de diseño (aprobadas con el usuario)

| Decisión | Elección | Alternativa descartada |
|---|---|---|
| Cartas portrait | `PADDING` 8→4, `GAP` 4→2: carta 45→**48px** (+7%) | No tocar portrait |
| Orientación nativa | Desbloquear (`"orientation": "default"` u opción B, ver abajo) | Dejar nativo en portrait |
| Barras en landscape | Solo `GameHeader` pasa a la izquierda (vertical); la chrome bar queda arriba | Mover ambas (toca contenedor compartido) |
| Alcance | Solo solitario; `GameHeader` gana prop `variant="vertical"` reutilizable | Los 3 juegos de una vez |
| Detección landscape | `useWindowDimensions` + función pura `isLandscapeMobile(w, h, platform)`; umbral dimensión corta ≤ 480 | UA sniffing / pointer coarse |

## Consideraciones agregadas (ronda 2)

### 1. La variante landscape como parte de la config del juego

Convendría que **el soporte landscape sea una propiedad declarativa de cada juego** en
su `GameDefinition` (contrato en `src/core/types.ts`) en vez de que la pantalla lo
adivine:

```ts
export interface GameDefinition {
  // ...existente
  /** Adapta su layout a landscape móvil (header vertical + unlock de orientación). Default: false */
  supportsLandscape?: boolean;
}
```

- `solitario` declara `supportsLandscape: true`; damas y memorice quedan implícitos en
  `false` (no cambian hasta que adopten el patrón).
- Beneficios: una única fuente de verdad; el contenedor (`app/juego/[id].tsx`) puede
  leerla para decidir el modo y/o manejar el lock/unlock de orientación nativo; el
  registro de juegos se vuelve el catálogo de capacidades.
- **Decisión tomada**: sí, incorporar como `supportsLandscape?: boolean`.

### 2. Mejor alternativa para detectar landscape (investigación skills + web)

Búsqueda en el ecosistema de skills (`npx skills find expo orientation`) y en la web:

- **Skills**: no existe un skill relevante para detección de orientación en Expo. Los
  matches (`expo/skills@expo-deployment`, `software-mansion-labs/skills@expo-horizon`,
  etc.) son de dominios distintos o con <2K installs. Los skills locales del repo
  (expo-native-ui, expo-animation) no cubren orientación.
- **Conclusión web (docs Expo + SO)**:
  - `useWindowDimensions` es el patrón estándar y reactivo (actualiza al rotar,
    funciona en iOS/Android/web). El patrón `Dimensions.get('window')` + listener es el
    legado con el que se reportaron bugs (iPad no actualizaba al rotar).
  - `expo-screen-orientation` (SDK 57, v57.0.2) es la API nativa autoritativa para
    **controlar** la orientación (`lockAsync` / `unlockAsync`); en **web no existe**
    (módulo nativo), y la doc oficial de Expo recomienda diseñar pantallas que se
    adapten al espacio disponible en vez de depender de locks.
- **Decisión**: detección con `useWindowDimensions` (multiplataforma, sin dependencias
  nuevas). `expo-screen-orientation` solo entra si se opta por la **Opción B** de
  orientación nativa (abajo).

### Orientación nativa — **APROBADA: Opción B**

- **Opción A (mínima)**: `app.json` → `"orientation": "default"`. Sin dependencias
  nuevas. Consecuencia: damas/memorice también rotan en nativo sin layout landscape
  (siguen funcionando) → deuda a `docs/ROADMAP.md`. Descartada.
- **Opción B (elegida, por-juego, coherente con `supportsLandscape`)**: `app.json` →
  `"default"` + `pnpm exec expo install expo-screen-orientation`; el contenedor
  (`app/juego/[id].tsx`) hace `lockAsync(PORTRAIT_UP)` al montar un juego sin soporte
  y `unlockAsync()` en solitario (guard `Platform.OS !== 'web'`; el root `_layout`
  re-locka portrait al salir). Requiere **rebuild del dev build Android** y validación
  en dispositivo real (toolchain Android no disponible en este entorno).
- **Detección (ronda 3, confirmada)**: `expo-screen-orientation` sí soporta web
  (W3C Screen Orientation API, "limited support": en desktop la orientación no es
  física). En nativo es la API autoritativa del SO → se usa para **controlar** el
  lock/unlock y la señal física; `useWindowDimensions` queda como base multiplataforma
  para decidir el modo de layout (señal de espacio disponible, cubre split-screen).
  El hook `useOrientation` de `@uidotdev/usehooks` se descarta: solo React DOM y
  dependería de `window.orientation` (deprecado).
- iPad: el lock nativo exige deshabilitar split view (`requireFullScreen`); fuera de
  alcance (foco en teléfonos), documentado como limitación.

## Checklist de tareas (orden de ejecución)

- [x] **F1** — Cartas más grandes (portrait): `PADDING 8→4`, `GAP 4→2` en
      `src/games/solitario/engine/layout.ts`; ajustar `__tests__/layout.test.ts`
      (fórmula exacta del caso 360×640).
- [x] **F2** — Detección (core): nuevo `src/core/ui/useLandscapeMobile.ts` con
      `useWindowDimensions` + `Platform.OS`, delegando en la función pura
      `isLandscapeMobile(width, height, platform)` (umbral dimensión corta ≤ 480);
      test unitario de la función pura.
- [x] **F3** — Config por juego: `supportsLandscape?: boolean` en `GameDefinition`
      (`src/core/types.ts`) + `true` en el registro de solitario; test de registro.
- [x] **F4** — Opción B (aprobada): `pnpm exec expo install expo-screen-orientation`;
      `app.json` → `"orientation": "default"` + plugin con `initialOrientation`;
      lock/unlock por juego en `app/juego/[id].tsx` (guard web) y portrait en root.
- [x] **F5** — `GameHeader` vertical (core): prop `variant?: 'horizontal' | 'vertical'`
      (default horizontal, retrocompatible); columna de botones apilados (~64px de
      ancho), contenido `center` debajo. Los `accessibilityLabel` no cambian
      (selectores E2E intactos).
- [x] **F6** — Solitario landscape: `SolitarioScreen` consume `useLandscapeMobile()`;
      con variante activa el contenedor pasa a `flexDirection: 'row'` con
      `[GameHeader variant="vertical"] [board flex:1]`. `computeLayout` sin cambios.
      Overlays (victoria/derrota/settings) siguen absolutos sobre el contenedor.
- [x] **F7** — E2E: nuevo spec `src/games/solitario/__e2e__/solitario.landscape.web.spec.ts`
      con `test.use({ viewport: { width: 740, height: 360 } })`: header a la izquierda
      (labels visibles), tablero renderizado, drag legal, sin scroll.
- [x] **F8** — Verificación estándar completa: `pnpm typecheck` → `pnpm test`
      (18 suites / 189 tests) → `node scripts/e2e.mjs` (27/27 incl. los 2 nuevos
      de landscape) → verificación visual manual portrait/landscape pendiente de
      dispositivo (Android sin toolchain en este entorno).

## Criterios de aceptación

- Portrait 360×640: `cardWidth = 48`, sin scroll, specs responsive existentes verdes.
- Landscape móvil (740×360): GameHeader vertical a la izquierda, carta ≥ 65px,
  drag/auto-move operativos.
- Desktop web (1280×900) y tablet (900×800): idéntico a hoy (los specs actuales de
  Playwright corren a esos tamaños y no deben disparar el modo rail).
- Android: la app rota; solitario adapta según la opción elegida en F4.

## Riesgos

- Los specs E2E de solitario corren a 1280×900 (desktop): el drag con mouse sigue
  válido; el nuevo spec landscape cubre el modo rail.
- Opción B exige rebuild del dev build Android y validación en dispositivo real
  (toolchain no instalado en este entorno) — verificación manual pendiente del usuario.
- Desbloqueo global (Opción A) rota damas/memorice sin optimización: deuda documentada.

## Notas / hallazgos

- (investigación) No hay skill del ecosistema que mejore la detección de landscape;
  `useWindowDimensions` + función pura es la vía correcta y testeable.
- (research) `expo-screen-orientation` **sí** soporta web (W3C Screen Orientation API,
  soporte limitado): corrección de la primera impresión. En web igualmente se omite
  el lock (`core/orientation.ts` es no-op): el lock del navegador puede rechazar en
  desktop o pedir fullscreen en móvil.
- (números) Portrait: 45→48px con PADDING/GAP reducidos. Landscape 740×360 con rail:
  `byHeight = altoTablero/4.6` manda → carta ≈ 71px (+48%).
- (E2E, lección) El alto del `solitario-tablero` interior es **casi igual** en
  portrait y landscape: en portrait la carta la limita el ancho y en landscape el
  alto, con lo que el contenido ocupa un alto similar. La aserción E2E correcta del
  modo rail es el **tamaño de carta** (48→71px) y la posición del rail (x del botón
  salir < x del tablero, ancho ≤ 64), no el alto del tablero.
- (pendiente cierre) Validación en dispositivo Android del lock/unlock nativo
  (toolchain no disponible en este entorno) — queda para el usuario antes del cierre
  del PLAN. Deuda damas/memorice sin layout landscape → `docs/ROADMAP.md` al cierre.
