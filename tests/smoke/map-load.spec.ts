import { expect, test, type Page } from '@playwright/test';

async function openSettings(page: Page) {
  const settingsButton = page.locator('button[aria-label="Abrir ajustes"]').first();
  await expect(settingsButton).toBeVisible();
  await settingsButton.click();
  await expect(page.getByRole('dialog', { name: 'Ajustes' })).toBeVisible();
}

test('loads map canvases and gui panel', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto('/');

  await expect(page.locator('#map-canvas')).toBeVisible();
  await expect(page.locator('#map-svg')).toBeVisible();
  await expect(page.locator('#nostr-overlay-root')).toBeVisible();
  await expect(page.locator('#nostr-overlay-root input[name="npub"]')).toBeVisible();
  await expect(page.locator('button[aria-label="Abrir ajustes"]').first()).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test('runs generate action without fatal runtime errors', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto('/');

  await openSettings(page);

  const generateButton = page.locator('.nostr-settings-host .dg .cr.function').filter({ hasText: /generate/i }).first();
  await expect(generateButton).toBeVisible();
  await generateButton.click();
  await page.waitForTimeout(1500);

  const filteredConsoleErrors = consoleErrors.filter((msg) => !msg.toLowerCase().includes('favicon'));
  expect(pageErrors).toEqual([]);
  expect(filteredConsoleErrors).toEqual([]);
});

test('exports PNG, SVG and STL downloads', async ({ page }) => {
  await page.goto('/');

  await openSettings(page);

  const generateButton = page.locator('.nostr-settings-host .dg .cr.function').filter({ hasText: /generate/i }).first();
  await generateButton.click();
  await page.waitForTimeout(5000);

  const downloadFolder = page.locator('.nostr-settings-host .dg .title').filter({ hasText: 'Download' }).first();
  await downloadFolder.click();

  const pngButton = page.locator('.nostr-settings-host .dg .cr.function').filter({ hasText: 'PNG' }).first();
  const svgButton = page.locator('.nostr-settings-host .dg .cr.function').filter({ hasText: 'SVG' }).first();
  const stlButton = page.locator('.nostr-settings-host .dg .cr.function').filter({ hasText: 'STL' }).first();

  const [pngDownload] = await Promise.all([
    page.waitForEvent('download'),
    pngButton.click(),
  ]);
  expect(pngDownload.suggestedFilename().toLowerCase()).toContain('map.png');

  const [svgDownload] = await Promise.all([
    page.waitForEvent('download'),
    svgButton.click(),
  ]);
  expect(svgDownload.suggestedFilename().toLowerCase()).toContain('map.svg');

  const [stlDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 180_000 }),
    stlButton.click(),
  ]);
  expect(stlDownload.suggestedFilename().toLowerCase()).toContain('model.zip');
});

test('npub submit shows progressive status without runtime errors', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto('/');

  await page.locator('#nostr-overlay-root input[name="npub"]').fill('npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
  await page.locator('#nostr-overlay-root button[type="submit"]').click();

  const status = page.locator('.nostr-status');
  await expect(status).toContainText(/Cargando|Asignando|Buscando|Error|\d+\s*\/\s*\d+/);

  expect(pageErrors).toEqual([]);
});
