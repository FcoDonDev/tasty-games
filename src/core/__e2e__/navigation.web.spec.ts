import { expect, test } from '@playwright/test';

/**
 * "Salir" debe funcionar aunque la pantalla se abra directamente (deep link
 * o recarga web): sin historial previo en el stack, el fallback lleva al home
 * (exitToHome en src/core/navigation.ts).
 */
test.describe('navegación back', () => {
  test('juego abierto por deep link: salir lleva al home', async ({ page }) => {
    await page.goto('/juego/memorice');
    await expect(page.getByLabel('salir-memorice', { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('salir-memorice', { exact: true }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('Tasty Games')).toBeVisible({ timeout: 15_000 });
  });

  test('juego inexistente por deep link: volver lleva al home', async ({ page }) => {
    await page.goto('/juego/no-existe');
    await expect(page.getByText('Juego no encontrado')).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Volver al inicio').click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('Tasty Games')).toBeVisible({ timeout: 15_000 });
  });

  test('navegación normal: salir vuelve al home sin recargar el stack', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Tasty Games')).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Jugar Memorice').click();
    await expect(page.getByLabel('salir-memorice', { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('salir-memorice', { exact: true }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('Tasty Games')).toBeVisible({ timeout: 15_000 });
  });
});
