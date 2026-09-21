import { expect, test, type Page } from '@playwright/test';

/**
 * E2E del D-pad de Serpiente (T3, PLAN-ACCESIBILIDAD). D7: en táctil el modo
 * default es 'botones' (D-pad visible sin preferencia previa). Geometría
 * candada con boundingBox: targets ≥48px y separación ≥8dp a 360×640
 * (Google Playables). Sin dependencia del teclado.
 */

test.use({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });

const DIRS = ['serpiente-btn-arriba', 'serpiente-btn-abajo', 'serpiente-btn-izquierda', 'serpiente-btn-derecha'] as const;

async function openGame(page: Page, query?: string): Promise<void> {
  await page.goto(query ? `/juego/serpiente?${query}` : '/juego/serpiente');
  await expect(page.getByLabel('serpiente-dpad', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('serpiente-cabeza', { exact: true })).toBeVisible();
}

/** Celda de la cabeza (idéntico al spec principal: testID del segmento ancestro). */
async function headCell(page: Page): Promise<number | null> {
  return page.getByLabel('tablero-serpiente', { exact: true }).evaluate((board) => {
    const head = board.querySelector('[aria-label="serpiente-cabeza"]');
    const seg = head?.closest('[data-testid^="serpiente-seg-"]');
    const match = seg?.getAttribute('data-testid')?.match(/serpiente-seg-(\d+)/);
    return match ? Number(match[1]) : null;
  });
}

async function headCellWait(page: Page): Promise<number> {
  for (let i = 0; i < 20; i++) {
    const cell = await headCell(page);
    if (cell !== null) return cell;
    await page.waitForTimeout(50);
  }
  throw new Error('cabeza sin segmento ancestro tras 1s');
}

const rowOf = (cell: number): number => Math.floor(cell / 20);

async function assertNoPageScroll(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 4);
}

test('serpiente táctil: D-pad visible por defecto y los botones dirigen', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page);
  for (const label of DIRS) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
  // Mobile-first: con el D-pad bajo el tablero la página sigue sin scrollear.
  await assertNoPageScroll(page);

  // Botón abajo → la fila de la cabeza crece de forma sostenida.
  await page.getByLabel('serpiente-btn-abajo', { exact: true }).click();
  const before = await headCellWait(page);
  await expect
    .poll(async () => {
      const cell = await headCell(page);
      return cell === null ? before : rowOf(cell);
    }, { timeout: 10_000 })
    .toBeGreaterThan(rowOf(before));
});

test('serpiente táctil: targets ≥48px y separación ≥8dp a 360×640', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page);

  const boxes: Record<string, { x: number; y: number; width: number; height: number }> = {};
  for (const label of DIRS) {
    const box = await page.getByLabel(label, { exact: true }).boundingBox();
    expect(box).not.toBeNull();
    boxes[label] = box!;
    // Target ≥48dp en ambas dimensiones (criterio Google Playables).
    expect(box!.width).toBeGreaterThanOrEqual(48);
    expect(box!.height).toBeGreaterThanOrEqual(48);
  }

  // Separación vertical entre arriba y la fila media ≥8dp.
  const upBottom = boxes['serpiente-btn-arriba'].y + boxes['serpiente-btn-arriba'].height;
  const middleTop = Math.min(
    boxes['serpiente-btn-izquierda'].y,
    boxes['serpiente-btn-derecha'].y,
  );
  expect(middleTop - upBottom).toBeGreaterThanOrEqual(8);

  // Separación horizontal entre izquierda y derecha ≥8dp.
  const leftRight = boxes['serpiente-btn-izquierda'].x + boxes['serpiente-btn-izquierda'].width;
  expect(boxes['serpiente-btn-derecha'].x - leftRight).toBeGreaterThanOrEqual(8);
});

test('serpiente táctil: ubicación y tamaño del D-pad persisten', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page);

  await page.getByLabel('serpiente-ajustes', { exact: true }).click();
  const modal = page.getByLabel('modal-ajustes-serpiente', { exact: true });
  await expect(modal).toBeVisible();
  await expect(page.getByLabel('serpiente-dpad', { exact: true })).toBeVisible();
  await page.getByLabel('serpiente-dpad-overlay', { exact: true }).click();
  await page.getByLabel('serpiente-dpad-xl', { exact: true }).click();
  await page.getByLabel('cerrar-ajustes-serpiente', { exact: true }).click();
  await expect(modal).toBeHidden();

  // XL = 64px de target, aún en overlay.
  const box = await page.getByLabel('serpiente-btn-arriba', { exact: true }).boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(64);
  expect(box!.height).toBeGreaterThanOrEqual(64);
  await expect(page.getByLabel('serpiente-dpad', { exact: true })).toBeVisible();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = localStorage.getItem('preferences');
        return raw ? (JSON.parse(raw) as Record<string, string>) : {};
      }),
    )
    .toEqual(
      expect.objectContaining({
        'serpiente.dpadPos': 'overlay',
        'serpiente.dpadSize': 'XL',
      }),
    );
});
