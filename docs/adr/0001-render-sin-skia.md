# 0001 — Render con Views nativos, sin Skia

**Estado:** Aceptada

## Contexto

La propuesta original definía `@shopify/react-native-skia` como capa de render 2D para cartas, tableros y fichas. Los juegos de este proyecto son UI interactiva (tap, drag & drop de cartas/fichas), no render por frame tipo canvas de juego.

## Decisión

Renderizar con **Views nativos + react-native-reanimated + react-native-gesture-handler**. 
Cada carta/ficha es un nodo nativo. Skia queda fuera del proyecto.

## Consecuencias

- Hit-testing, accesibilidad y soporte web vienen gratis con Views nativos.
- Web sin CanvasKit WASM (2.9 MB), sin entry point custom (`index.web.tsx` + `LoadSkiaWeb`), sin los bugs conocidos de tree-shaking (`SkiaViewApi is not defined`, issues #3345/#2914 de Shopify/react-native-skia) y sin el límite de 16 contextos WebGL por página.
- Si en el futuro se quieren efectos (partículas al ganar, fondos), se agregan aislados en `src/core/ui/effects/` sin tocar los engines.
- El flip de cartas y las transiciones se hacen con Reanimated (ver `docs/UI-UX.md` para el gate de animación).
