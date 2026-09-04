import { expect, test, type Page } from '@playwright/test';

// Mobile-first: viewport de teléfono chico (criterio D4 del plan)
test.use({ viewport: { width: 360, height: 640 } });

const GAMES = ['memorice', 'solitario', 'damas'] as const;

async function assertNoPageScroll(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 4);
}

test('responsive 360×640: Home sin scroll', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await expect(page.getByText('Tasty Games')).toBeVisible({ timeout: 15_000 });
  await assertNoPageScroll(page);
});

for (const game of GAMES) {
  test(`responsive 360×640: ${game} con tablero completo sin scroll`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(`/juego/${game}`);

    // Esperar el contenido propio de cada juego (estado listo)
    if (game === 'memorice') {
      await expect(page.getByLabel('carta-1', { exact: true })).toBeVisible({ timeout: 15_000 });
    } else if (game === 'solitario') {
      await expect(page.getByText(/Movimientos:/)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByLabel(/^solitario-card-/).first()).toBeVisible({ timeout: 15_000 });
    } else {
      await expect(page.getByLabel('damas-turno-1', { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByLabel(/^damas-ficha-/).first()).toBeVisible({ timeout: 15_000 });
    }

    await assertNoPageScroll(page);

    // El header estandarizado está presente (salir + reiniciar + ayuda)
    await expect(page.getByLabel(`salir-${game}`, { exact: true })).toBeVisible();
    await expect(page.getByLabel(`reiniciar-${game}`, { exact: true })).toBeVisible();
    await expect(page.getByLabel(`ayuda-${game}`, { exact: true })).toBeVisible();
  });
}
