import { expect, test, type Page } from '@playwright/test';

const CARD_COUNT = 16; // 8 pares

/** Voltea una carta y espera a que muestre su símbolo. Devuelve el símbolo. */
async function flip(page: Page, position: number): Promise<string> {
  const card = page.getByLabel(`carta-${position}`, { exact: true });
  await card.click();
  await expect(card).not.toHaveText('?', { timeout: 5000 });
  return (await card.textContent())?.trim() ?? '';
}

test('memorice: partida completa web → modal de victoria + récord persistido', async ({
  page,
}) => {
  test.setTimeout(240_000);

  // 1. Home → tarjeta del juego
  await page.goto('/');
  await expect(page.getByText('Tasty Games')).toBeVisible();
  await page.getByLabel('Jugar Memorice').click();
  await expect(page.getByText(/Intentos:/)).toBeVisible();

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

  // 5. Tras recargar (seguimos en la ruta del juego), el récord aparece en el ScoreBoard compacto del header
  await page.reload();
  await expect(page.getByLabel('record-memorice')).toHaveText(/\d+ pts/, { timeout: 15_000 });
});

test('memorice: salir vuelve al Home', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Jugar Memorice').click();
  await expect(page.getByText(/Intentos:/)).toBeVisible();
  await page.getByLabel('salir-memorice').click();
  await expect(page.getByText('Tasty Games')).toBeVisible();
});
