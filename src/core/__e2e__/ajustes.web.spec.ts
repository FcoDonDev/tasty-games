import { expect, test } from '@playwright/test';

test('ajustes: dark mode persiste tras recargar y borrar récords limpia el storage', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await expect(page.getByText('Tasty Games')).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('abrir-ajustes', { exact: true }).click();
  await expect(page.getByText('Ajustes')).toBeVisible({ timeout: 15_000 });

  // Dark mode on
  const darkSwitch = page.getByLabel('set-dark-mode', { exact: true });
  await expect(darkSwitch).toBeVisible();
  await darkSwitch.click();

  // Récord pre-cargado que debe sobrevivir hasta el borrado
  await page.evaluate(() =>
    localStorage.setItem(
      'game_records',
      JSON.stringify([
        { gameId: 'memorice', won: true, score: 88, durationMs: 1000, finishedAt: '2026-01-01T00:00:00.000Z' },
      ]),
    ),
  );

  // Borrar récords con confirmación
  await page.getByLabel('abrir-borrar-records', { exact: true }).click();
  const modal = page.getByLabel('modal-borrar-records', { exact: true });
  await expect(modal).toBeVisible();

  // Cancelar no borra
  await modal.getByLabel('cancelar-borrar-records', { exact: true }).click();
  await expect(modal).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('game_records'))).not.toBeNull();

  // Confirmar borra
  await page.getByLabel('abrir-borrar-records', { exact: true }).click();
  await modal.getByLabel('confirmar-borrar-records', { exact: true }).click();
  await expect(page.getByText('Récords eliminados')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('game_records'))).toBeNull();

  // Dark mode persiste tras recargar
  await page.reload();
  await expect(page.getByText('Ajustes')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('set-dark-mode', { exact: true })).toBeChecked();

  // Volver al Home (el reload resetea el historial: back no aplica, se navega directo)
  await page.goto('/');
  await expect(page.getByText('Tasty Games')).toBeVisible({ timeout: 15_000 });
});
