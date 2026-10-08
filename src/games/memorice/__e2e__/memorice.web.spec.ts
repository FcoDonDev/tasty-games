import { expect, test, type Page } from '@playwright/test';

const CARD_COUNT = 16; // 8 pares (fácil)

/** Voltea una carta y espera a que muestre su símbolo. Devuelve el símbolo. */
async function flip(page: Page, position: number): Promise<string> {
  const card = page.getByLabel(`carta-${position}`, { exact: true });
  await card.click();
  await expect(card).not.toHaveText('?', { timeout: 5000 });
  return (await card.textContent())?.trim() ?? '';
}

/**
 * Home → tap en la card → modal de dificultad (SIEMPRE, D3) → elegir nivel.
 * Devuelve al juego ya iniciado con el nivel elegido.
 */
async function enterGame(page: Page, difficulty: 'facil' | 'medio' | 'dificil'): Promise<void> {
  await page.getByLabel('Jugar Memorice').click();
  const difficultyModal = page.getByLabel('modal-dificultad-home', { exact: true });
  await expect(difficultyModal).toBeVisible();
  await difficultyModal.getByLabel(`elegir-dificultad-home-${difficulty}`, { exact: true }).click();
  await expect(page.getByText(/Intentos:/)).toBeVisible();
}

test('memorice: partida completa web → modal de victoria + récord persistido', async ({
  page,
}) => {
  test.setTimeout(240_000);

  // 1. Home → tarjeta del juego → modal SIEMPRE (elegir fácil)
  await page.goto('/');
  await expect(page.getByText('Tasty Games')).toBeVisible();
  await enterGame(page, 'facil');

  // 2. Partida: algoritmo de memorice determinista
  //    - unknown: posiciones boca abajo aún sin símbolo conocido
  //    - known: símbolo ya visto -> posición donde se vio
  const unknown = new Set<number>(Array.from({ length: CARD_COUNT }, (_, i) => i + 1));
  const known = new Map<string, number>();

  const winModal = page.getByLabel('modal-victoria-memorice');

  while (true) {
    // El modal aparece un tick después del último match: esperar con timeout
    // en vez de chequear instantáneamente (evita race con el render de React).
    const won = await winModal
      .waitFor({ state: 'visible', timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    if (won) break;

    if (unknown.size === 0) {
      throw new Error('quedaron cartas sin emparejar: el algoritmo perdió el rastro de un par');
    }
    const a = Math.min(...unknown);
    const symbolA = await flip(page, a);
    unknown.delete(a);

    const partner = known.get(symbolA);
    if (partner !== undefined) {
      // el par de symbolA ya se vio antes: match directo
      await flip(page, partner);
      unknown.delete(partner);
      known.delete(symbolA);
      continue;
    }
    known.set(symbolA, a);

    const b = Math.min(...unknown);
    const symbolB = await flip(page, b);
    unknown.delete(b);

    if (symbolB === symbolA) {
      // match directo entre las dos cartas recién volteadas
      known.delete(symbolA);
    } else if (known.has(symbolB)) {
      // symbolB ya se había visto antes: b y known[symbolB] son el mismo par.
      // El mismatch [a,b] sigue pendiente en el store: hay que esperar el
      // flip-back (un click ahora sería diferido por Playwright hasta que el
      // botón se habilite, y llegaría como flip primero, desincronizando el
      // modelo). Luego se voltea b y su pareja para cerrar el match.
      await expect(page.getByLabel(`carta-${a}`, { exact: true })).toHaveText('?', { timeout: 5000 });
      await expect(page.getByLabel(`carta-${b}`, { exact: true })).toHaveText('?', { timeout: 5000 });
      await flip(page, b);
      await flip(page, known.get(symbolB)!);
      known.delete(symbolB);
    } else {
      known.set(symbolB, b);
      // par fallado: esperar el flip-back antes de seguir
      await expect(page.getByLabel(`carta-${a}`, { exact: true })).toHaveText('?', { timeout: 5000 });
      await expect(page.getByLabel(`carta-${b}`, { exact: true })).toHaveText('?', { timeout: 5000 });
    }
  }

  // 3. Modal de victoria
  const modal = page.getByLabel('modal-victoria-memorice');
  await expect(modal).toBeVisible();
  await expect(modal.getByText(/Ganaste/)).toBeVisible();
  await expect(modal.getByText(/\d+ pts · \d+ intentos/)).toBeVisible();

  // 4. Récord persistido en localStorage
  const recordsRaw = await page.evaluate(() => localStorage.getItem('game_records'));
  expect(recordsRaw).not.toBeNull();
  const records = JSON.parse(recordsRaw!) as Array<{
    gameId: string;
    won: boolean;
    score: number;
  }>;
  const memoriceRecord = records.find((r) => r.gameId === 'memorice' && r.won);
  expect(memoriceRecord).toBeDefined();
  expect(memoriceRecord!.score).toBeGreaterThan(0);

  // 5. Bug reportado (PLAN): salir → Home → re-entrar SIN recarga (SPA) NO
  //    debe mostrar el modal de victoria "fantasma" (el store sobrevive al
  //    desmonte; el efecto de victoria corría con valores stale antes del
  //    reset del mount).
  await page.getByLabel('salir-al-home-memorice', { exact: true }).click();
  await expect(page.getByText('Tasty Games')).toBeVisible();
  await enterGame(page, 'facil');
  await expect(page.getByLabel('modal-victoria-memorice')).not.toBeVisible();
  await expect(page.getByText('Intentos: 0')).toBeVisible();

  // 6. Tras recargar (seguimos en la ruta del juego), el récord aparece en el
  //    ScoreBoard compacto del header
  await page.reload();
  await expect(page.getByLabel('record-memorice')).toHaveText(/\d+ pts/, { timeout: 15_000 });
});

test('memorice: salir vuelve al Home', async ({ page }) => {
  await page.goto('/');
  await enterGame(page, 'facil');
  await page.getByLabel('salir-memorice').click();
  await expect(page.getByText('Tasty Games')).toBeVisible();
});

test('memorice: el modal de dificultad aparece SIEMPRE (D3) y "Ahora no" queda en el Home', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Jugar Memorice').click();
  await expect(page.getByLabel('modal-dificultad-home', { exact: true })).toBeVisible();

  // Descartar: se queda en el Home (sin persistir nada, D4/D6)
  await page.getByLabel('cerrar-dificultad-home-memorice', { exact: true }).click();
  await expect(page.getByText('Tasty Games')).toBeVisible();
  const prefsRaw = await page.evaluate(() => localStorage.getItem('preferences'));
  expect(prefsRaw ? JSON.parse(prefsRaw)['memorice.dificultad'] : undefined).toBeUndefined();

  // Volver a tocar la card: el modal reaparece (no es solo el primer inicio)
  await page.getByLabel('Jugar Memorice').click();
  await expect(page.getByLabel('modal-dificultad-home', { exact: true })).toBeVisible();

  // Elegir difícil: 24 cartas
  await page
    .getByLabel('modal-dificultad-home', { exact: true })
    .getByLabel('elegir-dificultad-home-dificil', { exact: true })
    .click();
  await expect(page.getByText(/Intentos:/)).toBeVisible();
  await expect(page.getByLabel(/^carta-\d+$/)).toHaveCount(24);
});

test('memorice: deep-link respeta la dificultad del nivel (sin pasar por el Home)', async ({
  page,
}) => {
  await page.goto('/juego/memorice?difficulty=medio');
  await expect(page.getByText(/Intentos:/)).toBeVisible();
  await expect(page.getByLabel(/^carta-\d+$/)).toHaveCount(20);

  await page.goto('/juego/memorice');
  await expect(page.getByText(/Intentos:/)).toBeVisible();
  // sin param → default fácil (D5)
  await expect(page.getByLabel(/^carta-\d+$/)).toHaveCount(16);
});
