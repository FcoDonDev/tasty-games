# 0009 — Landscape móvil por juego (cartas más grandes + header vertical)

**Estado:** Aceptada

## Contexto

La app nació bloqueada en portrait (`app.json: "orientation": "portrait"`). En
solitario el tamaño de carta en portrait está limitado por el ancho (7 columnas
obligatorias): 45px a 360px es jugable pero chico, y solo se puede ganar ~7%
reduciendo gaps. El verdadero espacio ganable estaba en el eje vertical que
consumen las barras del header (`GameHeader` ~50px), y en la orientación
horizontal que el lock nativo impedía.

## Decisión

1. **Soporte landscape como capacidad declarativa del juego**:
   `GameDefinition.supportsLandscape?: boolean` (default `false`). El registro
   de juegos es el catálogo de capacidades; el contenedor
   (`app/juego/[id].tsx`) lo consume. Solo solitario lo declara `true` hoy;
   damas/memorice siguen portrait-locked hasta adoptar el patrón.
2. **Modo compacto landscape (UI)**: detección con `useWindowDimensions` +
   función pura `isLandscapeMobile(w, h)` (`src/core/ui/useLandscapeMobile.ts`):
   landscape real (`width > height`) y dimensión corta ≤ 480 (teléfono;
   excluye desktop y tablets). El juego activa contenedor `flexDirection:
   'row'` y `GameHeader variant="vertical"` (rail de ~64px a la izquierda,
   labels a11y intactos). El tablero no cambia: `computeLayout` sigue
   derivando del contenedor medido (ADR 0004) y la carta crece sola
   (~48→71px a 740×360).
3. **Orientación nativa por juego**: `app.json` pasa a `"orientation":
   "default"` + `expo-screen-orientation`. `src/core/orientation.ts` (wrapper
   con try/catch y guard `IS_NATIVE`) lockea portrait en el root layout y en
   juegos sin soporte; `unlockAsync()` solo mientras un juego con
   `supportsLandscape` está montado (cleanup re-locka). En web todo es no-op:
   el Screen Orientation Lock del navegador puede rechazar (desktop) o pedir
   fullscreen (móvil).

## Consecuencias

- Cartas: 45→48px en portrait (PADDING 8→4, GAP 4→2 en `layout.ts`) y ~71px
  en landscape (limitado por `alto/4.6`).
- El alto de contenido del tablero es casi igual en ambas orientaciones: la
  ganancia del modo rail es el tamaño de carta (ver GOTCHAS).
- Opción descartada: unlock global (damas/memorice rotarían sin layout
  landscape) y detección por UA/pointer (frágil).
- iPad: el lock nativo exige deshabilitar split view (`requireFullScreen`);
  fuera de alcance, la app rota libre en iPad.
- Android requiere rebuild del dev build para la config plugin; validación en
  device quedó como pendiente de Fase E (`docs/ROADMAP.md`).
- Adoptar landscape en otro juego = declarar `supportsLandscape: true` +
  consumir `useLandscapeMobile()` con `variant` en su pantalla; el lock/unlock
  nativo viene gratis.
