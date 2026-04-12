import { expect, test } from '@playwright/test';

test('landing muestra manifiesto y CTA principal', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: /Nostr City/i })).toBeVisible();
  const primaryCta = page.getByRole('link', { name: 'Entrar a la aplicacion' }).first();
  await expect(primaryCta).toBeVisible();
  await expect(primaryCta).toHaveAttribute('href', '/app/');
});

test('landing incluye seccion para usuarios nostr y filosofia no comercial', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Para quienes ya usan Nostr/i })).toBeVisible();
  await expect(page.getByText(/sin animo de lucro/i).first()).toBeVisible();
});
