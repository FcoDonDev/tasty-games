#!/usr/bin/env node
/**
 * Orquestador E2E web: un comando, una terminal, dos procesos internos.
 *
 *   1. Reutiliza el servidor si ya hay uno en :4173
 *   2. Si no: `expo export` con output visible (sin limbo de "Loading..."),
 *      luego `serve dist` en background
 *   3. Corre `playwright test <args>` en foreground (hereda stdio: --ui, --headed, etc.)
 *   4. Al salir: mata el serve (dueño del proceso = este script, sin huérfanos)
 *
 * Uso:
 *   pnpm e2e:web              # headless
 *   pnpm e2e:headed           # navegador visible
 *   pnpm e2e:ui               # UI mode interactivo
 *   pnpm e2e:web -- -g "salir"  # filtros de Playwright
 */
import { spawn } from 'node:child_process';

const PORT = 4173;
// 127.0.0.1: evita el problema localhost→::1 (issue #22144 de Playwright)
const BASE_URL = `http://127.0.0.1:${PORT}`;
// `pnpm e2e:web -- -g "salir"`: pnpm reenvía el "--" tal cual; filtrarlo
const passthroughArgs = process.argv.slice(2).filter((arg, i, all) => !(arg === '--' && i === 0));

const isServerUp = async () => {
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(800) });
    return res.status < 500;
  } catch {
    return false;
  }
};

const waitForServer = async (timeoutMs = 15_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isServerUp()) return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
};

const runForeground = (cmd, args) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });

let serveChild = null;

const startServe = () => {
  // detached: true → grupo de proceso propio: Ctrl+C no lo alcanza directo,
  // solo stopServe() lo mata (y con él toda la cadena pnpm → serve).
  serveChild = spawn(
    'pnpm',
    ['exec', 'serve', 'dist', '-l', String(PORT), '--single'],
    { stdio: 'ignore', detached: true },
  );
};

const stopServe = () => {
  if (!serveChild?.pid) return;
  try {
    process.kill(-serveChild.pid, 'SIGTERM');
  } catch {
    try {
      serveChild.kill('SIGTERM');
    } catch {
      /* ya murió */
    }
  }
  serveChild = null;
};

const cleanupAndExit = (code) => {
  stopServe();
  process.exit(code);
};

process.on('SIGINT', () => cleanupAndExit(130));
process.on('SIGTERM', () => cleanupAndExit(143));

const main = async () => {
  if (await isServerUp()) {
    console.log(`→ [e2e] Reutilizando servidor activo en ${BASE_URL}`);
  } else {
    console.log('→ [e2e] Exportando build web (expo export, ~30 s)...');
    const exportCode = await runForeground('pnpm', [
      'exec',
      'expo',
      'export',
      '--platform',
      'web',
      '--output-dir',
      'dist',
    ]);
    if (exportCode !== 0) {
      console.error(`✖ [e2e] expo export falló (código ${exportCode})`);
      process.exit(exportCode);
    }

    console.log(`→ [e2e] Sirviendo dist/ en ${BASE_URL}...`);
    startServe();
    if (!(await waitForServer())) {
      console.error('✖ [e2e] serve no respondió a tiempo');
      cleanupAndExit(1);
    }
  }

  console.log(`→ [e2e] playwright test ${passthroughArgs.join(' ')}`);
  const code = await runForeground('pnpm', ['exec', 'playwright', 'test', ...passthroughArgs]);
  console.log(`→ [e2e] Listo (código ${code}); limpiando servidor...`);
  cleanupAndExit(code);
};

main();
