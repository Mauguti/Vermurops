/**
 * capturas-61-antes.spec.ts — el «antes» de las dos pantallas de Finanzas.
 *
 * A propósito NO usa ningún selector nuevo: corre igual contra el código de
 * antes de la tarea 61 (la tabla fija de Cuentas por pagar y el agrupado de
 * Cuentas por cobrar) y contra el de después. Así la comparación es de la
 * misma pantalla con los mismos datos, no de dos escenarios distintos.
 *
 * Requiere emuladores + app en :3100 arriba: `KEEP=1 ./scripts/e2e.sh`, y los
 * datos sembrados por `capturas-61.spec.ts`.
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const PW = '123456';
const IMG = 'sprint/reportes/img';
const SUFIJO = process.env.CAPTURA_SUFIJO ?? 'antes';

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

test('Cuentas por pagar y Cuentas por cobrar, tal como están', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');

  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();

  // ── Cuentas por pagar ───────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Cuentas por pagar', exact: true }).first().click();
  await expect(page.getByPlaceholder(/Buscar folio/)).toBeVisible({ timeout: 15_000 });
  // La vista «Por orden» es la que cambia de tabla: existe en los dos lados.
  await page.getByRole('button', { name: 'Por orden' }).click();
  await expect(page.getByRole('columnheader', { name: 'Folio' })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${IMG}/61-${SUFIJO}-por-pagar-desktop.png`, fullPage: true });

  // El armazón de la app tiene su propio scroll, así que `fullPage` da el
  // tamaño del viewport y nada más: para que la captura angosta enseñe la
  // tabla hay que arrastrar el contenedor de adentro.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.getByPlaceholder(/Buscar folio/).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${IMG}/61-${SUFIJO}-por-pagar-movil.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });

  // ── Cuentas por cobrar ──────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Cuentas por cobrar', exact: true }).first().click();
  await expect(page.getByPlaceholder('Factura, cliente o embarque…')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${IMG}/61-${SUFIJO}-por-cobrar-desktop.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.getByPlaceholder('Factura, cliente o embarque…').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${IMG}/61-${SUFIJO}-por-cobrar-movil.png`, fullPage: true });

  await ctx.close();
});
