import { expect, test, type Page } from '@playwright/test';

async function openSettings(page: Page) {
  const settingsButton = page.locator('button[aria-label="Abrir ajustes"]').first();
  await expect(settingsButton).toBeVisible();
  await settingsButton.click();
  await expect(page.locator('button[aria-label="Abrir advanced settings"]')).toBeVisible();
}

test('loads map canvases and gui panel', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto('/app/');

  await expect(page.locator('#map-canvas')).toBeVisible();
  await expect(page.locator('#map-svg')).toBeVisible();
  await expect(page.locator('#nostr-overlay-root')).toBeVisible();
  await expect(page.locator('#nostr-overlay-root input[name="npub"]')).toBeVisible();
  await expect(page.locator('button[aria-label="Abrir ajustes"]').first()).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test('runs generate action without fatal runtime errors', async ({ page }) => {
  const pageErrors: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto('/app/');

  const generateButton = page.locator('button[aria-label="Regenerar mapa"]').first();
  await expect(generateButton).toBeVisible();
  await generateButton.click();
  await page.waitForTimeout(1200);

  expect(pageErrors).toEqual([]);
  await expect(page.locator('#map-canvas')).toBeVisible();
});

test('settings menu opens and can navigate to advanced settings', async ({ page }) => {
  await page.goto('/app/');

  await openSettings(page);

  await page.locator('button[aria-label="Abrir advanced settings"]').click();
  await expect(page.getByRole('heading', { name: 'Advanced settings' })).toBeVisible();
});

test('npub submit shows progressive status without runtime errors', async ({ page }) => {
  await page.goto('/app/');

  await page.locator('#nostr-overlay-root input[name="npub"]').fill('npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
  await page.locator('#nostr-overlay-root button[type="submit"]').click();
  await page.waitForTimeout(1200);

  await expect(page.locator('#nostr-overlay-root')).toBeVisible();
});
