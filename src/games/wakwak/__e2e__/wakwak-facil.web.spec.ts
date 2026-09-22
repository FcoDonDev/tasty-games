import { expect, test, type Page } from '@playwright/test';

/**
 * E2E web del modo FÁCIL de Wak Wak (PLAN-ACCESIBILIDAD T4d). Sentinelas
 * propios con la geometría del layout fácil: `facil-win` (8 baterías en la
 * fila del spawn, 2 press cierran la run en el nivel 8) y `facil-lose` (los 2
 * drones convergen sobre el robot idle). El récord de estas runs vive bajo la
 * clave separada `wakwak-facil` (recordGameId, D8).
 */

type DirKey = 'ArrowLeft' | 'ArrowRight';

async function openGame(page: Page, seed?: string): Promise<void> {
  const url = seed ? `/juego/wakwak?seed=${seed}` : '/juego/wakwak';
  await page.goto(url);
  await expect(page.getByLabel('tablero-wakwak', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('wakwak-robot', { exact: true })).toBeVisible();
}

async function score(page: Page): Promise<number> {
  return Number((await page.getByLabel('marcador-puntos', { exact: true }).textContent())?.replace(/\D/g, ''));
}

test('wakwak fácil: modo fácil por URL (?difficulty=facil) muestra HUD FÁCIL, 2 drones y tablero 11×13', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/juego/wakwak?difficulty=facil');
  await expect(page.getByLabel('tablero-wakwak', { exact: true })).toBeVisible({ timeout: 15_000 });

  await expect(page.getByLabel('wakwak-modo', { exact: true })).toHaveText('FÁCIL');
  await expect(page.getByLabel('wakwak-drone-0', { exact: true })).toBeVisible();
  await expect(page.getByLabel('wakwak-drone-1', { exact: true })).toBeVisible();
  // el fácil no tiene drones 2/3
  await expect(page.getByLabel('wakwak-drone-2', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('wakwak-drone-3', { exact: true })).toHaveCount(0);

  // tablero 11×13: ratio ~0.846 (el normal 19×21 da ~0.905)
  const board = await page.getByLabel('tablero-wakwak', { exact: true }).boundingBox();
  expect(board).not.toBeNull();
  const ratio = board!.width / board!.height;
  expect(Math.abs(ratio - 11 / 13)).toBeLessThan(0.02);

  // 4 súper baterías (esquinas r1/r11): dots grandes (≥ 40% de la celda)
  const supers = await page.evaluate(() => {
    const board = document.querySelector('[aria-label="tablero-wakwak"]')!.getBoundingClientRect();
    const cell = board.width / 11;
    return Array.from(document.querySelectorAll('[data-testid^="wakwak-dot-"]')).filter(
      (d) => d.getBoundingClientRect().width > cell * 0.4,
    ).length;
  });
  expect(supers).toBe(4);
});

test('wakwak fácil: facil-win — dos press comen las 8 baterías, run completa con récord en wakwak-facil', async ({ page }) => {
  test.setTimeout(90_000);
  await openGame(page, 'facil-win');
  await expect(page.getByLabel('wakwak-modo', { exact: true })).toHaveText('FÁCIL');

  // derecha: come c6..c9; izquierda: vuelve y come c1..c4 (el spawn queda libre)
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1_200);
  await page.keyboard.press('ArrowLeft');

  const modal = page.getByLabel('modal-fin-wakwak', { exact: true });
  await expect(modal).toBeVisible({ timeout: 20_000 });
  await expect(modal.getByText('¡Run completa!')).toBeVisible();
  await expect(modal.getByText('FÁCIL')).toBeVisible();

  // el récord quedó en la CLAVE del modo fácil (won: true) — save() es async
  await expect
    .poll(async () => {
      const recordsRaw = await page.evaluate(() => localStorage.getItem('game_records'));
      const records = recordsRaw ? (JSON.parse(recordsRaw) as Array<{ gameId: string; won: boolean }>) : [];
      return records.filter((r) => r.gameId === 'wakwak-facil' && r.won).length;
    }, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1);
});

test('wakwak fácil: facil-lose — los 2 drones atrapan al robot y pierde', async ({ page }) => {
  test.setTimeout(90_000);
  await openGame(page, 'facil-lose');

  // robot quieto: los 2 drones del fácil salen (~0.5-1.5s) y convergen
  const modal = page.getByLabel('modal-fin-wakwak', { exact: true });
  await expect(modal).toBeVisible({ timeout: 60_000 });
  await expect(modal.getByText('Sistemas comprometidos')).toBeVisible();
  await expect(modal.getByText('FÁCIL')).toBeVisible();

  await expect
    .poll(async () => {
      const recordsRaw = await page.evaluate(() => localStorage.getItem('game_records'));
      const records = recordsRaw ? (JSON.parse(recordsRaw) as Array<{ gameId: string; won: boolean }>) : [];
      return records.filter((r) => r.gameId === 'wakwak-facil' && !r.won).length;
    }, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1);
});

test('wakwak fácil: toggle en el picker persiste y la próxima partida arranca fácil', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page);

  await page.getByLabel('niveles-wakwak', { exact: true }).click();
  await page.getByLabel('wakwak-modo-facil', { exact: true }).click();
  await page.getByLabel('cerrar-niveles-wakwak', { exact: true }).click();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = localStorage.getItem('preferences');
        return raw ? (JSON.parse(raw) as Record<string, string>)['wakwak.modo'] : undefined;
      }),
    )
    .toBe('facil');

  // reiniciar: la run nueva usa el setting del picker
  await page.getByLabel('reiniciar-wakwak', { exact: true }).click();
  await page.getByLabel('confirmar-reinicio-wakwak', { exact: true }).click();
  await expect(page.getByLabel('wakwak-modo', { exact: true })).toHaveText('FÁCIL');
  await expect(page.getByLabel('wakwak-drone-2', { exact: true })).toHaveCount(0);
  expect(await score(page)).toBe(0);
});
