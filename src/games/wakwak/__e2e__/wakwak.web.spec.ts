import { expect, test, type Page } from '@playwright/test';

/**
 * E2E web de Wak Wak. Escenarios deterministas vía seeds sentinelas
 * (ADR 0006): test-win (5 baterías en línea), test-lose (drones convergen) y
 * test-power (súper junto al spawn).
 *
 * Input por plataforma (refleja la app): los specs "desktop" usan el teclado
 * (PC web: flechas + WASD); el spec táctil usa emulación de móvil
 * (puntero coarse) con swipes reales vía CDP — el modo gestos emite al
 * cruzar el umbral, en cualquier parte de la pantalla.
 */

type DirKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'w' | 'a' | 's' | 'd';

async function openGame(page: Page, seed?: string): Promise<void> {
  const url = seed ? `/juego/wakwak?seed=${seed}` : '/juego/wakwak';
  await page.goto(url);
  await expect(page.getByLabel('tablero-wakwak', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('wakwak-robot', { exact: true })).toBeVisible();
}

async function pressDir(page: Page, key: DirKey): Promise<void> {
  await page.keyboard.press(key);
}

async function score(page: Page): Promise<number> {
  return Number((await page.getByLabel('marcador-puntos', { exact: true }).textContent())?.replace(/\D/g, ''));
}

test('wakwak: teclado mueve al robot y recoge baterías', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page);

  await expect(page.getByLabel('wakwak-drone-0', { exact: true })).toBeVisible();
  await expect(page.getByText('0 pts')).toBeVisible();

  const before = await page.getByLabel('wakwak-robot', { exact: true }).boundingBox();
  await pressDir(page, 'ArrowLeft');
  await page.waitForTimeout(600);
  const after = await page.getByLabel('wakwak-robot', { exact: true }).boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(after!.x).toBeLessThan(before!.x); // se movió a la izquierda
  // baterías de la fila del spawn recogidas en el camino
  expect(await score(page)).toBeGreaterThan(0);
});

test('wakwak: WASD también mueve al robot', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page);

  const before = await page.getByLabel('wakwak-robot', { exact: true }).boundingBox();
  await pressDir(page, 'a');
  await page.waitForTimeout(600);
  const after = await page.getByLabel('wakwak-robot', { exact: true }).boundingBox();
  expect(after!.x).toBeLessThan(before!.x);
  expect(await score(page)).toBeGreaterThan(0);
});

test('wakwak: pausa congela la simulación y se reanuda', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page);

  await pressDir(page, 'ArrowLeft');
  await page.waitForTimeout(500); // ya recogió baterías
  await page.getByLabel('pausa-wakwak', { exact: true }).click();
  const modal = page.getByLabel('modal-pausa-wakwak', { exact: true });
  await expect(modal).toBeVisible();
  // leer el score UNA VEZ congelada la simulación (antes habría carrera)
  const scoreFrozen = await page.getByLabel('marcador-puntos', { exact: true }).textContent();
  expect(Number(scoreFrozen?.replace(/\D/g, ''))).toBeGreaterThan(0);
  await page.waitForTimeout(1500); // la simulación no avanza en pausa
  await expect(page.getByLabel('marcador-puntos', { exact: true })).toHaveText(scoreFrozen!);
  await modal.getByLabel('reanudar-wakwak', { exact: true }).click();
  await expect(modal).toBeHidden();
});

test('wakwak: test-win — victoria, récord guardado y reintentar reinicia', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page, 'test-win');

  // un solo press: el robot avanza y come las 5 baterías de la fila del spawn
  await pressDir(page, 'ArrowLeft');
  const modal = page.getByLabel('modal-fin-wakwak', { exact: true });
  await expect(modal).toBeVisible({ timeout: 20_000 });
  await expect(modal.getByText('¡Laberinto despejado!')).toBeVisible();

  // el récord quedó persistido (won: true) — save() es async: se sondea
  await expect
    .poll(async () => {
      const recordsRaw = await page.evaluate(() => localStorage.getItem('game_records'));
      const records = recordsRaw ? (JSON.parse(recordsRaw) as Array<{ gameId: string; won: boolean }>) : [];
      return records.filter((r) => r.gameId === 'wakwak' && r.won).length;
    }, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1);

  // reintentar: partida nueva limpia
  await modal.getByLabel('reintentar-wakwak', { exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByText('0 pts')).toBeVisible();
  await expect(page.getByLabel('tablero-wakwak', { exact: true })).toBeVisible();
});

test('wakwak: test-lose — los drones atrapan al robot y pierde', async ({ page }) => {
  test.setTimeout(90_000);
  await openGame(page, 'test-lose');

  // robot quieto: los 4 drones convergen (salida escalonada ~0.5-3.5s)
  const modal = page.getByLabel('modal-fin-wakwak', { exact: true });
  await expect(modal).toBeVisible({ timeout: 60_000 });
  await expect(modal.getByText('Sistemas comprometidos')).toBeVisible();

  await expect
    .poll(async () => {
      const recordsRaw = await page.evaluate(() => localStorage.getItem('game_records'));
      const records = recordsRaw ? (JSON.parse(recordsRaw) as Array<{ gameId: string; won: boolean }>) : [];
      return records.filter((r) => r.gameId === 'wakwak' && !r.won).length;
    }, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1);
});

test('wakwak: test-power — súper carga y drone recogido suman 290 pts', async ({ page }) => {
  test.setTimeout(90_000);
  await openGame(page, 'test-power');

  // 4 baterías (40) + súper (50) + drone en modo flee (200)
  await pressDir(page, 'ArrowLeft');
  const marcador = page.getByLabel('marcador-puntos', { exact: true });
  await expect
    .poll(async () => Number((await marcador.textContent())?.replace(/\D/g, '')), {
      timeout: 45_000, // margen por dilación de rAF bajo carga de la suite completa
    })
    .toBe(290);

  // con el power vencido, los drones terminan atrapando al robot
  const modal = page.getByLabel('modal-fin-wakwak', { exact: true });
  await expect(modal).toBeVisible({ timeout: 60_000 });
  await expect(modal.getByText('Sistemas comprometidos')).toBeVisible();
});

test('wakwak: Home → jugar → salir', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.getByLabel('Jugar Wak Wak').click();
  await expect(page.getByLabel('tablero-wakwak', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('salir-wakwak', { exact: true }).click();
  await expect(page.getByText('Tasty Games')).toBeVisible();
});

test.describe('wakwak táctil (emulación móvil, puntero coarse)', () => {
  // Emulación de móvil (sin defaultBrowserType: no es válido a nivel describe)
  test.use({ viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true });

  /**
   * Swipe REAL (CDP dispatchTouchEvent) iniciado sobre el HUD — fuera del
   * tablero — para candar que el gesto vale en cualquier parte de la pantalla
   * (modo gestos, emite al cruzar el umbral sin esperar el lift).
   */
  test('wakwak táctil: swipe sobre el HUD (fuera del tablero) mueve al robot', async ({ page }) => {
    test.setTimeout(60_000);
    await openGame(page);

    const marcador = page.getByLabel('marcador-puntos', { exact: true });
    await expect(marcador).toBeVisible();
    const marcadorBox = await marcador.boundingBox();
    const before = await page.getByLabel('wakwak-robot', { exact: true }).boundingBox();

    const startX = marcadorBox!.x + marcadorBox!.width / 2;
    const startY = marcadorBox!.y + marcadorBox!.height / 2;
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: startX, y: startY }],
    });
    for (const step of [8, 16, 24, 36, 48, 64]) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: startX - step, y: startY }],
      });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await page.waitForTimeout(600);
    const after = await page.getByLabel('wakwak-robot', { exact: true }).boundingBox();
    expect(after!.x).toBeLessThan(before!.x);
    expect(await score(page)).toBeGreaterThan(0);
  });

  /** El ajuste de control táctil solo existe en dispositivos táctiles. */
  test('wakwak táctil: modal de control muestra los dos modos y persiste', async ({ page }) => {
    test.setTimeout(60_000);
    await openGame(page);

    await page.getByLabel('wakwak-ajustes-control', { exact: true }).click();
    const modal = page.getByLabel('modal-control-wakwak', { exact: true });
    await expect(modal).toBeVisible();

    await page.getByLabel('wakwak-modo-flotante', { exact: true }).click();
    await page.getByLabel('wakwak-anillo-feedback', { exact: true }).click();
    await page.getByLabel('cerrar-control-wakwak', { exact: true }).click();
    await expect(modal).toBeHidden();

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('preferences');
          return raw ? (JSON.parse(raw) as Record<string, string>) : {};
        }),
      )
      .toEqual(expect.objectContaining({ 'wakwak.controlMode': 'flotante', 'wakwak.floatingRing': '1' }));
  });
});
