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

### Pendiente de aprobar antes de Fase 3 — orientación nativa

- **Opción A (mínima)**: `app.json` → `"orientation": "default"`. Sin dependencias
  nuevas, verificable con el toolchain actual. Consecuencia: damas/memorice también
  rotan en nativo sin layout landscape (siguen funcionando: sus layouts derivan del
  contenedor medido) → deuda a `docs/ROADMAP.md`.
- **Opción B (por-juego, coherente con `supportsLandscape`)**: `app.json` →
  `"default"` + `pnpm exec expo install expo-screen-orientation`; el contenedor hace
  `lockAsync(PORTRAIT_UP)` al montar un juego sin soporte y `unlockAsync()` en
  solitario (guard `Platform.OS !== 'web'`). Requiere **rebuild del dev build Android**
  y validación en dispositivo real (toolchain Android no disponible en este entorno).
- Recomendación: **B**, porque materializa el flag por juego end-to-end; si el rebuild
  en dispositivo se demora, A es un hito intermedio válido.

## Checklist de tareas (orden de ejecución)

- [ ] **F1** — Cartas más grandes (portrait): `PADDING 8→4`, `GAP 4→2` en
      `src/games/solitario/engine/layout.ts`; ajustar `__tests__/layout.test.ts`
      (fórmula exacta del caso 360×640).
- [ ] **F2** — Detección (core): nuevo `src/core/ui/useLandscapeMobile.ts` con
      `useWindowDimensions` + `Platform.OS`, delegando en la función pura
      `isLandscapeMobile(width, height, platform)` (umbral dimensión corta ≤ 480);
      test unitario de la función pura.
- [ ] **F3** — Config por juego: `supportsLandscape?: boolean` en `GameDefinition`
      (`src/core/types.ts`) + `true` en el registro de solitario; test de registro.
- [ ] **F4** — Orientación nativa: Opción A o B según aprobación (ver arriba);
      documentar la elegida en este plan.
- [ ] **F5** — `GameHeader` vertical (core): prop `variant?: 'horizontal' | 'vertical'`
      (default horizontal, retrocompatible); columna de botones apilados (~64px de
      ancho), contenido `center` debajo. Los `accessibilityLabel` no cambian
      (selectores E2E intactos).
- [ ] **F6** — Solitario landscape: `SolitarioScreen` consume `useLandscapeMobile()`;
      con variante activa el contenedor pasa a `flexDirection: 'row'` con
      `[GameHeader variant="vertical"] [board flex:1]`. `computeLayout` sin cambios.
      Overlays (victoria/derrota/settings) siguen absolutos sobre el contenedor.
- [ ] **F7** — E2E: nuevo spec `src/games/solitario/__e2e__/solitario.landscape.web.spec.ts`
      con `test.use({ viewport: { width: 740, height: 360 } })`: header a la izquierda
      (labels visibles), tablero renderizado, drag legal, sin scroll.
- [ ] **F8** — Verificación estándar completa: `pnpm typecheck` → `pnpm test` →
      `node scripts/e2e.mjs` (25/25) + verificación visual manual portrait/landscape
      (screenshots temporales, borrar al terminar).

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
- (research) `expo-screen-orientation` no soporta web: todo uso suyo debe ir tras
  guard de `Platform.OS !== 'web'` si se elige la Opción B.
- (números) Portrait: 45→48px con PADDING/GAP reducidos. Landscape 740×360 con rail:
  `byHeight = altoTablero/4.6` manda → carta ≈ 69px (+53%).
