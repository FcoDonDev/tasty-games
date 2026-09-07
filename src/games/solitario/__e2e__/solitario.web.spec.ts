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

test('solitario: movimiento legal a foundation e intento ilegal con snap-back', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openGame(page, 'test-move');

  // Robar: el A♠ (top del stock) pasa a la waste
  await page.getByLabel('solitario-stock').click();
  const ace = page.getByLabel('solitario-card-S-1', { exact: true });
  await expect(ace).toBeVisible();

  // Ilegal: A♠ sobre columna vacía (solo acepta K) → snap-back (spring con velocity)
  await dragCard(page, 'solitario-card-S-1', 'solitario-tableau-1');
  await page.waitForTimeout(1000); // snap-back animado con spring (400ms perceptual) + render
  const aceCenter = await centerOf(ace);
  const wasteCenter = await centerOf(page.getByLabel('solitario-waste', { exact: true }));
  expect(Math.hypot(aceCenter.x - wasteCenter.x, aceCenter.y - wasteCenter.y)).toBeLessThan(10);
  await expect(page.getByText('Movimientos: 1')).toBeVisible();

  // Legal: A♠ → foundation de ♠ (index 0)
  await dragCard(page, 'solitario-card-S-1', 'solitario-foundation-0');
  await expect(page.getByText('Movimientos: 2')).toBeVisible();
  await page.waitForTimeout(1000); // settle animado con spring (400ms perceptual) antes de medir posición
  const aceAfter = await centerOf(ace);
  const foundationCenter = await centerOf(
    page.getByLabel('solitario-foundation-0', { exact: true }),
  );
  expect(Math.hypot(aceAfter.x - foundationCenter.x, aceAfter.y - foundationCenter.y)).toBeLessThan(10);
});

test('solitario: auto-move a foundation con doble click', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page, 'test-move');

  // Robar: el A♠ (top del stock) pasa a la waste
  await page.getByLabel('solitario-stock').click();
  const ace = page.getByLabel('solitario-card-S-1', { exact: true });
  await expect(ace).toBeVisible();

  // Doble click sobre el as: va directo a la foundation de ♠ (index 0).
  // El robo ya consumió 1 movimiento, el auto-move suma el 2º.
  await ace.dblclick();
  await expect(page.getByText('Movimientos: 2')).toBeVisible();
  await page.waitForTimeout(1000); // commit inmediato, margen para el render
  const aceAfter = await centerOf(ace);
  const foundationCenter = await centerOf(
    page.getByLabel('solitario-foundation-0', { exact: true }),
  );
  expect(Math.hypot(aceAfter.x - foundationCenter.x, aceAfter.y - foundationCenter.y)).toBeLessThan(10);
});

test('solitario: doble click con pausa entre clicks (doble tap humano) hace auto-move', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openGame(page, 'test-move');

  await page.getByLabel('solitario-stock').click();
  const ace = page.getByLabel('solitario-card-S-1', { exact: true });
  await expect(ace).toBeVisible();

  // Dos clicks separados por ~250ms (maxDelay del TapGesture): el gesto nativo
  // con default 200ms fallaría aquí; debe reconocer el doble tap igual.
  const center = await centerOf(ace);
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(250);
  await page.mouse.click(center.x, center.y);
  await expect(page.getByText('Movimientos: 2')).toBeVisible();
});

test('solitario: clic derecho durante un drag no mueve ni deja la carta flotando', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openGame(page, 'test-move');

  await page.getByLabel('solitario-stock').click();
  const ace = page.getByLabel('solitario-card-S-1', { exact: true });
  await expect(ace).toBeVisible();

  // Drag activo (carta levantada, sigue al cursor) + clic derecho en el aire:
  // el auto-move debe ignorarse y el drag debe terminar en snap-back limpio.
  const from = await centerOf(ace);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 30, { steps: 8 });
  await page.mouse.click(from.x + 40, from.y + 30, { button: 'right' });
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.waitForTimeout(1000); // snap-back con spring

  await expect(page.getByText('Movimientos: 1')).toBeVisible();
  const aceCenter = await centerOf(ace);
  const wasteCenter = await centerOf(page.getByLabel('solitario-waste', { exact: true }));
  expect(Math.hypot(aceCenter.x - wasteCenter.x, aceCenter.y - wasteCenter.y)).toBeLessThan(10);
});

test('solitario: auto-move a foundation con clic derecho (web)', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page, 'test-move');

  await page.getByLabel('solitario-stock').click();
  const ace = page.getByLabel('solitario-card-S-1', { exact: true });
  await expect(ace).toBeVisible();

  // Clic derecho sobre el as: mismo camino de auto-move (robo=1, auto-move=2)
  const before = await centerOf(ace);
  await page.mouse.click(before.x, before.y, { button: 'right' });
  await expect(page.getByText('Movimientos: 2')).toBeVisible();
  await page.waitForTimeout(1000);
  const aceAfter = await centerOf(ace);
  const foundationCenter = await centerOf(
    page.getByLabel('solitario-foundation-0', { exact: true }),
  );
  expect(Math.hypot(aceAfter.x - foundationCenter.x, aceAfter.y - foundationCenter.y)).toBeLessThan(10);
});

test('solitario: victoria forzada → modal + récord persistido + ScoreBoard', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page, 'test-win');

  // K♣ (top del tableau 0) → foundation de ♣ (index 3): último movimiento
  await dragCard(page, 'solitario-card-C-13', 'solitario-foundation-3');

  const modal = page.getByLabel('modal-victoria-solitario');
  await expect(modal).toBeVisible();
  await expect(modal.getByText(/Ganaste/)).toBeVisible();
  await expect(modal.getByText(/\d+ pts · \d+ movimientos/)).toBeVisible();

  // Récord persistido en localStorage
  const recordsRaw = await page.evaluate(() => localStorage.getItem('game_records'));
  expect(recordsRaw).not.toBeNull();
  const records = JSON.parse(recordsRaw!) as Array<{
    gameId: string;
    won: boolean;
    score: number;
  }>;
  const record = records.find((r) => r.gameId === 'solitario' && r.won);
  expect(record).toBeDefined();
  expect(record!.score).toBeGreaterThan(0);

  // Tras recargar, el récord aparece en el ScoreBoard compacto del header
  await page.reload();
  await expect(page.getByLabel('record-solitario')).toHaveText(/\d+ pts/, { timeout: 15_000 });
});

test('solitario: salir vuelve al Home', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.getByLabel('Jugar Solitario').click();
  await expect(page.getByText(/Movimientos:/)).toBeVisible({ timeout: 15_000 });

  // Fan del tableau: reparto estándar renderiza 28 cartas en tableau + 1 en stock
  const cardCount = await page.getByLabel(/^solitario-card-/).count();
  expect(cardCount).toBeGreaterThanOrEqual(29);

  await page.getByLabel('salir-solitario').click();
  await expect(page.getByText('Tasty Games')).toBeVisible();
});
