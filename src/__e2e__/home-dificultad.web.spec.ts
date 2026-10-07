import { expect, test, type Page } from '@playwright/test';

/**
 * E2E del modal de dificultad del Home (PLAN-ACCESIBILIDAD T5, D-T5-1..4):
 * 1ª visita sin pref → modal; elegir → persistir + navegar con el param
 * (la run arranca ya con esa dificultad); cancelar → persiste el default y
 * se queda en el Home; 2ª visita → navegación directa sin modal.
 */

async function pref(page: Page, key: string): Promise<string | undefined> {
  const raw = await page.evaluate(() => localStorage.getItem('preferences'));
  return raw ? (JSON.parse(raw) as Record<string, string>)[key] : undefined;
}

test('home: primer inicio de wakwak muestra el modal, elegir Fácil persiste y navega', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.getByLabel('Jugar Wak Wak').click();

  const modal = page.getByLabel('modal-dificultad-home', { exact: true });
  await expect(modal).toBeVisible({ timeout: 5_000 });
  await expect(page.getByLabel('elegir-dificultad-home-facil', { exact: true })).toBeVisible();
  await expect(page.getByLabel('elegir-dificultad-home-normal', { exact: true })).toBeVisible();

  await page.getByLabel('elegir-dificultad-home-facil', { exact: true }).click();

  // navegó con el param: la run ya arrancó fácil (sin race del load async)
  await expect(page.getByLabel('wakwak-modo', { exact: true })).toHaveText('FÁCIL', { timeout: 15_000 });
  await expect
    .poll(async () => pref(page, 'wakwak.modo'))
    .toBe('facil');
});

test('home: cancelar el modal persiste el default (medio/normal) y NO navega', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.getByLabel('Jugar Wak Wak').click();
  await page.getByLabel('cerrar-dificultad-home-wakwak', { exact: true }).click();

  // se queda en el Home y la elección por default queda persistida
  await expect(page.getByText('Tasty Games')).toBeVisible();
  await expect(page.getByLabel('modal-dificultad-home', { exact: true })).toBeHidden();
  await expect
    .poll(async () => pref(page, 'wakwak.modo'))
    .toBe('normal');
});

test('home: con preferencia ya elegida la navegación es directa (sin modal)', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  // pref preexistente (D-T5-1 navega directo pasando el param): el gate se
  // lee en el TAP — no hace falta recargar
  await page.evaluate(() => {
    localStorage.setItem('preferences', JSON.stringify({ 'wakwak.modo': 'facil' }));
  });
  await page.getByLabel('Jugar Wak Wak').click();

  await expect(page.getByLabel('modal-dificultad-home', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('wakwak-modo', { exact: true })).toHaveText('FÁCIL', { timeout: 15_000 });
});

test('home: serpiente muestra 3 opciones de dificultad', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.getByLabel('Jugar Serpiente').click();

  const modal = page.getByLabel('modal-dificultad-home', { exact: true });
  await expect(modal).toBeVisible({ timeout: 5_000 });
  for (const value of ['facil', 'medio', 'dificil']) {
    await expect(page.getByLabel(`elegir-dificultad-home-${value}`, { exact: true })).toBeVisible();
  }

  // elegir difícil: persiste y navega con el param
  await page.getByLabel('elegir-dificultad-home-dificil', { exact: true }).click();
  await expect(page.getByLabel('tablero-serpiente', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => pref(page, 'serpiente.dificultad'))
    .toBe('dificil');
});
