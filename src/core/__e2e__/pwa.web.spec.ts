import { expect, test } from '@playwright/test';

/**
 * Candea lo mínimo para que la web sea PWA instalable (PLAN-PWA.md):
 * manifest enlazado en el head, metas Apple para Add to Home Screen en iOS
 * y manifest válido con iconos que respondan. No automatiza la instalación
 * (A2HS es manual); eso queda para verificación en dispositivo.
 */
test.describe('PWA instalable', () => {
  test('el head enlaza el manifest y las metas Apple A2HS', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('head link[rel="manifest"][href="/manifest.json"]')).toHaveCount(1);
    await expect(page.locator('head link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(page.locator('head meta[name="apple-mobile-web-app-capable"][content="yes"]')).toHaveCount(1);
    await expect(page.locator('head meta[name="theme-color"]')).toHaveCount(1);
  });

  test('el manifest es válido y sus iconos responden', async ({ page }) => {
    await page.goto('/');
    const href = await page.locator('head link[rel="manifest"]').getAttribute('href');
    expect(href).toBe('/manifest.json');

    const manifestResponse = await page.request.get(href as string);
    expect(manifestResponse.status()).toBe(200);
    const manifest = (await manifestResponse.json()) as {
      name: string;
      short_name: string;
      display: string;
      start_url: string;
      theme_color: string;
      background_color: string;
      icons: { src: string; sizes: string; type: string }[];
    };

    expect(manifest.name).toBe('Tasty Games');
    expect(manifest.short_name).toBe('Tasty Games');
    // D1 (PLAN-PWA.md): standalone = lo más "app normal" en Android e iOS.
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('.');
    expect(manifest.theme_color).toBe('#0F172A');
    expect(manifest.background_color).toBe('#0F172A');

    // Chrome exige al menos un icono 192 y uno 512 para la instalación.
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    // maskable: entry 512 extra para el adaptive de Android.
    expect(manifest.icons.some((icon) => icon.src.includes('maskable'))).toBe(true);

    for (const icon of manifest.icons) {
      const iconResponse = await page.request.get(`/${icon.src}`);
      expect(iconResponse.status(), icon.src).toBe(200);
      expect(iconResponse.headers()['content-type'], icon.src).toBe('image/png');
    }
  });

  test('apple-touch-icon responde (iOS Add to Home Screen)', async ({ page }) => {
    const response = await page.request.get('/apple-touch-icon.png');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');
  });
});
