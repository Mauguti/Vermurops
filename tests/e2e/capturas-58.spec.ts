/**
 * capturas-58.spec.ts — el caso de IDAMEX, de punta a punta.
 *
 * Siembra el duplicado que reportó Julio: tres órdenes del mismo proveedor,
 * dos de ellas cubiertas por la MISMA factura (F-IDA-1201) y con fechas de
 * pago distintas. Antes se veían como tres renglones; ahora IDAMEX aparece
 * una vez con DOS facturas, y el folio de cada orden abre su ficha.
 *
 * Requiere emuladores + app en :3100 arriba: `KEEP=1 ./scripts/e2e.sh`.
 * Las órdenes se siembran con `Bearer owner` (el emulador trata ese token
 * como Admin SDK), igual que en capturas-57.
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const PW = '123456';
const IMG = 'sprint/reportes/img';

async function sembrarOC(oc: {
  id: string; folio: string; monto: number; moneda: string;
  fechaPago: string; factura: string; concepto: string; creado: string;
}) {
  const r = await fetch(`${FS}/ordenesCompra/${oc.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({
      fields: {
        id: { stringValue: oc.id },
        folio: { stringValue: oc.folio },
        // `activo` y `createdAt` no son decoración: la consulta del hook es
        // where('activo','==',true) + orderBy('createdAt').
        activo: { booleanValue: true },
        createdAt: { stringValue: oc.creado },
        updatedAt: { stringValue: oc.creado },
        estado: { stringValue: 'autorizada' },
        origen: { stringValue: 'oficina' },
        proveedorId: { stringValue: 'PRV-0001' },
        proveedorNombre: { stringValue: 'IDAMEX' },
        conceptoId: { stringValue: 'CON-001' },
        conceptoNombre: { stringValue: oc.concepto },
        descripcion: { stringValue: 'Caso de la tarea 58' },
        monto: { doubleValue: oc.monto },
        moneda: { stringValue: oc.moneda },
        saldoPendiente: { doubleValue: oc.monto },
        montoDisponible: { nullValue: null },
        esAnticipo: { booleanValue: false },
        facturaAsociada: { stringValue: oc.factura },
        bancoSalida: { stringValue: 'santander_gastos' },
        cuentaBancariaId: { stringValue: 'CB-1' },
        cuentaSalida: { nullValue: null },
        urgencia: { stringValue: 'normal' },
        fechaRequerida: { stringValue: '2026-09-28' },
        fechaSugeridaPago: { stringValue: oc.fechaPago },
        historialEstados: { arrayValue: { values: [] } },
        anticiposCruzados: { arrayValue: { values: [] } },
      },
    }),
  });
  expect(r.ok).toBe(true);
}

async function sembrarCaso() {
  await sembrarOC({ id: 'OC-58-A', folio: 'OC-2026-0581', monto: 12000, moneda: 'MXN', fechaPago: '2026-10-02', factura: 'F-IDA-1201', concepto: 'Maniobras en destino', creado: '2026-10-05T09:00:00.000Z' });
  await sembrarOC({ id: 'OC-58-B', folio: 'OC-2026-0582', monto: 6500,  moneda: 'MXN', fechaPago: '2026-10-05', factura: 'F-IDA-1201', concepto: 'Almacenaje',           creado: '2026-10-05T09:01:00.000Z' });
  await sembrarOC({ id: 'OC-58-C', folio: 'OC-2026-0583', monto: 900,   moneda: 'USD', fechaPago: '2026-10-05', factura: 'F-IDA-1310', concepto: 'Flete internacional', creado: '2026-10-05T09:02:00.000Z' });
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

async function abrirCuentasPorPagar(page: Page) {
  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cuentas por pagar', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Por proveedor' })).toBeVisible({ timeout: 15_000 });
  // La preferencia se guarda por usuario: se normaliza al entrar para que el
  // orden de los tests no decida qué vista se está mirando.
  await page.getByRole('button', { name: 'Por proveedor' }).click();
}

// ─── 1 · IDAMEX una vez, con sus dos facturas ──────────────────────────────

test('IDAMEX aparece una vez: tres órdenes, dos facturas', async ({ browser }) => {
  await sembrarCaso();
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirCuentasPorPagar(page);

  // El proveedor, UNA vez. Antes eran tres renglones.
  await expect(page.locator('p', { hasText: /^IDAMEX$/ })).toHaveCount(1);
  await expect(page.getByText('2 facturas · 3 órdenes')).toBeVisible();

  // Un renglón por factura, con el total por moneda sin revolver (§4.3).
  await expect(page.getByText('F-IDA-1201')).toBeVisible();
  await expect(page.getByText('F-IDA-1310')).toBeVisible();
  await expect(page.getByText('MXN 18,500.00').first()).toBeVisible();
  await expect(page.getByText('USD 900.00').first()).toBeVisible();

  // Las dos órdenes de la misma factura traen fechas de pago distintas: se dice.
  await expect(page.getByText('Fechas distintas')).toBeVisible();

  await page.getByText('F-IDA-1310').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${IMG}/58-por-proveedor-desktop.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.getByText('F-IDA-1201').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${IMG}/58-por-proveedor-movil.png`, fullPage: false });

  await ctx.close();
});

// ─── 2 · El desglose y el COD que enlaza a la orden ────────────────────────

test('la factura se abre y el folio de la orden lleva a su ficha', async ({ browser }) => {
  await sembrarCaso();
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirCuentasPorPagar(page);

  // Los COD están a la vista en el renglón, sin abrir nada: es como se busca
  // una orden de la que alguien pasó el folio.
  const cod = page.getByRole('button', { name: 'OC-2026-0581', exact: true });
  await expect(cod).toBeVisible();
  await expect(page.getByRole('button', { name: 'OC-2026-0582', exact: true })).toBeVisible();

  // El desglose agrega el concepto y el monto de cada orden.
  await expect(page.getByText('Maniobras en destino')).toHaveCount(0);
  await page.getByRole('button', { name: 'F-IDA-1201', exact: true }).click();
  await expect(page.getByText('Maniobras en destino')).toBeVisible();
  await expect(page.getByText('Almacenaje')).toBeVisible();
  await page.getByRole('button', { name: 'OC-2026-0582', exact: true }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${IMG}/58-desglose-factura-desktop.png`, fullPage: true });

  // El COD abre la ficha de ESA orden…
  await cod.click();
  await expect(page.getByText('OC-2026-0581').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Cuentas por pagar/ }).first()).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${IMG}/58-ficha-oc-desde-factura-desktop.png`, fullPage: false });

  // …y «Regresar» deja la vista donde estaba.
  await page.getByRole('button', { name: /Cuentas por pagar/ }).first().click();
  await expect(page.getByText('2 facturas · 3 órdenes')).toBeVisible({ timeout: 15_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${IMG}/58-por-proveedor-movil-lista.png`, fullPage: false });

  await ctx.close();
});

// ─── 3 · La vista por orden sigue estando ──────────────────────────────────

test('«Por orden» conserva la tabla de siempre y la preferencia se queda', async ({ browser }) => {
  await sembrarCaso();
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirCuentasPorPagar(page);

  await page.getByRole('button', { name: 'Por orden' }).click();
  await expect(page.getByRole('columnheader', { name: 'Folio' })).toBeVisible({ timeout: 15_000 });
  // La tabla sí es orden por orden: ahí IDAMEX se repite, y está bien.
  await expect(page.locator('td', { hasText: /^IDAMEX$/ })).toHaveCount(3);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${IMG}/58-por-orden-desktop.png`, fullPage: true });

  // La preferencia sobrevive a salir y volver de la pestaña.
  await page.getByRole('button', { name: 'Programación de pagos', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cuentas por pagar', exact: true }).first().click();
  await expect(page.getByRole('columnheader', { name: 'Folio' })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Por proveedor' }).click();
  await expect(page.getByText('2 facturas · 3 órdenes')).toBeVisible();

  await ctx.close();
});

// ─── 4 · Programación de pagos dice qué factura cubre ──────────────────────

test('Programación de pagos nombra la factura de cada transferencia', async ({ browser }) => {
  await sembrarCaso();
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');

  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Programación de pagos', exact: true }).first().click();
  await expect(page.getByText(/factura F-IDA-1201/).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/factura F-IDA-1310/).first()).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${IMG}/58-programacion-con-factura-desktop.png`, fullPage: true });

  await ctx.close();
});
