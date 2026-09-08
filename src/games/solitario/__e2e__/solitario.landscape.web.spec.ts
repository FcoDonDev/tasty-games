import { expect, test, type Page } from '@playwright/test';

// Landscape de teléfono chico: dispara el modo compacto (header vertical a la
// izquierda). El drag con mouse sigue siendo el driver de los gestos.
test.use({ viewport: { width: 740, height: 360 } });

async function centerOf(page: Page, label: string): Promise<{ x: number; y: number }> {
  const box = await page.getByLabel(label, { exact: true }).boundingBox();
  if (!box) throw new Error(`sin bounding box para ${label}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function dragCard(page: Page, sourceLabel: string, targetLabel: string): Promise<void> {
  const from = await centerOf(page, sourceLabel);
  const to = await centerOf(page, targetLabel);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 10 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

test('solitario landscape: header vertical a la izquierda y cartas agrandadas', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/juego/solitario?seed=test-move');
  await expect(page.getByText(/Movimientos:/)).toBeVisible({ timeout: 15_000 });

  // Rail a la izquierda: el botón salir queda antes (x) que el tablero
  const exitBox = await page.getByLabel('salir-solitario').boundingBox();
  const boardBox = await page.getByLabel('solitario-tablero').boundingBox();
  expect(exitBox).not.toBeNull();
  expect(boardBox).not.toBeNull();
  expect(exitBox!.x + exitBox!.width).toBeLessThanOrEqual(boardBox!.x);
  // ...y es un rail angosto (columna), no una barra horizontal
  expect(exitBox!.width).toBeLessThanOrEqual(64);

  // Carta agrandada: ≈ altoTablero/4.6 (> 60px, vs ~45-48 en portrait)
  await page.getByLabel('solitario-stock').click();
  const ace = page.getByLabel('solitario-card-S-1', { exact: true });
  await expect(ace).toBeVisible();
  const cardBox = await ace.boundingBox();
  expect(cardBox!.width).toBeGreaterThan(60);
  expect(cardBox!.width).toBeLessThan(90);

  // Sin scroll innecesario
  const scroll = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - window.innerWidth,
    y: document.documentElement.scrollHeight - window.innerHeight,
  }));
  expect(scroll.x).toBeLessThanOrEqual(0);
  expect(scroll.y).toBeLessThanOrEqual(0);
});

test('solitario landscape: drag legal a foundation funciona en el modo rail', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/juego/solitario?seed=test-move');
  await expect(page.getByText(/Movimientos:/)).toBeVisible({ timeout: 15_000 });

  await page.getByLabel('solitario-stock').click();
  const ace = page.getByLabel('solitario-card-S-1', { exact: true });
  await expect(ace).toBeVisible();

  await dragCard(page, 'solitario-card-S-1', 'solitario-foundation-0');
  await expect(page.getByText('Movimientos: 2')).toBeVisible();
  await page.waitForTimeout(1000); // settle animado antes de medir
  const aceAfter = await centerOf(page, 'solitario-card-S-1');
  const foundation = await centerOf(page, 'solitario-foundation-0');
  expect(Math.hypot(aceAfter.x - foundation.x, aceAfter.y - foundation.y)).toBeLessThan(10);
});
