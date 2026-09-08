import { defineConfig } from '@playwright/test';

// Override del puerto para corridas en paralelo con otro worktree: E2E_PORT=4183 pnpm e2e:web
const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = `http://localhost:${PORT}`;

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
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 900 },
    // Trazas al fallar: inspeccionables con pnpm exec playwright show-report
    trace: 'retain-on-failure',
  },
  webServer: {
    // Export estático + serve: más determinista que el dev server de Metro
    command: `pnpm exec expo export --platform web --output-dir dist && pnpm exec serve dist -l ${PORT} --single`,
    port: PORT,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
