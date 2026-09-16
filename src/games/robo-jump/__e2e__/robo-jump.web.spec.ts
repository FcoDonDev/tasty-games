import { expect, test, type Page } from '@playwright/test';

/**
 * E2E web de Robo Jump. Escenarios deterministas vía seeds sentinelas
 * (§3.5): `test-win` (torre central: ascenso sin input) y `test-lose`
 * (monstruo en el eje del rebote). El auto-rebote es determinista sin
 * input horizontal — los specs NO dependen del drag humano.
 */

async function openGame(page: Page, seed?: string): Promise<void> {
  const url = seed ? `/juego/robo-jump?seed=${seed}` : '/juego/robo-jump';
  await page.goto(url);
  await expect(page.getByLabel('robo-jump-escena', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('robo-jump-robot', { exact: true })).toBeVisible();
}

async function scoreText(page: Page): Promise<string> {
  return (await page.getByLabel('robo-jump-score', { exact: true }).textContent()) ?? '';
}

test('robo-jump: arranque con HUD y robo visible', async ({ page }) => {
  test.setTimeout(30_000);
  await openGame(page);
  await expect(page.getByLabel('robo-jump-score', { exact: true })).toBeVisible();
});

test('robo-jump: teclado mueve al Robo (←) y lo vuelve al centro (→)', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page, 'test-win');

  const robo = page.getByLabel('robo-jump-robot', { exact: true });
  const before = await robo.boundingBox();
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowLeft');
  const after = await robo.boundingBox();
  expect(after!.x).toBeLessThan(before!.x);

  // Volver hacia el centro (la torre está en el eje X central).
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(600);
  await page.keyboard.up('ArrowRight');
  const back = await robo.boundingBox();
  expect(back!.x).toBeGreaterThan(after!.x);
});

test('robo-jump: test-win — auto-rebote asciende (score crece sin input)', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page, 'test-win');

  // Torre central: el Robo sube solo (~89 u por rebote = ~9 m por salto).
  await expect
    .poll(async () => Number((await scoreText(page)).replace(/\s*m/, '')), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(20);
});

test('robo-jump: test-lose — monstruo en el eje mata y persiste récord (won:false)', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page, 'test-lose');

  // Muerte sin input en el primer ascenso + overlay diferido (~700 ms).
  const modal = page.getByLabel('overlay-fin', { exact: true });
  await expect(modal).toBeVisible({ timeout: 20_000 });
  await expect(modal.getByText('Fin del salto')).toBeVisible();

  // Récord persistido (endless: siempre won:false, D4) — save() es async.
  await expect
    .poll(
      async () => {
        const recordsRaw = await page.evaluate(() => localStorage.getItem('game_records'));
        const records = recordsRaw
          ? (JSON.parse(recordsRaw) as Array<{ gameId: string; won: boolean }>)
          : [];
        return records.filter((r) => r.gameId === 'robo-jump' && !r.won).length;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(1);

  // Reintentar conserva el seed E2E: arranca de nuevo y muere otra vez.
  await modal.getByLabel('reintentar-robo-jump', { exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByLabel('robo-jump-robot', { exact: true })).toBeVisible();
});

test('robo-jump: perf-long — mundo denso renderiza con score alto (R0: pool cubre banda alta)', async ({ page }) => {
  test.setTimeout(30_000);
  await openGame(page, 'perf-long');

  // Fixture de performance: height 20000 → score 2000 m desde el arranque.
  await expect(page.getByLabel('robo-jump-score', { exact: true })).toHaveText(/2\s?000\s?m/, { timeout: 10_000 });
  // El Robo rebota determinista en la primera plataforma: sigue vivo y visible.
  await expect(page.getByLabel('robo-jump-robot', { exact: true })).toBeVisible();
  // Sin monster/blank-corruption: el overlay de fin NO aparece (auto-rebote estable).
  await expect(page.getByLabel('overlay-fin', { exact: true })).toBeHidden({ timeout: 8_000 });
});

test('robo-jump: pausa congela al Robo y se reanuda', async ({ page }) => {  test.setTimeout(60_000);
  await openGame(page, 'test-win');

  await page.getByLabel('robo-jump-pausa', { exact: true }).click();
  const modal = page.getByLabel('overlay-pausa', { exact: true });
  await expect(modal).toBeVisible();
  const robo = page.getByLabel('robo-jump-robot', { exact: true });
  const frozen = await robo.boundingBox();
  await page.waitForTimeout(1200);
  expect(await robo.boundingBox()).toEqual(frozen); // congelado: misma caja
  await modal.getByLabel('reanudar-robo-jump', { exact: true }).click();
  await expect(modal).toBeHidden();
  // Reanudado: vuelve a moverse (rebota).
  await expect.poll(async () => {
    const box = await robo.boundingBox();
    return box ? Math.round(box.y) : -1;
  }, { timeout: 5_000 }).not.toBe(frozen!.y);
});

test('robo-jump: Home → jugar → salir', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.getByLabel('Jugar Robo Jump').click();
  await expect(page.getByLabel('robo-jump-escena', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('salir-robo-jump', { exact: true }).click();
  await expect(page.getByText('Tasty Games')).toBeVisible();
});

test.describe('robo-jump responsive (360×640, D4)', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('robo-jump: el papel cuadriculado cabe sin scroll a 360×640', async ({ page }) => {
    test.setTimeout(30_000);
    await openGame(page, 'test-win');
    // La escena (papel) y el robo son visibles; sin scroll de página.
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(scrollHeight).toBeLessThanOrEqual(641);
    const robo = page.getByLabel('robo-jump-robot', { exact: true });
    const box = await robo.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
  });
});
