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
async function dragPiece(page: Page, sourceLabel: string, targetLabel: string): Promise<void> {
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
  const url = seed ? `/juego/damas?seed=${seed}` : '/juego/damas';
  await page.goto(url);
  await expect(page.getByLabel('damas-turno-1', { exact: true })).toBeVisible({ timeout: 15_000 });
}

test('damas: captura obligatoria — ilegal con snap-back y captura legal con cambio de turno', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openGame(page, 'test-capture');

  // Ilegal: movimiento silencioso de 1-b (44) estando obligada a capturar → snap-back
  const pieceB = page.getByLabel('damas-ficha-1-b', { exact: true });
  await dragPiece(page, 'damas-ficha-1-b', 'damas-celda-37');
  await page.waitForTimeout(700); // snap-back animado con spring
  const pieceBCenter = await centerOf(pieceB);
  const originCenter = await centerOf(page.getByLabel('damas-celda-44', { exact: true }));
  expect(Math.hypot(pieceBCenter.x - originCenter.x, pieceBCenter.y - originCenter.y)).toBeLessThan(10);
  await expect(page.getByText('Movimientos: 0')).toBeVisible();
  await expect(page.getByLabel('damas-turno-1', { exact: true })).toBeVisible();

  // Legal: 1-a captura a 2-a (42 → 35 → 28); el turno pasa al jugador 2
  await dragPiece(page, 'damas-ficha-1-a', 'damas-celda-28');
  await page.waitForTimeout(300); // settle animado (120 ms)
  await expect(page.getByLabel('damas-ficha-2-a', { exact: true })).toHaveCount(0);
  const pieceACenter = await centerOf(page.getByLabel('damas-ficha-1-a', { exact: true }));
  const landingCenter = await centerOf(page.getByLabel('damas-celda-28', { exact: true }));
  expect(Math.hypot(pieceACenter.x - landingCenter.x, pieceACenter.y - landingCenter.y)).toBeLessThan(10);
  await expect(page.getByLabel('damas-turno-2', { exact: true })).toBeVisible();
  await expect(page.getByText('Movimientos: 1')).toBeVisible();

  // El jugador 2 responde con movimiento silencioso (24 → 33) y vuelve el turno 1
  await dragPiece(page, 'damas-ficha-2-b', 'damas-celda-33');
  await page.waitForTimeout(300);
  await expect(page.getByLabel('damas-turno-1', { exact: true })).toBeVisible();
  await expect(page.getByText('Movimientos: 2')).toBeVisible();
});

test('damas: victoria forzada → modal sin récord + jugar de nuevo reinicia', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page, 'test-win');

  // Única ficha del jugador 2 capturada en un drag: 42 → 35 → 28
  await dragPiece(page, 'damas-ficha-1-a', 'damas-celda-28');

  const modal = page.getByLabel('modal-fin-damas', { exact: true });
  await expect(modal).toBeVisible();
  await expect(modal.getByText(/Gana Jugador 1/)).toBeVisible();

  // L5: el MVP de damas NO persiste récord (onGameEnd no se invoca)
  const recordsRaw = await page.evaluate(() => localStorage.getItem('game_records'));
  const damasRecords = recordsRaw
    ? (JSON.parse(recordsRaw) as Array<{ gameId: string }>).filter((r) => r.gameId === 'damas')
    : [];
  expect(damasRecords).toHaveLength(0);

  // Jugar de nuevo: tablero estándar (24 fichas) y turno del jugador 1
  await modal.getByLabel('jugar-de-nuevo-damas', { exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByLabel(/^damas-ficha-/)).toHaveCount(24);
  await expect(page.getByLabel('damas-turno-1', { exact: true })).toBeVisible();
});

test('damas: salir vuelve al Home', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.getByLabel('Jugar Damas').click();
  await expect(page.getByLabel('damas-turno-1', { exact: true })).toBeVisible({ timeout: 15_000 });

  // Reparto estándar: 24 fichas sobre 32 casillas oscuras
  await expect(page.getByLabel(/^damas-ficha-/)).toHaveCount(24);
  await expect(page.getByLabel(/^damas-celda-/)).toHaveCount(32);

  await page.getByLabel('salir-damas', { exact: true }).click();
  await expect(page.getByText('Tasty Games')).toBeVisible();
});
