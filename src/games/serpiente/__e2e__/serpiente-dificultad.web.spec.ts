import { expect, test, type Page } from '@playwright/test';

/**
 * E2E web de la dificultad de Serpiente (PLAN-ACCESIBILIDAD T2).
 * Dificultad pedida por URL (`?difficulty=`), solo en builds E2E — misma
 * puerta que el seed. Sin input de gesto: la entrada relevante es el teclado
 * (PC) y clicks sobre Ajustes, independientes del modo de control.
 */

async function openGame(page: Page, query?: string): Promise<void> {
  await page.goto(query ? `/juego/serpiente?${query}` : '/juego/serpiente');
  await expect(page.getByLabel('tablero-serpiente', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('serpiente-cabeza', { exact: true })).toBeVisible();
}

test('serpiente ?difficulty=facil: run con clave de récord propia (test-lose)', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page, 'seed=test-lose&difficulty=facil');

  // Muerte en el primer tick (paso de 180ms) + overlay diferido (~750 ms).
  const modal = page.getByLabel('modal-fin-serpiente', { exact: true });
  await expect(modal).toBeVisible({ timeout: 20_000 });
  // La dificultad de la run queda visible en el resumen final.
  await expect(modal.getByText(/· Fácil/)).toBeVisible();

  // D1: el récord se escribe en la clave de la dificultad, no en la base.
  await expect
    .poll(
      async () => {
        const recordsRaw = await page.evaluate(() => localStorage.getItem('game_records'));
        const records = recordsRaw ? (JSON.parse(recordsRaw) as Array<{ gameId: string }>) : [];
        return records.filter((r) => r.gameId === 'serpiente-facil').length;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(1);

  // D6: el header consulta la clave de la run activa (no la base).
  await expect(page.getByLabel('record-serpiente-facil', { exact: true })).toBeVisible();
  await expect.poll(
    async () => page.getByLabel('record-serpiente-facil', { exact: true }).textContent(),
    { timeout: 10_000 },
  ).toBe('0 pts');
  await expect(page.getByLabel('record-serpiente', { exact: true })).toHaveCount(0);
});

test('serpiente: selector de dificultad en Ajustes cambia la run y persiste', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page, 'seed=test-crecer');

  // Ajustes pausa la run; el selector muestra los tres niveles.
  await page.getByLabel('serpiente-ajustes', { exact: true }).click();
  const modal = page.getByLabel('modal-ajustes-serpiente', { exact: true });
  await expect(modal).toBeVisible();
  await expect(modal.getByLabel('serpiente-dificultad-facil', { exact: true })).toBeVisible();
  await expect(modal.getByLabel('serpiente-dificultad-medio', { exact: true })).toBeVisible();
  await expect(modal.getByLabel('serpiente-dificultad-dificil', { exact: true })).toBeVisible();
  // D5: el selector comunica que el cambio no es en vivo.
  await expect(modal.getByText(/se aplica al reiniciar/)).toBeVisible();

  await page.getByLabel('serpiente-dificultad-facil', { exact: true }).click();
  // D5: la run se reinicia con la nueva tabla (el HUD refleja la run nueva).
  await expect(page.getByLabel('hud-dificultad', { exact: true })).toHaveText('Fácil');

  // Cerrar ajustes: la partida reiniciada NO debe quedar pausada (la
  // auto-pausa del modal se canceló al reiniciar).
  await page.getByLabel('cerrar-ajustes-serpiente', { exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(page.getByLabel('modal-pausa-serpiente', { exact: true })).toHaveCount(0);

  // La preferencia persiste (default medio no se escribe).
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = localStorage.getItem('preferences');
        return raw ? (JSON.parse(raw) as Record<string, string>) : {};
      }),
    )
    .toEqual(expect.objectContaining({ 'serpiente.dificultad': 'facil' }));
});
