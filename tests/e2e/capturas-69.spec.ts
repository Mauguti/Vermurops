/**
 * capturas-69.spec.ts — las tres pantallas que P3 mueve.
 *
 *   Finanzas → Cuentas por cobrar   el botón nuevo y el modal del anticipo
 *   Finanzas → Cuentas por pagar    la ficha de la OC, panel de SOLO LECTURA
 *   Embarque → Facturas             con y sin `cobro.registrar`
 *
 * Se recorre con DOS cuentas a propósito: lo que esta tarea cambia es quién
 * puede qué, y una sola cuenta no lo enseña. Administración ve el formulario;
 * Operaciones ve a dónde ir.
 *
 * Requiere emuladores + app en :3100 arriba: `KEEP=1 ./scripts/e2e.sh`.
 * Se siembra con `Bearer owner` (el emulador trata ese token como Admin SDK).
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { fijarPreferencias } from './preferencias';

// Tarea 90: las vistas de Cuentas por cobrar/pagar se guardan por usuario; cada spec parte del default.
test.beforeAll(async () => { await fijarPreferencias(); });

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const PW = '123456';
const IMG = 'sprint/reportes/img';

const CLIENTE_ID = 'CLI-69';
const CLIENTE = 'COBRANZA 69 SA DE CV';
const EMB = 'EMB-69';

async function escribir(ruta: string, fields: Record<string, unknown>) {
  const r = await fetch(`${FS}/${ruta}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields }),
  });
  expect(r.ok).toBe(true);
}

const S = (stringValue: string) => ({ stringValue });
const D = (doubleValue: number) => ({ doubleValue });
const B = (booleanValue: boolean) => ({ booleanValue });
const NULO = { nullValue: null };

async function sembrar() {
  await escribir(`clientes/${CLIENTE_ID}`, {
    id: S(CLIENTE_ID), nombre: S(CLIENTE), activo: B(true),
    rfc: S('CSS260101AA1'), origenDatos: S('magaya'),
    statusOperativo: S('ACTIVO'), correo: S('cobranza69@ejemplo.com'),
    numeroEntidadMagaya: S('69001'), dias: { integerValue: '45' },
    createdAt: S('2026-10-01T09:00:00.000Z'), updatedAt: S('2026-10-01T09:00:00.000Z'),
  });

  // Una factura abierta: el renglón desde el que se cobra contra factura.
  await escribir('facturas/FAC-69-A', {
    id: S('FAC-69-A'), numero: S('A-6901'),
    fechaEmision: S('2026-09-10'), fechaVencimiento: S('2026-10-10'),
    diasCredito: { integerValue: '30' },
    embarqueId: S(EMB), embarqueFolio: S('VLEM-26-069'),
    clienteId: S(CLIENTE_ID), clienteNombre: S(CLIENTE),
    grupoFacturacion: NULO, moneda: S('MXN'),
    subtotal: D(50000), iva: D(8000), retencion: D(0), total: D(58000),
    estado: S('emitida'), lineas: { arrayValue: { values: [] } },
    activo: B(true),
    createdAt: S('2026-09-10T09:00:00.000Z'), updatedAt: S('2026-09-10T09:00:00.000Z'),
  });

  /*
   * DOS órdenes abiertas del mismo embarque, en MONEDAS distintas: es lo que
   * el selector del anticipo tiene que enseñar separado («USD 1,500.00 +
   * MXN 20,000.00»), nunca como un escalar (§4.3).
   */
  for (const o of [
    { id: 'OC-69-A', folio: 'OC-2026-0691', monto: 1500, moneda: 'USD', prov: 'NAVIERA 69' },
    { id: 'OC-69-B', folio: 'OC-2026-0692', monto: 20000, moneda: 'MXN', prov: 'MANIOBRAS 69' },
  ]) {
    await escribir(`ordenesCompra/${o.id}`, {
      id: S(o.id), folio: S(o.folio), activo: B(true),
      estado: S('en_gestion'), origen: S('embarque'),
      embarqueId: S(EMB), embarqueFolio: S('VLEM-26-069'),
      clienteId: S(CLIENTE_ID), clienteNombre: S(CLIENTE),
      proveedorId: S('PRV-0069'), proveedorNombre: S(o.prov),
      conceptoId: S('CON-001'), conceptoNombre: S('Flete internacional'),
      descripcion: S('Caso de la tarea 69'),
      monto: D(o.monto), moneda: S(o.moneda),
      saldoPendiente: D(o.monto), montoDisponible: NULO, esAnticipo: B(false),
      facturaAsociada: NULO, comprobantePago: NULO,
      bancoSalida: NULO, cuentaBancariaId: NULO, cuentaSalida: NULO,
      urgencia: S('normal'), fechaRequerida: S('2026-10-20'), fechaSugeridaPago: S('2026-10-16'),
      historialEstados: { arrayValue: { values: [] } },
      anticiposCruzados: { arrayValue: { values: [] } },
      createdAt: S('2026-10-05T09:00:00.000Z'), updatedAt: S('2026-10-05T09:00:00.000Z'),
    });
  }

  // Un depósito viejo de `depositosCliente/`: el panel de solo lectura tiene
  // que pintarlo como «anticipo a cuenta», sin migrar nada.
  await escribir('depositosCliente/DEP-69', {
    id: S('DEP-69'), embarqueId: S(EMB), embarqueFolio: S('VLEM-26-069'),
    clienteId: S(CLIENTE_ID), clienteNombre: S(CLIENTE),
    monto: D(12000), moneda: S('MXN'), fechaDeposito: S('2026-10-02'),
    referencia: S('DEP-69-001'), comprobante: NULO, activo: B(true),
    fechaAlta: S('2026-10-02T09:00:00.000Z'), updatedAt: S('2026-10-02T09:00:00.000Z'),
  });
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

const ANCHO = { width: 390, height: 900 };

async function foto(page: Page, nombre: string) {
  await page.screenshot({ path: `${IMG}/69-${nombre}.png`, fullPage: true });
}

async function abrirPorCobrar(page: Page) {
  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cuentas por cobrar', exact: true }).first().click();
  await expect(page.getByText('A-6901').first()).toBeVisible({ timeout: 15_000 });
}

async function abrirOC(page: Page, folio: string) {
  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cuentas por pagar', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Por orden' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Por orden' }).click();
  await page.getByText(folio).first().click();
  await expect(page.getByText(folio).first()).toBeVisible({ timeout: 15_000 });
}

test('siembra los casos de cobranza', async () => {
  await sembrar();
});

test('Cuentas por cobrar · el botón de entrada de dinero (Administración)', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPorCobrar(page);
  await expect(page.getByRole('button', { name: 'Registrar entrada de dinero' })).toBeVisible();
  // Par positivo de la ausencia de Operaciones (más abajo): mismo nombre.
  await expect(page.getByRole('button', { name: 'Aplicar pago' }).first()).toBeVisible();
  await foto(page, 'por-cobrar-admin');

  await page.setViewportSize(ANCHO);
  await foto(page, 'por-cobrar-admin-angosto');
  await ctx.close();
});

test('Cuentas por cobrar · el modal del anticipo, con la moneda y sin referencia', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPorCobrar(page);
  await page.getByRole('button', { name: 'Registrar entrada de dinero' }).click();
  await expect(page.getByLabel('A qué embarque entra')).toBeVisible();
  await page.getByLabel('A qué embarque entra').selectOption(EMB);

  // Las dos órdenes del embarque piden en dos monedas, y así se enseña.
  await expect(page.getByText(/USD 1,500.00.*MXN 20,000.00/)).toBeVisible();
  await page.getByLabel('Monto', { exact: true }).fill('8000');
  await page.getByLabel('Moneda').selectOption('MXN');
  await foto(page, 'modal-anticipo');

  await page.setViewportSize(ANCHO);
  await foto(page, 'modal-anticipo-angosto');
  await ctx.close();
});

test('Cuentas por cobrar · Operaciones ya no puede cobrar', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'operaciones@vermur.com');
  await abrirPorCobrar(page);
  // Sin esto, un nombre cambiado haría pasar las dos ausencias: la tabla tiene que haber cargado.
  await expect(page.getByRole('columnheader', { name: 'Factura', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar entrada de dinero' })).toHaveCount(0);
  // Tarea 70 · el botón del renglón se llama «Aplicar pago» desde P4.
  await expect(page.getByRole('button', { name: 'Aplicar pago' })).toHaveCount(0);
  await foto(page, 'por-cobrar-operaciones');
  await ctx.close();
});

test('la ficha de la orden · el panel de entradas, en solo lectura', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirOC(page, 'OC-2026-0691');

  // El depósito viejo se lee igual, y se dice que es anticipo a cuenta.
  await expect(page.getByText('anticipo a cuenta')).toBeVisible();
  await expect(page.getByRole('button', { name: /Ir a Cuentas por cobrar/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Registrar (depósito|entrada de dinero)/ })).toHaveCount(0);
  await foto(page, 'ficha-oc-solo-lectura');

  await page.setViewportSize(ANCHO);
  await foto(page, 'ficha-oc-solo-lectura-angosto');
  await ctx.close();
});

test('la ficha de la orden · Operaciones lee a dónde ir, y marca «No pagar»', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'operaciones@vermur.com');
  await abrirOC(page, 'OC-2026-0692');

  await expect(page.getByText(/Los cobros los registra Administración en Cuentas por cobrar/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Ir a Cuentas por cobrar/ })).toHaveCount(0);
  // Marcar sí; quitar no (minuta §5).
  await expect(page.getByRole('button', { name: 'Marcar «No pagar»' })).toBeVisible();
  await foto(page, 'ficha-oc-operaciones');

  await page.setViewportSize(ANCHO);
  await foto(page, 'ficha-oc-operaciones-angosto');
  await ctx.close();
});
