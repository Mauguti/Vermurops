/**
 * Capturas de la tabla unificada de cargos del embarque (tarea 07).
 *
 * Ejecutar DESPUÉS del recorrido completo, con los emuladores levantados
 * y un embarque ya creado.
 */
import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

test.setTimeout(60_000);

const PW = '123456';

async function entrar(browser: Browser, email: string): Promise<{ page: Page; ctx: BrowserContext }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(PW);
  await page.locator('#login-submit').click();
  await expect(page.getByText('Emuladores · producción intacta')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
  return { page, ctx };
}

test('capturas de la tabla de cargos del embarque', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'operaciones@vermur.com');

  // Ir a embarques
  await page.getByRole('button', { name: 'Embarques', exact: true }).first().click();
  await page.waitForTimeout(2000);

  // Click "Todos los embarques" tab to see the created embarque
  await page.locator('button:has-text("Todos los embarques")').click();
  await page.waitForTimeout(2000);

  // Buscar y abrir el primer embarque
  const fila = page.locator('tr').filter({ hasText: /VLIM/ }).first();
  await expect(fila).toBeVisible({ timeout: 10_000 });
  await fila.click();
  await page.waitForTimeout(2000);

  // Ir a la pestaña Cargos
  const cargosTab = page.locator('button:has-text("Cargos")');
  await cargosTab.first().click();
  await page.waitForTimeout(1500);

  // Asegurar vista «Por concepto» (tabla unificada)
  const toggle = page.locator('button[role="tab"]:has-text("Por concepto")');
  if (await toggle.count() > 0) {
    await toggle.click();
    await page.waitForTimeout(1000);
  }

  // Captura desktop
  await page.screenshot({
    path: 'sprint/reportes/img/07-cargos-concepto-desktop.png',
    fullPage: false,
  });

  // Captura angosta
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: 'sprint/reportes/img/07-cargos-concepto-angosto.png',
    fullPage: false,
  });

  // Volver a desktop y capturar Por proveedor
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);
  const provToggle = page.locator('button[role="tab"]:has-text("Por proveedor")');
  if (await provToggle.count() > 0) {
    await provToggle.click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: 'sprint/reportes/img/07-cargos-proveedor-desktop.png',
      fullPage: false,
    });
  }

  await ctx.close();
});
