import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Default headless; ver la UI: pnpm exec playwright test --headed | --ui | --debug
  // Solo flujos web por juego, en __e2e__ de cada src/games/<id>/
  testDir: './src',
  testMatch: '**/__e2e__/*.web.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 900 },
    // Trazas al fallar: inspeccionables con pnpm exec playwright show-report
    trace: 'retain-on-failure',
  },
  webServer: {
    // Export estático + serve: más determinista que el dev server de Metro
    command: 'pnpm exec expo export --platform web --output-dir dist && pnpm exec serve dist -l 4173 --single',
    port: 4173,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
