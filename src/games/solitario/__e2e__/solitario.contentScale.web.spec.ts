import { expect, test, type Page, type Locator } from '@playwright/test';

interface Point {
  x: number;
  y: number;
}

function center(box: { x: number; y: number; width: number; height: number }): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function centerOf(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('sin bounding box');
  return center(box);
}

/** Simula drag con mouse: down → moves escalonados (activa el Pan) → up. */
async function dragCard(page: Page, sourceLabel: string, targetLabel: string): Promise<void> {
  const source = page.getByLabel(sourceLabel, { exact: true });
  const target = page.getByLabel(targetLabel, { exact: true });
  const from = await centerOf(source);
  const to = await centerOf(target);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 10 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

async function openGame(page: Page, seed?: string): Promise<void> {
  const url = seed ? `/juego/solitario?seed=${seed}` : '/juego/solitario';
  await page.goto(url);
  await expect(page.getByText(/Movimientos:/)).toBeVisible({ timeout: 15_000 });
}

/** Font-size inline mayor dentro de la primera carta del DOM (top del stock).
 * El setting escala el fontSize del contenido, así que este valor es el proxy
 * de la escala activa (la geometría del slot no cambia). */
async function maxFontSizeOfFirstCard(page: Page): Promise<number> {
  return page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('[aria-label^="solitario-card-"]');
    if (!card) throw new Error('sin carta visible');
    let max = 0;
    for (const el of card.querySelectorAll<HTMLElement>('div, span')) {
      if (el.style.fontSize === '') continue;
      const size = Number.parseFloat(getComputedStyle(el).fontSize);
      if (Number.isFinite(size) && size > max) max = size;
    }
    return max;
  });
}

test('solitario: setting "Tamaño del contenido" aplica al instante y persiste', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openGame(page);

  const normalFont = await maxFontSizeOfFirstCard(page);

  await page.getByLabel('solitario-abrir-ajustes').click();
  const panel = page.getByLabel('solitario-ajustes');
  await expect(panel).toBeVisible();

  // Grande: crece sin recargar (aplica al instante)
  await page.getByLabel('solitario-set-escala-g').click();
  const grandeFont = await maxFontSizeOfFirstCard(page);
  expect(grandeFont).toBeGreaterThan(normalFont);

  // Compacto: baja por debajo de Normal
  await page.getByLabel('solitario-set-escala-c').click();
  const compactoFont = await maxFontSizeOfFirstCard(page);
  expect(compactoFont).toBeLessThan(normalFont);

  // Persistencia: elegir Grande, cerrar y recargar
  await page.getByLabel('solitario-set-escala-g').click();
  await page.getByLabel('solitario-cerrar-ajustes').click();
  await expect(panel).toHaveCount(0);
  const prefsRaw = await page.evaluate(() => localStorage.getItem('preferences'));
  expect(prefsRaw).toContain('"solitario.contentScale":"1.2"');

  await page.reload();
  await expect(page.getByText(/Movimientos:/)).toBeVisible({ timeout: 15_000 });
  const reloadedFont = await maxFontSizeOfFirstCard(page);
  expect(reloadedFont).toBeCloseTo(grandeFont, 1);
});

test('solitario: drag con contenido Grande mantiene geometría e hit-testing', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openGame(page, 'test-move');

  await page.getByLabel('solitario-abrir-ajustes').click();
  await page.getByLabel('solitario-set-escala-g').click();
  await page.getByLabel('solitario-cerrar-ajustes').click();
  await expect(page.getByLabel('solitario-ajustes')).toHaveCount(0);

  // El slot de foundation no cambió de tamaño con el setting (geometría intacta)
  const foundation = page.getByLabel('solitario-foundation-0', { exact: true });
  const foundationBox = await foundation.boundingBox();
  if (!foundationBox) throw new Error('sin bounding box de foundation');
  expect(foundationBox.width).toBeGreaterThan(40);
  expect(foundationBox.height).toBeGreaterThan(55);

  await page.getByLabel('solitario-stock').click();
  const ace = page.getByLabel('solitario-card-S-1', { exact: true });
  await expect(ace).toBeVisible();
  await dragCard(page, 'solitario-card-S-1', 'solitario-foundation-0');
  await expect(page.getByText('Movimientos: 2')).toBeVisible();
  await page.waitForTimeout(1000); // settle animado con spring antes de medir
  const aceAfter = await centerOf(ace);
  const foundationCenter = await centerOf(foundation);
  expect(Math.abs(aceAfter.x - foundationCenter.x)).toBeLessThan(3);
  expect(Math.abs(aceAfter.y - foundationCenter.y)).toBeLessThan(3);
});
