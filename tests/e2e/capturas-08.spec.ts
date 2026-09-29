/**
 * Capturas de la tarea 08: días libres de demora y almacenaje.
 */
import { test, expect } from '@playwright/test';

const PW = '123456';

async function entrar(page: import('@playwright/test').Page, email: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(PW);
  await page.locator('#login-submit').click();
  await expect(page.getByText('Emuladores · producción intacta')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
}

test('08 · cotización — plazos del contenedor (pricing, desktop)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(page, 'pricing@vermur.com');

  // Navigate: CRM → Bandeja Pricing → first quote
  await page.getByRole('button', { name: 'CRM', exact: true }).first().click();
  await page.getByRole('button', { name: 'Bandeja Pricing' }).click();
  await page.waitForTimeout(2000);

  // Click first visible quote
  const card = page.locator('.cursor-pointer').first();
  await card.click();
  await page.waitForTimeout(2000);

  // Go to Información tab
  const infoTab = page.getByRole('button', { name: 'Información' });
  if (await infoTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await infoTab.click();
    await page.waitForTimeout(500);
  }

  // Scroll to the Plazos section
  const plazosHeading = page.getByText('Plazos del contenedor');
  if (await plazosHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
    await plazosHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: 'sprint/reportes/img/08-cotizacion-plazos-desktop.png', fullPage: false });
});

test('08 · cotización — plazos del contenedor (angosto)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await entrar(page, 'pricing@vermur.com');

  await page.getByRole('button', { name: 'CRM', exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Bandeja Pricing' }).click();
  await page.waitForTimeout(2000);

  const card = page.locator('.cursor-pointer').first();
  await card.click();
  await page.waitForTimeout(2000);

  const infoTab = page.getByRole('button', { name: 'Información' });
  if (await infoTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await infoTab.click();
    await page.waitForTimeout(500);
  }

  // Scroll down to see Plazos
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);

  await page.screenshot({ path: 'sprint/reportes/img/08-cotizacion-plazos-angosto.png', fullPage: false });
});

test('08 · embarque — plazos calculados (operaciones, desktop)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(page, 'operaciones@vermur.com');

  // Go to Embarques
  await page.getByRole('button', { name: 'Embarques' }).click();
  await page.waitForTimeout(2000);

  // Open first shipment row
  const row = page.locator('tr').nth(1); // first data row after header
  if (await row.isVisible({ timeout: 3000 }).catch(() => false)) {
    await row.click();
  }
  await page.waitForTimeout(2000);

  // Scroll to the Plazos section in the embarque
  const plazosHeading = page.getByText('Plazos del contenedor');
  if (await plazosHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
    await plazosHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: 'sprint/reportes/img/08-embarque-plazos-desktop.png', fullPage: false });
});
