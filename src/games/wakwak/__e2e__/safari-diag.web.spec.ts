import { expect, test, type Page } from '@playwright/test';

/**
 * DIAGNÓSTICO Safari/WebKit (PLAN-SAFARI-WEBKIT Fases 2-3).
 *
 * Instrumenta por página (addInitScript, SOLO diagnóstico — nunca en la app):
 * 1. Wrapper de HTMLMediaElement.play/currentTime: cuenta llamadas y
 *    rechazos por tipo (H1 AbortError = seek solapado; H2 NotAllowedError =
 *    autoplay sin gesto).
 * 2. Sondeo rAF-dt: stalls >25 ms del main thread (longtask/LoAF no existen
 *    en WebKit; el sondeo propio funciona en cualquier motor).
 *
 * Escenario determinista: seed perf-level-1 + ArrowLeft (baterías de la fila
 * del spawn). El orden warm→mediciones respeta H5 (cold-start WebKitGTK).
 */

interface AudioDiag {
  playCalls: number;
  seekCalls: number;
  rejected: Record<string, number>;
}
interface RafProbe {
  frames: number;
  stalls: number;
  maxDt: number;
  stallDts: number[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Window {
    __audioDiag?: AudioDiag;
    __rafProbe?: RafProbe;
  }
}

async function installProbes(page: Page, soundOff = false): Promise<void> {
  await page.addInitScript(
    ({ soundOff }) => {
      if (soundOff) {
        localStorage.setItem('preferences', JSON.stringify({ sound_enabled: '0' }));
      }
      const diag: AudioDiag = { playCalls: 0, seekCalls: 0, rejected: {} };
      window.__audioDiag = diag;
      const playOrig = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args: Parameters<typeof playOrig>) {
        diag.playCalls++;
        try {
          const p = playOrig.apply(this, args);
          if (p && typeof p.catch === 'function') {
            p.catch((e: DOMException) => {
              const key = e?.name ?? 'unknown';
              diag.rejected[key] = (diag.rejected[key] ?? 0) + 1;
            });
          }
          return p;
        } catch (e) {
          const key = (e as DOMException)?.name ?? 'sync-throw';
          diag.rejected[key] = (diag.rejected[key] ?? 0) + 1;
          return Promise.reject(e);
        }
      };
      const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
      if (desc?.set) {
        Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
          ...desc,
          set(v: number) {
            diag.seekCalls++;
            desc.set!.call(this, v);
          },
        });
      }
      const probe: RafProbe = { frames: 0, stalls: 0, maxDt: 0, stallDts: [] };
      window.__rafProbe = probe;
      let last = performance.now();
      const loop = (now: number) => {
        const dt = now - last;
        last = now;
        probe.frames++;
        if (dt > 25) {
          probe.stalls++;
          probe.maxDt = Math.max(probe.maxDt, dt);
          if (probe.stallDts.length < 200) probe.stallDts.push(Math.round(dt));
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },
    { soundOff },
  );
}

async function runScenario(page: Page, windowMs: number): Promise<{ score: number; audio: AudioDiag; raf: RafProbe }> {
  await page.goto('/juego/wakwak?seed=perf-level-1');
  await expect(page.getByLabel('tablero-wakwak', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('wakwak-robot', { exact: true })).toBeVisible();
  // H5/medición: los stalls del bootstrap (parse/hidratación) contaminan;
  // resetear el probe tras el ready mide SOLO gameplay.
  await page.evaluate(() => {
    const p = window.__rafProbe;
    if (p) {
      p.frames = 0;
      p.stalls = 0;
      p.maxDt = 0;
      p.stallDts = [];
    }
    const a = window.__audioDiag;
    if (a) {
      a.playCalls = 0;
      a.seekCalls = 0;
      a.rejected = {};
    }
  });
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(windowMs);
  const score = Number((await page.getByLabel('marcador-puntos', { exact: true }).textContent())?.replace(/\D/g, ''));
  const audio = (await page.evaluate(() => window.__audioDiag)) as AudioDiag;
  const raf = (await page.evaluate(() => window.__rafProbe)) as RafProbe;
  return { score, audio, raf };
}

test('DIAG warm-up (H5: proceso WebKit fresco corre degradado)', async ({ page }) => {
  test.setTimeout(30_000);
  await installProbes(page);
  await page.goto('/juego/wakwak?seed=perf-level-1');
  await expect(page.getByLabel('tablero-wakwak', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(3000);
});

test('DIAG audio: rechazos de play() durante pickups (audio ON)', async ({ page }) => {
  test.setTimeout(120_000);
  await installProbes(page);
  const { score, audio, raf } = await runScenario(page, 8000);
  const pickups = Math.round(score / 10);
  console.log(
    `[diag-audio] pickups≈${pickups} playCalls=${audio.playCalls} seekCalls=${audio.seekCalls} rejected=${JSON.stringify(audio.rejected)} | rAF frames=${raf.frames} stalls=${raf.stalls} maxDt=${Math.round(raf.maxDt)}ms`,
  );
  expect(pickups).toBeGreaterThan(0);
  expect(audio.playCalls).toBeGreaterThan(0);
});

test('DIAG stalls: rAF-dt con audio ON', async ({ page }) => {
  test.setTimeout(120_000);
  await installProbes(page);
  const { audio, raf } = await runScenario(page, 20_000);
  console.log(
    `[diag-stalls-on] playCalls=${audio.playCalls} rejected=${JSON.stringify(audio.rejected)} | rAF frames=${raf.frames} stalls=${raf.stalls} maxDt=${Math.round(raf.maxDt)}ms dts=${JSON.stringify(raf.stallDts.slice(0, 30))}`,
  );
  expect(raf.frames).toBeGreaterThan(100);
});

test('DIAG stalls: rAF-dt con audio OFF', async ({ page }) => {
  test.setTimeout(120_000);
  await installProbes(page, true);
  const { audio, raf } = await runScenario(page, 20_000);
  console.log(
    `[diag-stalls-off] playCalls=${audio.playCalls} | rAF frames=${raf.frames} stalls=${raf.stalls} maxDt=${Math.round(raf.maxDt)}ms dts=${JSON.stringify(raf.stallDts.slice(0, 30))}`,
  );
  expect(raf.frames).toBeGreaterThan(100);
  // el unlock reproduce muteado independiente del preference: solo logging
});
