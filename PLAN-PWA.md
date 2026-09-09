# PLAN-PWA.md — PWA instalable (sin Service Worker)

> Plan temporal según AGENTS.md. Se commitea junto al trabajo; el commit de
> cierre lo elimina tras migrar hallazgos y actualizar docs.

## Contexto

Queremos que la versión web (`web.output: "static"`, app.json:27) se pueda
instalar como app en dispositivos móviles ("Añadir a pantalla de inicio"):
abrir **sin la barra del navegador**, con icono en el home. Esto es
complementario y previo a la opción de botón in-app con Fullscreen API
(descartada por ahora): la vía PWA es además **la única forma de llegar a
algo "fullscreen" en iPhone**, donde Safari no soporta la Fullscreen API para
elementos arbitrarios.

Fuente oficial: https://docs.expo.dev/guides/progressive-web-apps/
Nuestro caso aplica la sección **static** (`app/+html.tsx` + `public/`), no la
de `single` (`public/index.html`).

## Objetivo

PWA instalable en Android (Chrome/instalación vía manifest) e iOS (Add to
Home Screen vía meta tags Apple), con icono y colores de marca.

## Decisiones de diseño (aprobadas)

### D1 — `display: "standalone"` (lo más "app normal" posible)

- **Elegido**: `"standalone"`. Android abre sin UI del navegador pero
  conservando la barra de estado; iOS ya se comporta así por defecto en A2HS.
- **Alternativas descartadas**:
  - `"fullscreen"` (oculta también la barra de estado en Android): más
    inmersivo pero menos "app normal"; se puede revisar a futuro sin tocar
    nada más que el manifest.
  - `display_override`: innecesario con standalone (todos los navegadores
    soportan el valor base).
- En iOS el comportamiento final lo fijan las meta tags Apple (ver D3); el
  manifest `display` es solo respaldo en iOS modernos.

### D2 — Sin Service Worker (omitido)

- **Decisión**: no agregar SW; el manifest + metas bastan para la
  instalabilidad (Chrome ya no exige SW con fetch handler para el prompt; iOS
  nunca lo exigió).
- **Justificación crítica** (ver análisis en la sesión):
  1. Beneficio offline marginal: la app corre 100% client-side (estado en
     localStorage vía repos `.web.ts`, cero llamadas de red en runtime).
  2. El warning de la doc oficial ("caching agresivo → updates difíciles")
     choca con nuestro workflow e2e: un SW precacheando serviría `dist/` viejo
     aunque re-exportemos — la misma clase de bug que el huérfano con dist
     viejo (GOTCHAS/tabla de decisión de AGENTS.md).
  3. Exigiría integrar `workbox-cli generateSW` post-export en
     `scripts/e2e.mjs` o un `build:web` — complejidad permanente por un
     beneficio no demostrado.
  4. Reversible: si el offline importa a futuro, SW mínimo (network-first +
     skipWaiting + auto-reload) como decisión deliberada → anotado en
     ROADMAP.
- **Migración al cierre**: ADR nuevo "PWA sin service worker" + nota de
  offline futuro en ROADMAP.

### D3 — Iconos derivados de `icon.png` + nota de personalización

- **Decisión**: generar todos los iconos PWA desde `assets/images/icon.png`
  (única fuente, sin trabajo de diseño ahora). Pendiente EXPLÍCITO para el
  futuro: **personalizar los iconos PWA** (hoy son simples escalados de
  icon.png; no hay diseño dedicado 192/512/maskable/Apple-touch) → migrar a
  ROADMAP al cierre.
- Set a generar en `public/`:
  - `icon-192.png`, `icon-512.png` (manifest, requisitos estándar)
  - `icon-maskable-512.png` (Android adaptive: icon.png centrado con
    padding y fondo `#0F172A` para zona segura)
  - `apple-touch-icon.png` 180×180 (iOS lo usa para A2HS; sin link explícito
    iOS haría un screenshot feo)

### D4 — Alcance mínimo: solo lo que la instalación requiere

Solo archivos que la vía instalable exige; sin pasos extra (nada de SW,
nada de botón de instalación custom, nada de analytics de instalación).
Deep links (`/juego/<id>?seed=...`) siguen funcionando por navegación normal
dentro del PWA; el alcance por defecto del manifest (`.`, mismo directorio)
es suficiente.

## Cambios concretos

1. **`public/manifest.json`** (nuevo; Expo copia `public/` a la raíz del
   export y Metro lo sirve también en dev):
   ```json
   {
     "name": "Tasty Games",
     "short_name": "Tasty Games",
     "icons": [
       { "src": "icon-192.png", "type": "image/png", "sizes": "192x192" },
       { "src": "icon-512.png", "type": "image/png", "sizes": "512x512" },
       { "src": "icon-maskable-512.png", "type": "image/png",
         "sizes": "512x512", "purpose": "maskable" }
     ],
     "start_url": ".",
     "display": "standalone",
     "theme_color": "#0F172A",
     "background_color": "#0F172A"
   }
   ```
2. **Iconos en `public/`** (D3), generados con script one-shot (ImageMagick
   `convert` si está disponible, si no script node con la librería que ya
   exista; elegir en ejecución). No commitear herramienta permanente si no
   hace falta.
3. **`app/+html.tsx`** (nuevo — reemplaza el head default de expo-router;
   replicar sus defaults para no romper nada y agregar lo PWA):
   - `<meta charSet="utf-8" />`, `<meta httpEquiv="X-UA-Compatible" ...>`,
     viewport (`width=device-width, initial-scale=1` — copiar el default
     exacto de expo-router/h del framework, no inventar), `<ScrollViewStyleReset />`.
   - `<link rel="manifest" href="/manifest.json" />`
   - `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`
   - `<meta name="apple-mobile-web-app-capable" content="yes" />` (vía
     confiable de A2HS en iOS; iOS viejo ignora `display` del manifest)
   - `<meta name="mobile-web-app-capable" content="yes" />` (Chrome legacy)
   - `<meta name="apple-mobile-web-app-status-bar-style" content="black" />`
     (fondo de app oscuro #0F172A)
   - `<meta name="theme-color" content="#0F172A" />`
   - Verificar en ejecución qué head default genera hoy el export (comparar
     `dist/index.html` antes/después) para no perder nada.

## Criterios de aceptación

- [x] `dist/` tras export contiene `manifest.json` + los 4 iconos; el HTML
      tiene el `<link rel="manifest">` y las metas Apple.
- [x] DevTools (Application > Manifest) no muestra errores de manifest con
      viewport 360×640.
- [x] Verificación estándar verde: `pnpm typecheck` → `pnpm test` → e2e
      completo (44/44, 3 nuevos del spec PWA).
- [x] El `<link rel="manifest">` queda candaeado en un spec e2e web (assert
      en spec de índice o mini-spec propio).
- [ ] En un dispositivo/DevTools device-mode se puede "Añadir a pantalla de
      inicio" (verificación manual del usuario — no automatizable en
      Playwright headless).

## Checklist de tareas (orden de ejecución)

- [x] T1: Crear `public/` con `manifest.json` (D1) y decidir herramienta de
      resize de iconos.
- [x] T2: Generar iconos desde `assets/images/icon.png` (D3) y verificar
      tamaños reales de los PNG (no solo nombres).
- [x] T3: Crear `app/+html.tsx` (defaults de expo-router + metas PWA),
      comparando el head del export antes/después.
- [x] T4: Export web (`CI=1 pnpm exec expo export --platform web`) y
      verificar `dist/` (manifest, iconos, head del HTML).
- [x] T5: Spec e2e web que candee el `<link rel="manifest">` (+ metas
      básicas) en la página índice.
- [x] T6: Verificación estándar completa: typecheck → test → e2e 25/25.
- [ ] T7: Cierre: hallazgos → GOTCHAS/ADR/ROADMAP; actualizar docs
      (ARCHITECTURE o sección web de README raíz si aplica); eliminar este
      PLAN en el commit final.

## Notas / hallazgos

- **Head default de expo-router (verificado antes/después)**: el template de
  `@expo/router-server` solo aporta charset, X-UA-Compatible, viewport y
  `ScrollViewStyleReset`; el `<link rel="icon">` (favicon), el `<title>` y
  los scripts de entrada los **inyecta el CLI/router** por fuera del
  template. Un `app/+html.tsx` propio no los pierde ni los duplica.
- **Generación de iconos**: ImageMagick no está instalado; Python + PIL sí
  (script one-shot en /tmp/opencode). icon.png es 1024×1024 RGBA.
- **apple-touch-icon sin transparencia**: iOS aplasta los PNG con alpha a
  negro; se aplanó sobre #0F172A y se exportó en RGB.
- **Suite e2e creció**: AGENTS.md aún dice "25/25" pero la corrida verde
  actual es 44/44 (con el spec PWA incluido) → actualizar AGENTS.md en el
  cierre.
- **viewport-fit=cover**: se dejó como decisión pendiente — el default sin
  safe-areas funciona; agregarlo sin probar safe-areas reales en iOS es
  riesgo sin beneficio hoy (ROADMAP).
