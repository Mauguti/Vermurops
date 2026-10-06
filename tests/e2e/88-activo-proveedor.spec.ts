/**
 * 88 — Un proveedor sin el campo `activo` se lee como activo: lista y ficha dicen lo mismo.
 * Requiere emuladores + app en :3100: `KEEP=1 ./scripts/e2e.sh`.
 */
import { test, expect } from '@playwright/test';

test.setTimeout(120_000);
const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const IMG = 'sprint/reportes/img';
const S = (stringValue: string) => ({ stringValue });

async function escribir(id: string, nombre: string, activo?: boolean) {
  const fields: Record<string, unknown> = {
    id: S(id), nombre: S(nombre), tipos: { arrayValue: { values: [S('proveedor')] } },
    createdAt: S('2026-10-01T09:00:00.000Z'), updatedAt: S('2026-10-01T09:00:00.000Z'),
  };
  if (activo !== undefined) fields.activo = { booleanValue: activo };
  const r = await fetch(`${FS}/proveedores/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields }),
  });
  expect(r.ok).toBe(true);
}

for (const vp of [{ n: 'escritorio', w: 1440, h: 900 }, { n: 'angosto', w: 390, h: 844 }]) {
  test(`Proveedor sin «activo» se ve Activo en lista y ficha (${vp.n})`, async ({ browser }) => {
    await escribir('PRV-88-SIN', 'SIN CAMPO 88 SA');
    await escribir('PRV-88-INA', 'INACTIVO 88 SA', false);
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
    await page.getByPlaceholder('usuario@vermur.com').fill('administracion@vermur.com');
    await page.getByPlaceholder('••••••••').fill('123456');
    await page.locator('#login-submit').click();
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Altas', exact: true }).first().click();
    await page.getByRole('button', { name: /^Proveedores/ }).first().click();
    await page.locator('input[placeholder*="Buscar"]').first().fill(' 88 SA');
    const sin = page.getByRole('row').filter({ hasText: 'SIN CAMPO 88' });
    await expect(sin).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('row').filter({ hasText: 'INACTIVO 88' })).toBeVisible();
    await page.screenshot({ path: `${IMG}/88-altas-proveedores-${vp.n}.png`, fullPage: true });
    await sin.click();
    await expect(page.getByText('PROVEEDOR ACTIVO')).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `${IMG}/88-ficha-proveedor-${vp.n}.png`, fullPage: true });
    await ctx.close();
  });
}
