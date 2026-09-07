# 0003 — E2E Android contra dev build, no Expo Go

**Estado:** Aceptada (ejecución pendiente — ver `docs/ROADMAP.md`, Fase E)

## Contexto

Maestro contra Expo Go requiere `openLink: exp://...` con el servidor Metro corriendo, lo que hace los flujos frágiles. Además Reanimated 4 + `react-native-worklets` funcionan de forma más fiable en dev build.

## Decisión

El E2E Android (Maestro) corre contra un **dev build** (`npx expo run:android`), no contra Expo Go. Los flujos Maestro usan `launchApp` normal y son deterministas.

## Consecuencias

- Requiere entorno con Java 17 + Android SDK/ADB (no disponibles durante el desarrollo web del proyecto; toda la validación Android se concentró en la Fase E — ver `docs/ROADMAP.md`).
- Los specs web (Playwright) y Android (Maestro) cubren los mismos casos de uso con runners distintos; se acepta la duplicación de flujo antes que forzar un solo runner.
- Los `accessibilityLabel` estables son el contrato común: son los selectores que usan tanto Playwright (web) como Maestro (Android).
