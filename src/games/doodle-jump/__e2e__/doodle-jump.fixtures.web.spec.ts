import { expect, test, type Page, type Locator } from '@playwright/test';

/**
 * E2E por fixtures de mecánica (pedido del usuario): escenario FIJO vía
 * seed `?seed=fix-<id>` (mundo cerrado, EXPO_PUBLIC_E2E=1) + coreografía
 * de input pautada → el resultado esperado es visible y estable. La
 * exactitud mecánica la candean los unit (`__tests__/fixtures.test.ts`);
 * acá se valida el comportamiento VISIBLE (popups, posiciones).
 */

async function openFixture(page: Page, id: string): Promise<void> {
  await page.goto(`/juego/doodle-jump?seed=fix-${id}`);
  await expect(page.getByLabel('doodle-jump-escena', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('doodle-jump-doodler', { exact: true })).toBeVisible();
}

async function doodlerBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.getByLabel('doodle-jump-doodler', { exact: true }).boundingBox();
  if (!box) throw new Error('doodler sin caja');
  return box;
}

/** Espera a que el texto del popup aparezca (aparece y vive ~800 ms). */
async function expectPopup(page: Page, text: string, timeoutMs = 8_000): Promise<void> {
  const popup: Locator = page.getByText(text, { exact: true });
  await expect
    .poll(async () => popup.isVisible().catch(() => false), { timeout: timeoutMs, intervals: [100, 250] })
    .toBe(true);
}

test('fix-spring — el resorte muestra ¡Resorte! y el Doodler sobrevive', async ({ page }) => {
  test.setTimeout(30_000);
  await openFixture(page, 'spring');
  await expectPopup(page, '¡Resorte!');
  await expect(page.getByLabel('overlay-fin', { exact: true })).toBeHidden();
});

test('fix-hat — ¡Propeller! y luego ¡Plop! (atraviesa letalmente, D12)', async ({ page }) => {
  test.setTimeout(30_000);
  await openFixture(page, 'hat');
  await expectPopup(page, '¡Propeller!');
  await expectPopup(page, '¡Plop!');
  await expect(page.getByLabel('overlay-fin', { exact: true })).toBeHidden();
});

test('fix-squish — aplaste: ¡Plop! y el Doodler vive', async ({ page }) => {
  test.setTimeout(30_000);
  await openFixture(page, 'squish');
  await expectPopup(page, '¡Plop!');
  await expect(page.getByLabel('overlay-fin', { exact: true })).toBeHidden();
});

test('fix-aim — tap arriba del Doodler dispara y mata (¡Plop!)', async ({ page }) => {
  test.setTimeout(30_000);
  await openFixture(page, 'aim');
  // Apuntar 300 px ARRIBA del Doodler: la bala sube y toca al monstruo
  // fijo de la fixture (unidad cubre la exactitud de las 3 direcciones).
  const box = await doodlerBox(page);
  await page.mouse.click(box.x + box.width / 2, box.y - 300);
  await expectPopup(page, '¡Plop!');
  await expect(page.getByLabel('overlay-fin', { exact: true })).toBeHidden();
});

test('fix-wrap — el teclado cruza el borde y el Doodler reaparece por la izquierda', async ({ page }) => {
  test.setTimeout(30_000);
  await openFixture(page, 'wrap');
  const before = await doodlerBox(page);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowRight');
  const after = await doodlerBox(page);
  expect(after.x).toBeLessThan(before.x); // wrap: reapareció por la izquierda
  await expect(page.getByLabel('overlay-fin', { exact: true })).toBeHidden();
});
