/**
 * capturas-56.spec.ts — capturas de la tarea 56 (tipo de cambio de Pricing).
 *
 * Requiere emuladores + app en :3100 arriba: `KEEP=1 ./scripts/e2e.sh`.
 *
 * Siembra `configuracion/tipoCambio` con `Bearer owner` (el emulador trata ese
 * token como Admin SDK) porque la regla de producción tiene `allow write: if
 * false`: ese documento lo escribe la Function, no el navegador.
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const PW = '123456';
const IMG = 'sprint/reportes/img';

async function sembrarTipoCambio() {
  const r = await fetch(`${FS}/configuracion/tipoCambio`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({
      fields: {
        valor: { doubleValue: 18.1903 },
        fechaDeterminacion: { stringValue: '2026-10-02' },
        fechaLiquidacion: { stringValue: '2026-10-06' },
        consultado: { stringValue: '2026-10-02T18:16:17.000Z' },
        fuente: { stringValue: 'banxico' },
        ultimaConsulta: { stringValue: '2026-10-05T16:00:19.000Z' },
      },
    }),
  });
  expect(r.ok).toBe(true);
}

/**
 * Deja la cotización SIN tipo de cambio.
 *
 * Los emuladores conservan los datos entre corridas: sin esto, la segunda vez
 * se vería la tasa que dejó la primera y no con qué abre una cotización nueva.
 * `updateMask` con el campo y un cuerpo sin él es como se borra en la REST.
 */
async function limpiarTipoCambio(folio: string) {
  // El id del documento ES el folio (COT-2026-0004).
  const r = await fetch(`${FS}/cotizaciones/${folio}?updateMask.fieldPaths=tipoCambio`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: {} }),
  });
  expect(r.ok).toBe(true);
}

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

// ─────────────────────────────────────────────────────────────────────────────

test('la captura del tipo de cambio abre en el de Pricing y enseña el FIX como referencia', async ({ browser }) => {
  await sembrarTipoCambio();
  await limpiarTipoCambio('COT-2026-0004');
  const { page, ctx } = await entrar(browser, 'pricing@vermur.com');

  await page.getByRole('button', { name: 'CRM', exact: true }).first().click();
  // Pricing cae en su bandeja: COT-2026-0004 ya tiene a los dos proveedores
  // que respondieron, así que la comparativa trae filas de verdad.
  await expect(page.getByText('COT-2026-0004')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Abrir', exact: true }).first().click();
  await page.getByRole('button', { name: /^Servicios/ }).click();

  await page.setViewportSize({ width: 1440, height: 900 });
  const boton = page.getByRole('button', { name: 'Sin tipo de cambio' }).first();
  await expect(boton).toBeVisible({ timeout: 15_000 });
  await boton.scrollIntoViewIfNeeded();
  await boton.click();

  // Por defecto: Pricing rate, y el FIX de Banxico solo informativo.
  await expect(page.getByText('FIX Banxico del 2 oct 2026: 18.1903')).toBeVisible();
  await expect(page.getByRole('button', { name: /Usar (el|la) .*(Banxico|SAT|Banamex)/ })).toHaveCount(0);
  // Positivo: el selector de fuente SÍ está, así que la pantalla cargó.
  await expect(page.locator('select').filter({ has: page.locator('option[value="pricing_rate"]') }).first()).toBeVisible();
  const select = page.locator('select').filter({ has: page.locator('option[value="pricing_rate"]') }).first();
  await expect(select).toHaveValue('pricing_rate');

  // El desplegable cuelga por debajo del pliegue del contenedor con scroll:
  // sin traerlo a la vista, la captura sale cortada a la mitad.
  await page.getByRole('button', { name: 'Aplicar' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${IMG}/56-captura-tc-desktop.png`, fullPage: false });

  // La pestaña de la regla.
  await page.getByRole('button', { name: 'Con regla' }).click();
  await page.getByRole('button', { name: 'Aplicar' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${IMG}/56-captura-tc-regla-desktop.png`, fullPage: false });

  // Captura de Pricing: 20.50 directo.
  await page.getByRole('button', { name: 'Valor directo' }).click();
  await page.locator('input[placeholder="18.5000"]').fill('20.50');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByRole('button', { name: '1 USD = 20.5 MXN · Pricing rate' })).toBeVisible({ timeout: 15_000 });

  // Angosto.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '1 USD = 20.5 MXN · Pricing rate' }).click();
  await page.getByRole('button', { name: 'Aplicar' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${IMG}/56-captura-tc-movil.png`, fullPage: false });

  // Una tasa de referencia guardada se avisa al reabrir, sin cambiarla.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  await page.locator('select').filter({ has: page.locator('option[value="pricing_rate"]') }).first()
    .selectOption('banxico');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByRole('button', { name: '1 USD = 20.5 MXN · Banxico' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '1 USD = 20.5 MXN · Banxico' }).click();
  const textoAviso = page.getByText(/El operativo de Vermur es el de Pricing/);
  await expect(textoAviso).toBeVisible();
  // Aquí interesa el aviso, que va arriba del desplegable, no el «Aplicar».
  await textoAviso.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${IMG}/56-captura-tc-aviso-desktop.png`, fullPage: false });

  await ctx.close();
});

// ─────────────────────────────────────────────────────────────────────────────

test('el módulo Tipo de cambio dice que es de referencia', async ({ browser }) => {
  await sembrarTipoCambio();
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');

  await page.getByRole('button', { name: 'Tipo de cambio', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Tipo de Cambio', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Esta pantalla es de referencia.')).toBeVisible();
  await expect(page.getByText(/tipo de cambio de Pricing/).first()).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${IMG}/56-tipo-cambio-desktop.png`, fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${IMG}/56-tipo-cambio-movil.png`, fullPage: true });

  await ctx.close();
});
