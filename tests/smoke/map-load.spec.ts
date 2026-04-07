import { expect, test } from '@playwright/test';

test('loads map canvases and gui panel', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto('/');

  await expect(page.locator('#map-canvas')).toBeVisible();
  await expect(page.locator('#map-svg')).toBeVisible();
  await expect(page.locator('#nostr-overlay-root')).toBeVisible();
  await expect(page.locator('#nostr-overlay-root input[name="npub"]')).toBeVisible();
  await expect(page.locator('.dg.main').first()).toBeVisible();

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

  const generateButton = page.locator('.dg .cr.function').filter({ hasText: 'generate' }).first();
  await expect(generateButton).toBeVisible();
  await generateButton.click();
  await page.waitForTimeout(1500);

  const filteredConsoleErrors = consoleErrors.filter((msg) => !msg.toLowerCase().includes('favicon'));
  expect(pageErrors).toEqual([]);
  expect(filteredConsoleErrors).toEqual([]);
});

test('exports PNG, SVG and STL downloads', async ({ page }) => {
  await page.goto('/');

  const generateButton = page.locator('.dg .cr.function').filter({ hasText: 'generate' }).first();
  await generateButton.click();
  await page.waitForTimeout(5000);

  const downloadFolder = page.locator('.dg .title').filter({ hasText: 'Download' }).first();
  await downloadFolder.click();

  const pngButton = page.locator('.dg .cr.function').filter({ hasText: 'PNG' }).first();
  const svgButton = page.locator('.dg .cr.function').filter({ hasText: 'SVG' }).first();
  const stlButton = page.locator('.dg .cr.function').filter({ hasText: 'STL' }).first();

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
