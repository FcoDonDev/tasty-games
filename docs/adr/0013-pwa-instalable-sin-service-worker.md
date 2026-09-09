# 0013 — PWA instalable sin service worker

**Estado:** Aceptada

## Contexto

La versión web (`web.output: "static"`) servida en el navegador móvil muestra
siempre el chrome del navegador (barra de direcciones) y ningún navegador lo
permite ocultar desde una pestaña normal (`minimal-ui` está deprecado). El
usuario quería una vía "fullscreen"/instalable desde el móvil; en iPhone,
además, Safari **no** soporta la Fullscreen API para elementos arbitrarios
(solo video), así que un botón in-app tipo `requestFullscreen()` no cubre iOS
— la única vía real allí es "Add to Home Screen" con meta tags Apple.

La [doc oficial de PWAs de Expo](https://docs.expo.dev/guides/progressive-web-apps/)
sugiere además un Service Worker (Workbox) para offline, con una advertencia
explícita sobre el riesgo de caching agresivo.

## Decisión

1. **PWA instalable vía manifest + metas Apple, sin Service Worker.**
   - `public/manifest.json` con `display: "standalone"` (lo más "app normal"
     posible en Android e iOS; `fullscreen` se descartó por ocultar la barra
     de estado en Android), `start_url: "."`, colores de marca `#0F172A` y
     iconos 192/512 + maskable.
   - `app/+html.tsx` (replica los defaults de expo-router) agrega el
     `<link rel="manifest">`, `apple-touch-icon`, metas
     `apple-mobile-web-app-capable`/`status-bar-style`/`title` (la vía
     confiable en iOS, que históricamente ignora el `display` del manifest) y
     `theme-color`.
   - Alcance mínimo: solo lo que la instalación exige. Sin botón de
     instalación custom (Android muestra el prompt nativo), sin analytics.
2. **Sin Service Worker** — análisis crítico:
   - Chrome ya no exige SW con fetch handler para el prompt de instalación e
     iOS nunca lo exigió: el manifest basta.
   - El beneficio offline es marginal: la app corre 100% client-side (estado
     en localStorage vía repos `.web.ts`, cero llamadas de red en runtime).
   - El riesgo que la propia doc señala (SW agresivo → el usuario no recibe
     updates) choca de frente con nuestro workflow: un SW precacheando
     serviría `dist/` viejo aunque re-exportemos — la misma clase de bug del
     huérfano en :4173 con `dist/` viejo (ver tabla de decisión de
     `AGENTS.md`).
   - Exigiría integrar `workbox-cli generateSW` como paso post-export
     permanente (orquestador e2e / `build:web`).
   - Reversible: si el offline importa algún día, SW mínimo (network-first +
     skipWaiting + auto-reload) como decisión deliberada (anotado en
     ROADMAP).
3. **Iconos derivados de `assets/images/icon.png`** (única fuente, escalado
   Lanczos; el maskable centra el contenido en la zona segura sobre
   `#0F172A`; el apple-touch-icon se aplana en RGB porque iOS aplasta PNG con
   transparencia a negro). **Personalización de diseño propia de PWA queda
   pendiente** (ROADMAP).

## Consecuencias

- La web es instalable en Android (prompt nativo de Chrome) e iOS (Add to
  Home Screen) y abre sin barra de navegador; el `<link rel="manifest">` y el
  manifest quedan candados por `src/core/__e2e__/pwa.web.spec.ts`.
- Instalación siempre manual por el usuario (el navegador no puede forzarla);
  el manifest `display` es revisable a futuro (fullscreen/display_override)
  sin tocar nada más.
- Un `app/+html.tsx` propio NO pierde el favicon, el `<title>` ni los scripts
  de entrada: los inyecta el CLI/router fuera del template (verificado
  comparando el head del export antes/después).
