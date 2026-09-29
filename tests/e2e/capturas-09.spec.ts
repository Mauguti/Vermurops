/**
 * capturas-09.spec.ts — Capturas de las listas de clientes y proveedores en tabla.
 */
import { test, expect } from '@playwright/test';

const PW = '123456';
const IMG = 'sprint/reportes/img';

async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(PW);
  await page.locator('#login-submit').click();
  await expect(page.getByText('Emuladores · producción intacta')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
}

async function irA(page: import('@playwright/test').Page, modulo: string) {
  await page.getByRole('button', { name: modulo, exact: true }).first().click();
  await page.waitForTimeout(1500);
}

test('capturas de listas de clientes y proveedores', async ({ browser }) => {
  // Desktop
  const ctxDesktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pd = await ctxDesktop.newPage();
  await login(pd, 'administracion@vermur.com');
  await irA(pd, 'Altas');
  await pd.waitForTimeout(2000);

  // Clientes desktop
  await pd.screenshot({ path: `${IMG}/09-clientes-desktop.png`, fullPage: false });

  // Proveedores desktop
  await pd.getByRole('button', { name: 'Proveedores' }).click();
  await pd.waitForTimeout(1500);
  await pd.screenshot({ path: `${IMG}/09-proveedores-desktop.png`, fullPage: false });

  // Pestaña Agentes de carga (el texto incluye el conteo, ej. "Agentes de carga 134")
  await pd.locator('button', { hasText: 'Agentes de carga' }).click();
  await pd.waitForTimeout(500);
  await pd.screenshot({ path: `${IMG}/09-proveedores-agentes-desktop.png`, fullPage: false });

  await ctxDesktop.close();

  // Narrow (mobile)
  const ctxNarrow = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const pn = await ctxNarrow.newPage();
  await login(pn, 'administracion@vermur.com');
  await irA(pn, 'Altas');
  await pn.waitForTimeout(2000);

  // Clientes narrow
  await pn.screenshot({ path: `${IMG}/09-clientes-angosto.png`, fullPage: false });

  // Proveedores narrow
  await pn.getByRole('button', { name: 'Proveedores' }).click();
  await pn.waitForTimeout(1500);
  await pn.screenshot({ path: `${IMG}/09-proveedores-angosto.png`, fullPage: false });

  await ctxNarrow.close();
});
