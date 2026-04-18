import { expect, test } from '@playwright/test';

test('docs home carga el centro de ayuda', async ({ page }) => {
  await page.goto('/docs/');

  await expect(page.getByText(/Centro de ayuda para entender el proyecto/i)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Empezar ahora' })).toBeVisible();
});

test('docs navega a la guia de acceso y login', async ({ page }) => {
  await page.goto('/docs/');

  await page.getByRole('link', { name: 'Acceso y login' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Acceso y login' })).toBeVisible();
});
