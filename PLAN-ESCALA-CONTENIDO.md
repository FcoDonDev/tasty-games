# PLAN: Escala de contenido de cartas + animaciones (Solitario)

Estado: **activo** · Rama: `feature/solitario-escala-animaciones`

## Requerimiento

1. **Setting "Tamaño del contenido"** en los Ajustes del Solitario: escala el
   contenido dibujado dentro de las cartas (números de esquina, palos, pips,
   figuras) en 3 niveles, sin cambiar la geometría del tablero ni el
   drag/hit-testing. Funciona en cualquier dispositivo (360px incluido).
2. **Animaciones de experiencia** en el Solitario: reparto inicial, volteado de
   carta y vuelo de auto-move a foundation (ver decisión D5).

Contexto del análisis: ver conversación — las cartas ya son responsivas vía
`computeLayout()` (`byWidth` domina en 360px, un setting de tamaño de carta
sería no-op en teléfonos), por eso se eligió escala de contenido.

## Decisiones de diseño (aprobadas con el usuario)

- **D1. Enfoque**: escala de contenido (opción C), no tamaño de carta ni zoom
  con scroll (choca con D4 mobile-first).
- **D2. Valores**: `Compacto = 0.85 · Normal = 1.0 · Grande = 1.2`, como
  multiplicador sobre los fontSize actuales de `PlayingCard.tsx`. Normal =
  comportamiento actual. Además se sube la base de esquinas (ver D6).
- **D3. Alcance del scale**: todo el contenido de la carta (esquinas, pips,
  As, figuras) para mantener proporciones coherentes.
- **D4. Aplicación inmediata y persistencia**: el cambio de escala re-renderiza
  al instante sin reiniciar la partida (es render puro). Se persiste como
  `solitario.contentScale` vía `preferencesRepository` (patrón PREF_DRAW /
  PREF_UNDO; repos dual ya existe, **sin migraciones**).
- **D5. Animaciones** (gate del skill expo-animation: propósito nombrado +
  tier de frecuencia; solo `transform`/`opacity`, `ReduceMotion.System` siempre):
  - **Reparto inicial** — propósito: delight (raro, 1× por partida). Stagger
    de las cartas del tableau: `FadeIn` + `translateY` corto, < 500ms total,
    orquestado desde `SolitarioScreen` al `reset()` (no en cada carta).
    Debe terminar antes de habilitar el drag (listo = jugable).
  - **Volteado de carta** — propósito: state indication (decenas por partida).
    Flip en dos fases 0°→90°→0° reutilizando el patrón de
    `src/games/memorice/components/Card.tsx` (evita el espejo rotateY en web),
    ~200ms, se dispara cuando `faceUp` pasa a true.
  - **Auto-move a foundation** — propósito: spatial consistency (decenas por
    partida). Vuelo spring desde el origen al rect de la foundation reutilizando
    la maquinaria de settle del drag (shared values tx/ty + `withSpring`
    `duration 400, dampingRatio 0.8`); haptic/sonido ya existen y se disparan
    antes del commit.
  - **Fuera de alcance**: shake en drop inválido (el snap-back spring + sonido
    ya lo comunican), cascada tipo Windows en victoria (costo alto; el modal de
    victoria ya entra con `overlayEnter`). Quedan anotados en ROADMAP si se
    piden.
- **D6. Base de esquinas**: se sube `indexFontSize` de `0.17` a `0.22` y
  `indexSuitSize` de `0.14` a `0.18` (plan original aprobado; el setting escala
  sobre esta base).

## Criterios de aceptación

- El setting aparece en Ajustes con 3 opciones, persiste entre sesiones
  (sqlite en nativo / localStorage en web) y aplica sin reiniciar la partida.
- En `Normal` el render es pixel-igual al actual (excepto base D6).
- Con `Grande` a 360×640 no hay solape número/pips ni clipping.
- Todas las animaciones respetan `ReduceMotion.System` y no bloquean el gesto
  (nada corre en el JS thread; `scheduleOnRN` solo en `onEnd`/umbrales).
- Labels de accesibilidad estables (`solitario-set-escala-*`) para E2E.
- `pnpm typecheck` + `pnpm test` + E2E web 25/25 en verde.

## Checklist (orden de ejecución)

- [ ] T1. `engine/state.ts`: `contentScale` en `SolitarioSettings` + campo en
      store (default 1.0) + setter + tests de state.
- [ ] T2. `components/PlayingCard.tsx`: prop `scale` (numérica, memo-friendly),
      multiplicar fontSize (esquinas D6, pips, As, figuras).
- [ ] T3. `SolitarioScreen.tsx`: cargar pref en el effect de montaje, guardar
      al cambiar, propagar `scale` a las cartas vía `Pile`.
- [ ] T4. `components/SettingsModal.tsx`: sección "Tamaño del contenido" con 3
      `OptionButton` (`solitario-set-escala-c/n/g`), misma disciplina visual.
- [ ] T5. Animación de reparto inicial (stagger en `reset`, gate con `ready`).
- [ ] T6. Animación de volteado de carta (patrón memorice, dos fases).
- [ ] T7. Animación de vuelo en auto-move a foundation (spring con la
      maquinaria de settle existente).
- [ ] T8. Tests unitarios (state + persistencia del pref) y E2E verde.
- [ ] T9. **Verificación estándar**: `pnpm typecheck` → `pnpm test` →
      `node scripts/e2e.mjs` (25/25) + inspección visual 360×640 en `Grande`
      y con animaciones (reparto, flip, auto-move).

## Impactos

| Área | Impacto |
|---|---|
| Aislamiento de juegos | Todo dentro de `src/games/solitario/` + pref core (permitido). Cero impacto en otros juegos. |
| Persistencia | Solo nueva clave string en `preferencesRepository` (dual ya existe). Sin migraciones SQLite. |
| Performance | `PlayingCard` sigue memoizado (scale = prop numérica estable). Animaciones en UI thread (transform/opacity), nada por frame en JS. |
| E2E | Specs existentes no dependen del fontSize; el reparto animado debe completarse antes de `ready` para no interferir con drags de los specs. |
| Riesgo visual | En `Grande` (1.2) la esquina crece ~20% sobre la base D6 → verificar solape con pips superiores a 360px. |

## Notas / hallazgos

- (pendiente: se anotan durante la implementación)
