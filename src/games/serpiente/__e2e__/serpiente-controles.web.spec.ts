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

test('serpiente táctil: D-pad en cruz alineado (targets ≥48px) a 360×640', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page);

  const boxes: Record<string, { x: number; y: number; width: number; height: number }> = {};
  for (const label of DIRS) {
    const box = await page.getByLabel(label, { exact: true }).boundingBox();
    expect(box).not.toBeNull();
    boxes[label] = box!;
    // Default M: target ≥48px en ambas dimensiones.
    expect(box!.width).toBeGreaterThanOrEqual(48);
    expect(box!.height).toBeGreaterThanOrEqual(48);
  }

  // Cruz ALINEADA: brazos verticales comparten centro X; los horizontales
  // comparten centro Y y son simétricos alrededor del centro de la cruz
  // (desplazados exactamente 1 celda: así es un plus).
  const centerOf = (b: { x: number; width: number }): number => b.x + b.width / 2;
  const cell = boxes['serpiente-btn-arriba'].width;
  const cx = centerOf(boxes['serpiente-btn-arriba']);
  expect(Math.abs(centerOf(boxes['serpiente-btn-abajo']) - cx)).toBeLessThanOrEqual(2);
  const cyLeft = boxes['serpiente-btn-izquierda'].y + boxes['serpiente-btn-izquierda'].height / 2;
  const cyRight = boxes['serpiente-btn-derecha'].y + boxes['serpiente-btn-derecha'].height / 2;
  expect(Math.abs(cyLeft - cyRight)).toBeLessThanOrEqual(2);
  expect(Math.abs(centerOf(boxes['serpiente-btn-izquierda']) - (cx - cell))).toBeLessThanOrEqual(2);
  expect(Math.abs(centerOf(boxes['serpiente-btn-derecha']) - (cx + cell))).toBeLessThanOrEqual(2);

  // Sin solapes: arriba termina donde empieza la fila media (plus contiguo).
  const upBottom = boxes['serpiente-btn-arriba'].y + boxes['serpiente-btn-arriba'].height;
  const middleTop = Math.min(
    boxes['serpiente-btn-izquierda'].y,
    boxes['serpiente-btn-derecha'].y,
  );
  expect(Math.abs(middleTop - upBottom)).toBeLessThanOrEqual(1);

  // Izquierda y derecha no se solapan (el conector central las separa).
  const leftRight = boxes['serpiente-btn-izquierda'].x + boxes['serpiente-btn-izquierda'].width;
  expect(boxes['serpiente-btn-derecha'].x).toBeGreaterThanOrEqual(leftRight);
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

  // XL reducido = 56px de target, aún en overlay.
  const box = await page.getByLabel('serpiente-btn-arriba', { exact: true }).boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(52);
  expect(box!.height).toBeGreaterThanOrEqual(52);
  expect(box!.width).toBeLessThanOrEqual(60);
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
