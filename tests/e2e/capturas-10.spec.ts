/**
 * capturas-10.spec.ts — Edición en línea de estado y ejecutivos en las listas.
 *
 * Captura la vista de Administración (que puede editar) y la de Ventas
 * (que solo ve en lectura).
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

test('capturas de edición en línea', async ({ browser }) => {
  // ── Administración (puede editar) ────────────────────────────────────
  const ctxAdmin = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pa = await ctxAdmin.newPage();
  await login(pa, 'administracion@vermur.com');
  await irA(pa, 'Altas');
  await pa.waitForTimeout(2000);

  // Clientes: columnas de estado y ejecutivos visibles con dropdown
  await pa.screenshot({ path: `${IMG}/10-clientes-admin-editable.png`, fullPage: false });

  // Proveedores editable
  await pa.getByRole('button', { name: 'Proveedores' }).click();
  await pa.waitForTimeout(1500);
  await pa.screenshot({ path: `${IMG}/10-proveedores-admin-editable.png`, fullPage: false });

  await ctxAdmin.close();

  // ── Ventas (solo lectura) ────────────────────────────────────────────
  const ctxVentas = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pv = await ctxVentas.newPage();
  await login(pv, 'ventas@vermur.com');
  await irA(pv, 'Altas');
  await pv.waitForTimeout(2000);

  // Clientes: columnas de estado y ejecutivos en solo lectura
  await pv.screenshot({ path: `${IMG}/10-clientes-ventas-lectura.png`, fullPage: false });

  await ctxVentas.close();
});
