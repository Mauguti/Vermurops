/**
 * 76 — Un cliente sin statusOperativo se ve en Altas con «Sin estatus».
 * Requiere emuladores + app en :3100: `KEEP=1 ./scripts/e2e.sh`.
 */
import { test, expect } from '@playwright/test';

test.setTimeout(120_000);
const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const IMG = 'sprint/reportes/img';
const S = (stringValue: string) => ({ stringValue });

async function escribir(id: string, nombre: string, status?: string) {
  const fields: Record<string, unknown> = {
    id: S(id), nombre: S(nombre), origenDatos: S('manual'), correo: S('x@ejemplo.com'),
    createdAt: S('2026-10-01T09:00:00.000Z'), updatedAt: S('2026-10-01T09:00:00.000Z'),
  };
  if (status) fields.statusOperativo = S(status);
  const r = await fetch(`${FS}/clientes/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields }),
  });
  expect(r.ok).toBe(true);
}

for (const vp of [{ n: 'escritorio', w: 1440, h: 900 }, { n: 'angosto', w: 390, h: 844 }]) {
  test(`Altas muestra «Sin estatus» (${vp.n})`, async ({ browser }) => {
    await escribir('CLI-76-SIN', 'SIN ESTATUS 76 SA', undefined);
    await escribir('CLI-76-RARO', 'VALOR RARO 76 SA', 'SUSPENDIDO');
    await escribir('CLI-76-ACT', 'ACTIVO 76 SA', 'ACTIVO');
    await escribir('CLI-76-INA', 'INACTIVO 76 SA', 'INACTIVO');
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
    await page.getByPlaceholder('usuario@vermur.com').fill('administracion@vermur.com');
    await page.getByPlaceholder('••••••••').fill('123456');
    await page.locator('#login-submit').click();
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Altas', exact: true }).first().click();
    await page.locator('input[placeholder*="Buscar"]').first().fill(' 76 SA');

    // Positivo: el que no tiene estatus y el de valor raro SÍ están, con etiqueta.
    const sin = page.getByRole('row').filter({ hasText: 'SIN ESTATUS 76' });
    await expect(sin).toBeVisible({ timeout: 15_000 });
    await expect(sin.getByText('Sin estatus', { exact: true })).toBeAttached();
    await expect(page.getByRole('row').filter({ hasText: 'VALOR RARO 76' }).getByText('Sin estatus', { exact: true })).toBeAttached();
    await expect(page.getByRole('row').filter({ hasText: 'ACTIVO 76' })).toBeVisible();
    await expect(page.getByText(/\d+ sin estatus/).first()).toBeVisible();

    // Ausencia, con el positivo de arriba como prueba de que el nombre es bueno.
    await expect(page.getByRole('row').filter({ hasText: 'INACTIVO 76' })).toHaveCount(0);
    await page.getByLabel('Mostrar inactivos').check();
    await expect(page.getByRole('row').filter({ hasText: 'INACTIVO 76' })).toBeVisible();
    await page.screenshot({ path: `${IMG}/76-altas-${vp.n}.png`, fullPage: true });

    // La ficha dice «Sin estatus» y no un campo vacío.
    await sin.click();
    await expect(page.getByText('Sin estatus', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `${IMG}/76-ficha-${vp.n}.png`, fullPage: true });
    await ctx.close();
  });
}
