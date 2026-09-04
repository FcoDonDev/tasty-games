import { expect, test } from '@playwright/test';

test('ayuda in-app: accesible desde el header del juego y desde el contenedor', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/juego/memorice');
  await expect(page.getByLabel('carta-1', { exact: true })).toBeVisible({ timeout: 15_000 });

  const modal = page.getByLabel('modal-ayuda-memorice', { exact: true });

  // Vía 1: botón ? del header del juego
  await page.getByLabel('ayuda-memorice', { exact: true }).click();
  await expect(modal).toBeVisible();
  await expect(modal.getByText(/Encuentra los 8 pares/)).toBeVisible();
  await modal.getByLabel('cerrar-ayuda-memorice', { exact: true }).click();
  await expect(modal).toBeHidden();

  // Vía 2: botón ? de la barra superior del contenedor (mismo modal)
  await page.getByLabel('ayuda-contenedor-memorice', { exact: true }).click();
  await expect(modal).toBeVisible();
  await modal.getByLabel('cerrar-ayuda-memorice', { exact: true }).click();
  await expect(modal).toBeHidden();
});

test('reiniciar partida con confirmación (cancelar conservar / confirmar reiniciar)', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/juego/memorice');
  await expect(page.getByLabel('carta-1', { exact: true })).toBeVisible({ timeout: 15_000 });

  // Dos flips = 1 intento
  await page.getByLabel('carta-1', { exact: true }).click();
  await page.getByLabel('carta-2', { exact: true }).click();
  await expect(page.getByText('Intentos: 1')).toBeVisible();

  const modal = page.getByLabel('modal-reinicio-memorice', { exact: true });
  await page.getByLabel('reiniciar-memorice', { exact: true }).click();
  await expect(modal).toBeVisible();

  // Cancelar conserva la partida
  await modal.getByLabel('cancelar-reinicio-memorice', { exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByText('Intentos: 1')).toBeVisible();

  // Confirmar reinicia
  await page.getByLabel('reiniciar-memorice', { exact: true }).click();
  await modal.getByLabel('confirmar-reinicio-memorice', { exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByText('Intentos: 0')).toBeVisible();
});
