import { expect, test, type Page } from '@playwright/test';

/**
 * E2E web de Serpiente. Escenarios deterministas vía seeds sentinelas
 * (D12): test-win (un tick gana), test-lose (un tick muere) y test-crecer
 * (comida adelante).
 *
 * Input por plataforma (refleja la app): los specs "desktop" usan el teclado
 * (PC web: flechas + WASD); el spec táctil usa emulación de móvil (puntero
 * coarse) con swipe real vía CDP — el modo gestos emite al cruzar el umbral
 * (24 px), en cualquier parte de la pantalla.
 */

type DirKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'w' | 'a' | 's' | 'd';

async function openGame(page: Page, seed?: string): Promise<void> {
  const url = seed ? `/juego/serpiente?seed=${seed}` : '/juego/serpiente';
  await page.goto(url);
  await expect(page.getByLabel('tablero-serpiente', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('serpiente-cabeza', { exact: true })).toBeVisible();
}

/**
 * Celda de la cabeza: el segmento ancestro lleva `serpiente-seg-<celda>`.
 * D4: los segmentos usan `testID` (RNW → `data-testid`), no aria-label.
 * Lectura ATÓMICA en un solo evaluate sobre el tablero (estable): resolver el
 * locator y leer en dos pasos pierde la carrera contra los ticks de React
 * (cada 140 ms el nodo se reemplaza y el desatachado pierde sus ancestros —
 * `closest` devuelve null). JS single-thread: dentro del evaluate no hay commit.
 */
async function readHeadCell(page: Page): Promise<number | null> {
  return page.getByLabel('tablero-serpiente', { exact: true }).evaluate((board) => {
    const head = board.querySelector('[aria-label="serpiente-cabeza"]');
    const seg = head?.closest('[data-testid^="serpiente-seg-"]');
    const match = seg?.getAttribute('data-testid')?.match(/serpiente-seg-(\d+)/);
    return match ? Number(match[1]) : null;
  });
}

async function headCell(page: Page): Promise<number> {
  for (let i = 0; i < 20; i++) {
    const cell = await readHeadCell(page);
    if (cell !== null) return cell;
    await page.waitForTimeout(50);
  }
  throw new Error('cabeza sin segmento ancestro tras 1s');
}

const rowOf = (cell: number): number => Math.floor(cell / 20);

async function score(page: Page): Promise<number> {
  return Number(await page.getByLabel('hud-puntos', { exact: true }).textContent());
}

test('serpiente: flechas cambian la dirección (cabeza baja con ArrowDown)', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page);

  const before = await headCell(page);
  await page.keyboard.press('ArrowDown');
  // Poll por FILA: un `not.toBe(cell)` se resuelve con un avance a la derecha
  // (dirección default) antes de que el giro se aplique (buffer de 1 tick).
  await expect
    .poll(async () => rowOf(await headCell(page)), { timeout: 10_000 })
    .toBeGreaterThan(rowOf(before));
});

test('serpiente: WASD también dirige (s = abajo)', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page);

  const before = await headCell(page);
  await page.keyboard.press('s');
  // Poll por fila (ver test anterior: carrera del buffer de 1 tick).
  await expect
    .poll(async () => rowOf(await headCell(page)), { timeout: 10_000 })
    .toBeGreaterThan(rowOf(before));
});

test('serpiente: pausa congela la simulación y se reanuda', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page);

  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(500);
  await page.getByLabel('pausa-serpiente', { exact: true }).click();
  const modal = page.getByLabel('modal-pausa-serpiente', { exact: true });
  await expect(modal).toBeVisible();
  // Cabeza congelada: dos lecturas separadas coinciden.
  const frozen = await headCell(page);
  await page.waitForTimeout(1500);
  expect(await headCell(page)).toBe(frozen);
  await modal.getByLabel('reanudar-serpiente', { exact: true }).click();
  await expect(modal).toBeHidden();
  // Reanudada: la cabeza vuelve a moverse.
  await expect.poll(async () => headCell(page), { timeout: 10_000 }).not.toBe(frozen);
});

test('serpiente: test-win — tablero lleno, récord guardado y reintentar reinicia', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page, 'test-win');

  // Un tick come la última celda: victoria sin input (el loop avanza solo).
  const modal = page.getByLabel('modal-fin-serpiente', { exact: true });
  await expect(modal).toBeVisible({ timeout: 20_000 });
  await expect(modal.getByText('¡Tablero lleno!')).toBeVisible();

  // El récord quedó persistido (won: true) — save() es async: se sondea.
  await expect
    .poll(
      async () => {
        const recordsRaw = await page.evaluate(() => localStorage.getItem('game_records'));
        const records = recordsRaw ? (JSON.parse(recordsRaw) as Array<{ gameId: string; won: boolean }>) : [];
        return records.filter((r) => r.gameId === 'serpiente' && r.won).length;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(1);

  // Reintentar: partida nueva limpia (conserva el seed E2E: arranca en 3990
  // y vuelve a ganar solo — lo que se candea es el reinicio en sí).
  await modal.getByLabel('reintentar-serpiente', { exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByLabel('tablero-serpiente', { exact: true })).toBeVisible();
  await expect(page.getByLabel('serpiente-cabeza', { exact: true })).toBeVisible();
});

test('serpiente: test-lose — choca contra el muro y pierde', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page, 'test-lose');

  // Muerte en el primer tick + overlay diferido (~750 ms).
  const modal = page.getByLabel('modal-fin-serpiente', { exact: true });
  await expect(modal).toBeVisible({ timeout: 20_000 });
  await expect(modal.getByText('Fin del juego')).toBeVisible();

  await expect
    .poll(
      async () => {
        const recordsRaw = await page.evaluate(() => localStorage.getItem('game_records'));
        const records = recordsRaw ? (JSON.parse(recordsRaw) as Array<{ gameId: string; won: boolean }>) : [];
        return records.filter((r) => r.gameId === 'serpiente' && !r.won).length;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(1);
});

test('serpiente: test-crecer — la primera comida suma 10', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page, 'test-crecer');

  await expect
    .poll(async () => score(page), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(10);
});

test('serpiente: Home → jugar → salir', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.getByLabel('Jugar Serpiente').click();
  await expect(page.getByLabel('tablero-serpiente', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('salir-serpiente', { exact: true }).click();
  await expect(page.getByText('Tasty Games')).toBeVisible();
});

test('serpiente: ajustes visibles en PC, auto-pausa y el borde persiste (D1/D3)', async ({ page }) => {
  test.setTimeout(30_000);
  await openGame(page);

  await page.getByLabel('serpiente-ajustes', { exact: true }).click();
  const modal = page.getByLabel('modal-ajustes-serpiente', { exact: true });
  await expect(modal).toBeVisible();
  // D3: abrir ajustes pausa la partida (cabeza congelada).
  const frozen = await headCell(page);
  await page.waitForTimeout(1200);
  expect(await headCell(page)).toBe(frozen);
  await expect(modal.getByLabel('serpiente-wrap', { exact: true })).toBeVisible();
  // Sin emulación táctil NO existen las opciones de control (solo wrap).
  await expect(modal.getByLabel('serpiente-modo-gestos', { exact: true })).toHaveCount(0);
  await page.getByLabel('serpiente-wrap', { exact: true }).click();
  await page.getByLabel('cerrar-ajustes-serpiente', { exact: true }).click();
  await expect(modal).toBeHidden();
  // D3: la pausa la puso el modal → se reanuda sola al cerrar.
  await expect.poll(async () => headCell(page), { timeout: 10_000 }).not.toBe(frozen);

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = localStorage.getItem('preferences');
        return raw ? (JSON.parse(raw) as Record<string, string>) : {};
      }),
    )
    .toEqual(expect.objectContaining({ 'serpiente.wrap': '0' }));
});

test.describe('serpiente táctil (emulación móvil, puntero coarse)', () => {
  // Emulación de móvil (sin defaultBrowserType: no es válido a nivel describe)
  test.use({ viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true });

  /**
   * Swipe REAL (CDP dispatchTouchEvent) iniciado sobre el HUD — fuera del
   * tablero — para candar que el gesto vale en cualquier parte de la pantalla
   * (modo gestos, emite al cruzar el umbral sin esperar el lift).
   */
  test('serpiente táctil: swipe sobre el HUD (fuera del tablero) gira hacia abajo', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await openGame(page);

    const hud = page.getByLabel('hud-serpiente', { exact: true });
    await expect(hud).toBeVisible();
    const hudBox = await hud.boundingBox();

    const startX = hudBox!.x + hudBox!.width / 2;
    const startY = hudBox!.y + hudBox!.height / 2;
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: startX, y: startY }],
    });
    for (const step of [8, 16, 24, 36, 48]) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: startX, y: startY + step }],
      });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    // Latencia CDP+Gesto: esperar a que el giro se procese y dar un par de
    // ticks; luego la fila debe CRECER de forma sostenida (la reversa está
    // prohibida: el giro válido desde `right` es vertical).
    await page.waitForTimeout(600);
    const mid = await headCell(page);
    await expect
      .poll(async () => rowOf(await headCell(page)), { timeout: 10_000 })
      .toBeGreaterThan(rowOf(mid));
  });

  /** Los ajustes (borde, control, anillo) solo existen en táctil y persisten. */
  test('serpiente táctil: ajustes de borde y control persisten', async ({ page }) => {
    test.setTimeout(60_000);
    await openGame(page);

    await page.getByLabel('serpiente-ajustes', { exact: true }).click();
    const modal = page.getByLabel('modal-ajustes-serpiente', { exact: true });
    await expect(modal).toBeVisible();

    await page.getByLabel('serpiente-wrap', { exact: true }).click();
    await page.getByLabel('serpiente-modo-flotante', { exact: true }).click();
    await page.getByLabel('serpiente-anillo-feedback', { exact: true }).click();
    await page.getByLabel('cerrar-ajustes-serpiente', { exact: true }).click();
    await expect(modal).toBeHidden();

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('preferences');
          return raw ? (JSON.parse(raw) as Record<string, string>) : {};
        }),
      )
      .toEqual(
        expect.objectContaining({
          'serpiente.wrap': '0',
          'serpiente.controlMode': 'flotante',
          'serpiente.floatingRing': '1',
        }),
      );
  });
});
