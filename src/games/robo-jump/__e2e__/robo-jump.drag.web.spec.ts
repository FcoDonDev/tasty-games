import { expect, test, type Page } from '@playwright/test';

/**
 * E2E web del drag táctil de Robo Jump (fix drag táctil): el drag es
 * 1:1 relativo (D2) y debe seguir al dedo en AMBOS sentidos, incluso
 * cuando el publish de score (≤5 Hz) re-crea el gesto a mitad del
 * arrastre. Antes del fix, el closure fresco del gesto re-creado nacía
 * con lastX=0 y el primer delta = posición absoluta del dedo (siempre
 * ≥ 0 → el Robo saltaba a un solo lado, amplificado).
 *
 * Escenario determinista `test-win`: torre central de plataformas verdes
 * (auto-rebote sin input). Los drags son cortos (~±36 px ≈ ±39 u) para
 * que el Robo NO salga de la torre (plataforma 64 u en x=180): salir de
 * ella mata por caída y invalidaría el segundo tramo.
 *
 * Swipe real vía CDP `Input.dispatchTouchEvent` (GOTCHAS: RNGH procesa
 * el Pan normalmente con touchStart + touchMove escalonados + touchEnd;
 * coordenadas en CSS px del viewport, como `boundingBox()`).
 */

async function openGame(page: Page, seed?: string): Promise<void> {
  const url = seed ? `/juego/robo-jump?seed=${seed}` : '/juego/robo-jump';
  await page.goto(url);
  await expect(page.getByLabel('robo-jump-escena', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('robo-jump-robot', { exact: true })).toBeVisible();
}

/**
 * Drag táctil REAL: touchStart + touchMove escalonados (~30 ms/paso, GOTCHAS
 * de gestos) + touchEnd. `dx` en CSS px del viewport; drag sostenido >200 ms
 * para cruzar al menos un publish de score a mitad del gesto.
 */
async function touchDrag(page: Page, startX: number, startY: number, dx: number, steps = 12): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: startX, y: startY }],
  });
  for (let i = 1; i <= steps; i++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: startX + (dx * i) / steps, y: startY }],
    });
    await page.waitForTimeout(30);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test.describe('robo-jump drag táctil (emulación móvil)', () => {
  test.use({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });

  test('drag táctil sigue al dedo en ambos sentidos (sin salto a un solo lado)', async ({ page }) => {
    test.setTimeout(60_000);
    await openGame(page, 'test-win');

    const robo = page.getByLabel('robo-jump-robot', { exact: true });
    const escena = page.getByLabel('robo-jump-escena', { exact: true });
    const escenaBox = await escena.boundingBox();
    expect(escenaBox).not.toBeNull();

    // El drag nace donde apoya el dedo (pad flotante): centro de la escena,
    // mitad inferior (lejos del header). El Robo rebota en la torre central;
    // el drag NO debe empujarlo a un lado fijo.
    const startX = escenaBox!.x + escenaBox!.width / 2;
    const startY = escenaBox!.y + escenaBox!.height * 0.7;

    // Drag a la IZQUIERDA (~36 px, ~360 ms > 2 publishes de score): antes del
    // fix, el robo terminaba empujado a la DERECHA (delta absoluto ≥ 0).
    const before = await robo.boundingBox();
    await touchDrag(page, startX, startY, -36);
    await page.waitForTimeout(200);
    const afterLeft = await robo.boundingBox();
    // 1:1 visual: ~36 px de dedo ≈ ~36 px de robo; el pan consume ~10 px de
    // activación → ~26 px efectivos. Margen holgado para jitter del rebote.
    expect(before!.x - afterLeft!.x).toBeGreaterThanOrEqual(15);

    // Drag a la DERECHA de vuelta (mismo origen): bidireccionalidad real.
    await touchDrag(page, startX, startY, 36);
    await page.waitForTimeout(200);
    const afterRight = await robo.boundingBox();
    expect(afterRight!.x - afterLeft!.x).toBeGreaterThanOrEqual(15);
    // Sin desvío neto grande: el robo vuelve cerca del punto de partida.
    expect(Math.abs(afterRight!.x - before!.x)).toBeLessThanOrEqual(45);

    // El robo sigue vivo y visible (los drags lo mantuvieron sobre la torre).
    await expect(robo).toBeVisible();
    await expect(page.getByLabel('overlay-fin', { exact: true })).toBeHidden({ timeout: 3_000 });
  });
});
