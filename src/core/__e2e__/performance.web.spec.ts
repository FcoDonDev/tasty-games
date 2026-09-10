import { expect, test, type Page, type Locator } from '@playwright/test';
import { execSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildDeck, PERF_MATCH_SEED, PERF_MISMATCH_SEED } from '../../games/memorice/engine/deck';

/**
 * Baseline de performance web (PLAN-PERFORMANCE §9, Fase 1).
 *
 * NO corre con la suite funcional: se activa con PERF_BASELINE=1 y se ejecuta
 * contra un export instrumentado con EXPO_PUBLIC_PERF_METRICS=1 (lo que hace
 * el orquestador si se lo pasa por env; el env se inlinea en el build):
 *
 *   CI=1 EXPO_PUBLIC_PERF_METRICS=1 E2E_PORT=4183 PERF_BASELINE=1 \
 *   node scripts/e2e.mjs -- src/core/__e2e__/performance.web.spec.ts
 *
 * Protocolo (§5/§9): PERF_WARMUP warm-up runs descartadas + PERF_LOTS lotes
 * de PERF_RUNS corridas medidas por escenario, exportadas como JSONL versionado
 * a tmp/perf/ (artifacts locales, nunca commiteados). Defaults reducidos para
 * la corrida de validación; el baseline completo del PLAN se corre con:
 *   PERF_WARMUP=5 PERF_LOTS=5 PERF_RUNS=30
 */

const PERF_BASELINE = process.env.PERF_BASELINE === '1';
const WARMUP = Number(process.env.PERF_WARMUP ?? 1);
const LOTS = Number(process.env.PERF_LOTS ?? 1);
const RUNS = Number(process.env.PERF_RUNS ?? 3);
const WINDOW_MS = Number(process.env.PERF_WINDOW_MS ?? 4000);
// PLAN §9: viewport mobile 360x640 (mobile-first); PERF_VIEWPORT=1280x900 para desktop
const VIEWPORT = (process.env.PERF_VIEWPORT ?? '360x640').split('x').map(Number) as [number, number];

const ARTIFACT_DIR = path.resolve(process.cwd(), 'tmp/perf');
const COMMIT = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
})();

interface PerfTimerSummary {
  count: number;
  avg: number;
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

interface PerfSnapshot {
  schemaVersion: number;
  startedAt: number;
  endedAt: number;
  timers: Record<string, PerfTimerSummary>;
  counters: Record<string, number>;
}

/** Envelope versionado del harness (PLAN §6): el app no conoce scenario/run. */
interface RunEnvelope {
  schemaVersion: 1;
  scenarioId: string;
  runId: string;
  lot: number;
  warmup: boolean;
  seed: string | null;
  platform: 'web';
  buildMode: 'instrumented';
  commit: string;
  viewport: string;
  wallMs: number;
  snapshot: PerfSnapshot | null;
}

interface Point {
  x: number;
  y: number;
}

function centerOf(box: { x: number; y: number; width: number; height: number } | null): Point {
  if (!box) throw new Error('sin bounding box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * boundingBox blindado: después de un commit (captura en damas, settle de
 * spring en solitario) la ficha puede estar desmontada un instante mientras
 * RNW reconcilia el DOM; boundingBox() devuelve null sin reintentar. Espera
 * visibilidad y reintenta antes de rendirse (hallazgo PLAN §19).
 */
async function stableBox(page: Page, locator: Locator): Promise<Point> {
  await locator.waitFor({ state: 'visible', timeout: 5_000 });
  for (let attempt = 0; attempt < 5; attempt++) {
    const box = await locator.boundingBox();
    if (box) return centerOf(box);
    await page.waitForTimeout(200);
  }
  throw new Error(`sin bounding box tras reintentos: ${locator}`);
}

/** Drag escalonado (PLAN §9: ~25-30ms por paso activa el Pan de forma determinista). */
async function dragStepped(page: Page, from: Point, to: Point): Promise<void> {
  const steps = 8;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await page.mouse.move(x, y);
    await page.waitForTimeout(28);
  }
  await page.mouse.up();
}

async function dragByLabel(page: Page, sourceLabel: string, targetLabel: string): Promise<void> {
  const from = await stableBox(page, page.getByLabel(sourceLabel, { exact: true }));
  const to = await stableBox(page, page.getByLabel(targetLabel, { exact: true }));
  await dragStepped(page, from, to);
}

interface Scenario {
  id: string;
  gameId: 'solitario' | 'damas' | 'wakwak' | 'memorice';
  seed: string | null;
  /** Indicador de que el juego terminó de montar (espera activa de E2E). */
  ready: (page: Page) => Promise<void>;
  /** Acciones sobre el juego. Deterministas. */
  run: (page: Page) => Promise<void>;
}

const SCENARIOS: Scenario[] = [
  {
    id: 'wakwak-active-1',
    gameId: 'wakwak',
    seed: 'perf-level-1',
    ready: async (page) => {
      await expect(page.getByLabel('tablero-wakwak', { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByLabel('wakwak-robot', { exact: true })).toBeVisible();
    },
    // Movimiento continuo durante una ventana fija (teclado PC web)
    run: async (page) => {
      const keys = ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'];
      const deadline = Date.now() + WINDOW_MS;
      let i = 0;
      while (Date.now() < deadline) {
        const key = keys[i % keys.length];
        i += 1;
        await page.keyboard.down(key);
        await page.waitForTimeout(Math.min(400, Math.max(50, deadline - Date.now())));
        await page.keyboard.up(key);
      }
    },
  },
  {
    id: 'wakwak-active-8',
    gameId: 'wakwak',
    seed: 'perf-level-8',
    ready: async (page) => {
      await expect(page.getByLabel('tablero-wakwak', { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByLabel('wakwak-robot', { exact: true })).toBeVisible();
    },
    run: async (page) => {
      const keys = ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'];
      const deadline = Date.now() + WINDOW_MS;
      let i = 0;
      while (Date.now() < deadline) {
        const key = keys[i % keys.length];
        i += 1;
        await page.keyboard.down(key);
        await page.waitForTimeout(Math.min(400, Math.max(50, deadline - Date.now())));
        await page.keyboard.up(key);
      }
    },
  },
  {
    id: 'wakwak-paused',
    gameId: 'wakwak',
    seed: 'perf-level-1',
    ready: async (page) => {
      await expect(page.getByLabel('tablero-wakwak', { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByLabel('wakwak-robot', { exact: true })).toBeVisible();
    },
    run: async (page) => {
      // Pausar 1.5 s y reanudar: los callbacks de juego deben detenerse
      await page.getByLabel('pausa-wakwak', { exact: true }).click();
      await page.waitForTimeout(1500);
      await page.getByLabel('reanudar-wakwak', { exact: true }).click();
      await page.waitForTimeout(WINDOW_MS / 4);
    },
  },
  {
    id: 'solitario-drag',
    gameId: 'solitario',
    seed: 'test-move',
    ready: async (page) => {
      await expect(page.getByText(/Movimientos:/)).toBeVisible({ timeout: 20_000 });
    },
    run: async (page) => {
      // Draw: A♠ del stock a la waste
      await page.getByLabel('solitario-stock', { exact: true }).click();
      await expect(page.getByLabel('solitario-card-S-1', { exact: true })).toBeVisible();
      // Drag ilegal (columna vacía solo acepta K) → snap-back con spring
      await dragByLabel(page, 'solitario-card-S-1', 'solitario-tableau-1');
      await page.waitForTimeout(900);
      // Drag legal: A♠ → fundación ♠
      await dragByLabel(page, 'solitario-card-S-1', 'solitario-foundation-0');
      await page.waitForTimeout(900);
    },
  },
  {
    id: 'solitario-persist',
    gameId: 'solitario',
    // SIN seed: con seed el auto-resume está deshabilitado por diseño (reparto
    // fresco determinista); la persistencia/restauración se mide sin seed.
    seed: null,
    ready: async (page) => {
      await expect(page.getByText(/Movimientos:/)).toBeVisible({ timeout: 20_000 });
    },
    run: async (page) => {
      // Commit de partida + esperar el debounce (300ms) + reload para restaurar
      await page.getByLabel('solitario-stock', { exact: true }).click();
      await page.waitForTimeout(600);
      await page.reload();
      await expect(page.getByText(/Movimientos: \d+/)).toBeVisible({ timeout: 20_000 });
    },
  },
  {
    id: 'solitario-endgame',
    gameId: 'solitario',
    seed: 'perf-stock-empty',
    ready: async (page) => {
      await expect(page.getByText(/Movimientos:/)).toBeVisible({ timeout: 20_000 });
    },
    run: async (page) => {
      // Stock/waste vacíos: cada interacción ejecuta el peor caso de hasAnyMove
      const ace = page.getByLabel('solitario-card-H-1', { exact: true });
      await expect(ace).toBeVisible();
      await ace.dblclick(); // auto-move: A♥ → fundación ♥
      await page.waitForTimeout(900);
    },
  },
  {
    id: 'damas-initial',
    gameId: 'damas',
    seed: null,
    ready: async (page) => {
      await expect(page.getByLabel('damas-turno-1', { exact: true })).toBeVisible({ timeout: 20_000 });
    },
    run: async (page) => {
      // 24 fichas montadas; movimientos silenciosos legales con cambio de turno
      await dragByLabel(page, 'damas-ficha-1-1', 'damas-celda-49');
      await page.waitForTimeout(600);
      await dragByLabel(page, 'damas-ficha-2-1', 'damas-celda-8');
      await page.waitForTimeout(600);
    },
  },
  {
    id: 'damas-kings',
    gameId: 'damas',
    seed: 'perf-kings',
    ready: async (page) => {
      await expect(page.getByLabel('damas-turno-1', { exact: true })).toBeVisible({ timeout: 20_000 });
    },
    run: async (page) => {
      // Dama 1-a (17) → celda 10: quiet move de dama voladora
      await dragByLabel(page, 'damas-ficha-1-a', 'damas-celda-10');
      await page.waitForTimeout(600);
      // Peón 2-e (49) → 56: cambio de turno con 6 damas en el tablero
      await dragByLabel(page, 'damas-ficha-2-e', 'damas-celda-56');
      await page.waitForTimeout(600);
    },
  },
  {
    id: 'damas-branching',
    gameId: 'damas',
    seed: 'perf-branching',
    ready: async (page) => {
      await expect(page.getByLabel('damas-turno-1', { exact: true })).toBeVisible({ timeout: 20_000 });
    },
    run: async (page) => {
      // Captura legal (única cadena que termina en 62, captura a 53) con
      // ramificación evaluada en el drag start
      await dragByLabel(page, 'damas-ficha-1-a', 'damas-celda-62');
      await page.waitForTimeout(600);
      // Peón 2-b (35) → 44: turno 2 tras la captura, quiet move legal
      await dragByLabel(page, 'damas-ficha-2-b', 'damas-celda-44');
      await page.waitForTimeout(600);
    },
  },
  {
    id: 'memorice-mismatch',
    gameId: 'memorice',
    seed: 'perf-mismatch',
    ready: async (page) => {
      await expect(page.getByText(/Intentos:/)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByLabel('carta-1', { exact: true })).toBeVisible();
    },
    run: async (page) => {
      // Layout determinista (mismo deck que la app): dos cartas de pares distintos
      const deck = buildDeck(8, PERF_MISMATCH_SEED);
      const [a, b] = firstTwoIndices(deck, false);
      await page.getByLabel(`carta-${a + 1}`, { exact: true }).click();
      await page.getByLabel(`carta-${b + 1}`, { exact: true }).click();
      await page.waitForTimeout(900); // resolución del par fallado (700ms) + render
    },
  },
  {
    id: 'memorice-match',
    gameId: 'memorice',
    seed: 'perf-match',
    ready: async (page) => {
      await expect(page.getByText(/Intentos:/)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByLabel('carta-1', { exact: true })).toBeVisible();
    },
    run: async (page) => {
      const deck = buildDeck(8, PERF_MATCH_SEED);
      const [a, b] = firstTwoIndices(deck, true);
      await page.getByLabel(`carta-${a + 1}`, { exact: true }).click();
      await page.getByLabel(`carta-${b + 1}`, { exact: true }).click();
      await page.waitForTimeout(900);
    },
  },
];

/** Posiciones (0-based) del primer par del deck: coincidente (`same`) o no. */
function firstTwoIndices(deck: ReturnType<typeof buildDeck>, same: boolean): [number, number] {
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      const matches = deck[i].pairId === deck[j].pairId;
      if (matches === same) return [i, j];
    }
  }
  throw new Error('no se encontró el par buscado');
}

test.skip(!PERF_BASELINE, 'Baseline de performance: activar con PERF_BASELINE=1 y export con EXPO_PUBLIC_PERF_METRICS=1');

test.use({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] } });

async function clearStorage(page: Page): Promise<void> {
  // Estado limpio por run: solitario restaura la partida guardada (auto-resume);
  // sin clear, la corrida 2 partiría del estado de la corrida 1.
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
}

/** Lee el snapshot cerrado (tras salir por SPA: endPerfSession + idle write). */
async function readSnapshot(page: Page, gameId: string): Promise<PerfSnapshot> {
  await page.waitForTimeout(2600); // requestIdleCallback con timeout 2000
  const raw = await page.evaluate((key) => localStorage.getItem(key), `perf-metrics-${gameId}`);
  if (!raw) {
    throw new Error(
      `sin snapshot para ${gameId}: ¿el export fue hecho con EXPO_PUBLIC_PERF_METRICS=1? (build instrumentado requerido)`,
    );
  }
  return JSON.parse(raw) as PerfSnapshot;
}

for (const scenario of SCENARIOS) {
  test(`perf: ${scenario.id}`, async ({ page }) => {
    // Timeout dinámico: el protocolo completo (155 corridas × ~6-20s/run) no
    // cabe en un timeout fijo; se dimensiona por corrida con margen. La falla
    // anterior fue exactamente esto: el timeout fijo de 300s cortaba el loop
    // a mitad de las corridas válidas (hallazgo PLAN §19).
    test.setTimeout((WARMUP + LOTS * RUNS) * 30_000 + 60_000);
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    const file = path.join(ARTIFACT_DIR, `${scenario.id}.jsonl`);
    // Baseline fresco por invocación: el JSONL se truncó al iniciar el escenario
    writeFileSync(file, '');

    const totalRuns = WARMUP + LOTS * RUNS;
    for (let i = 0; i < totalRuns; i++) {
      const warmup = i < WARMUP;
      const lot = Math.floor((i - WARMUP) / RUNS);
      const runId = `${scenario.id}#${String(i + 1).padStart(3, '0')}`;

      const started = Date.now();
      await clearStorage(page);
      const url = scenario.seed ? `/juego/${scenario.gameId}?seed=${scenario.seed}` : `/juego/${scenario.gameId}`;
      await page.goto(url);
      await scenario.ready(page);
      await scenario.run(page);

      // Salir por SPA (no reload): desmonta la pantalla → endPerfSession +
      // escritura en idle; navegar con goto mataría el idle callback pendiente.
      const exit = page.getByLabel(`salir-${scenario.gameId}`, { exact: true });
      if (await exit.count()) await exit.click();
      await expect(page.getByText('Tasty Games')).toBeVisible({ timeout: 10_000 });

      const snapshot = await readSnapshot(page, scenario.gameId);
      const envelope: RunEnvelope = {
        schemaVersion: 1,
        scenarioId: scenario.id,
        runId,
        lot: warmup ? -1 : lot,
        warmup,
        seed: scenario.seed,
        platform: 'web',
        buildMode: 'instrumented',
        commit: COMMIT,
        viewport: `${VIEWPORT[0]}x${VIEWPORT[1]}`,
        wallMs: Date.now() - started,
        snapshot,
      };
      if (!warmup) {
        appendFileSync(file, `${JSON.stringify(envelope)}\n`);
        console.log(`[perf-harness] ${runId} ok (wall=${envelope.wallMs}ms)`);
      }
    }

    // Verificación mínima: la salida principal del escenario existe
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(LOTS * RUNS);
  });
}

test.afterAll(async () => {
  // Tabla resumen: por escenario, timers (mediana de p95 / máximo de p99) y
  // contadores de frecuencia (mediana de valor por run, p.ej. renderFreq:*).
  // NOTA (PLAN §19): `render.board` (duración) NO aparece en este perfil — el
  // build instrumentado estándar es React de producción, sin instrumentación
  // de Profiler; solo un build con profiling la captura. En este perfil la
  // señal de render son los contadores `renderFreq:*` (frecuencia ≠ duración).
  if (!PERF_BASELINE) return;
  interface TimerAgg {
    p95Med: number;
    p99Max: number;
    n: number;
  }
  const summary: Record<string, { timers: Record<string, TimerAgg>; counters: Record<string, number> }> = {};
  for (const scenario of SCENARIOS) {
    const file = path.join(ARTIFACT_DIR, `${scenario.id}.jsonl`);
    let lines: string[] = [];
    try {
      lines = readFileSync(file, 'utf8').trim().split('\n');
    } catch {
      continue;
    }
    const timers = new Map<string, number[]>();
    const p99s = new Map<string, number[]>();
    const counters = new Map<string, number[]>();
    for (const line of lines) {
      const env = JSON.parse(line) as RunEnvelope;
      for (const [key, s] of Object.entries(env.snapshot?.timers ?? {})) {
        timers.set(key, [...(timers.get(key) ?? []), s.p95]);
        p99s.set(key, [...(p99s.get(key) ?? []), s.p99]);
      }
      for (const [key, value] of Object.entries(env.snapshot?.counters ?? {})) {
        counters.set(key, [...(counters.get(key) ?? []), value]);
      }
    }
    const timersAgg: Record<string, TimerAgg> = {};
    for (const [key, values] of timers) {
      const sorted = [...values].sort((a, b) => a - b);
      const sorted99 = [...(p99s.get(key) ?? [])].sort((a, b) => a - b);
      timersAgg[key] = {
        p95Med: sorted[Math.floor(sorted.length / 2)],
        p99Max: sorted99[sorted99.length - 1],
        n: values.length,
      };
    }
    const countersAgg: Record<string, number> = {};
    for (const [key, values] of counters) {
      const sorted = [...values].sort((a, b) => a - b);
      countersAgg[key] = sorted[Math.floor(sorted.length / 2)];
    }
    summary[scenario.id] = { timers: timersAgg, counters: countersAgg };
  }
  writeFileSync(path.join(ARTIFACT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`[perf-harness] resumen escrito en tmp/perf/summary.json`);
  for (const [scenarioId, agg] of Object.entries(summary)) {
    console.log(`\n=== ${scenarioId} ===`);
    for (const [key, s] of Object.entries(agg.timers)) {
      console.log(`  ${key}: p95Med=${s.p95Med}ms p99Max=${s.p99Max}ms (n=${s.n})`);
    }
    for (const [key, med] of Object.entries(agg.counters)) {
      console.log(`  ${key}: med=${med}`);
    }
  }
});
