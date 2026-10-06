/**
 * capturas-67.spec.ts — las cuatro pantallas que la lectura unificada toca.
 *
 * P1 no cambia ninguna pantalla: estas capturas son la prueba de que siguen
 * diciendo lo mismo leyendo de `pagos` en vez de de `cobros`. Siembra una
 * factura con cobro parcial, otra cobrada completa y un depósito de cliente
 * —los tres casos que las derivaciones mezclaban— y recorre:
 *
 *   Finanzas → Cuentas por cobrar   (cartera, KPIs, agrupado por cliente)
 *   Finanzas → Cuentas por pagar    (la ficha de la OC con su panel de fondeo)
 *   Embarque → Facturas             (la factura con sus cobros en renglones)
 *   Altas → ficha del cliente       (el resumen de cartera en Crédito)
 *
 * Requiere emuladores + app en :3100 arriba: `KEEP=1 ./scripts/e2e.sh`.
 * Se siembra con `Bearer owner` (el emulador trata ese token como Admin SDK).
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { fijarPreferencias } from './preferencias';

// Tarea 84: las vistas de Cuentas por cobrar/pagar se guardan por usuario; cada spec parte del default.
test.beforeAll(async () => { await fijarPreferencias(); });

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const PW = '123456';
const IMG = 'sprint/reportes/img';

const CLIENTE_ID = 'CLI-67';
const CLIENTE = 'PAGOS 67 SA DE CV';
const EMB = 'EMB-67';

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
    rfc: S('PSS260101AA1'), origenDatos: S('magaya'),
    // La lista de Altas filtra por statusOperativo, no por `activo`.
    statusOperativo: S('ACTIVO'), correo: S('pagos67@ejemplo.com'),
    numeroEntidadMagaya: S('67001'),
    dias: { integerValue: '45' },
    createdAt: S('2026-10-01T09:00:00.000Z'), updatedAt: S('2026-10-01T09:00:00.000Z'),
  });

  // Vencida con cobro parcial: el caso que prueba que el saldo sale de las
  // aplicaciones y no del monto del pago.
  await escribir('facturas/FAC-67-A', {
    id: S('FAC-67-A'), numero: S('A-6701'),
    fechaEmision: S('2026-08-20'), fechaVencimiento: S('2026-09-20'),
    diasCredito: { integerValue: '30' },
    embarqueId: S(EMB), embarqueFolio: S('VLIM-26-001'),
    clienteId: S(CLIENTE_ID), clienteNombre: S(CLIENTE),
    grupoFacturacion: NULO, moneda: S('MXN'),
    subtotal: D(40000), iva: D(6400), retencion: D(0), total: D(46400),
    estado: S('cobrada_parcial'), lineas: { arrayValue: { values: [] } },
    activo: B(true),
    createdAt: S('2026-08-20T09:00:00.000Z'), updatedAt: S('2026-08-20T09:00:00.000Z'),
  });

  // Cobrada completa en USD: la otra moneda, para que los KPIs se vean
  // separados (§4.3).
  await escribir('facturas/FAC-67-B', {
    id: S('FAC-67-B'), numero: S('A-6702'),
    fechaEmision: S('2026-09-28'), fechaVencimiento: S('2026-10-09'),
    diasCredito: { integerValue: '11' },
    embarqueId: S(EMB), embarqueFolio: S('VLIM-26-001'),
    clienteId: S(CLIENTE_ID), clienteNombre: S(CLIENTE),
    grupoFacturacion: NULO, moneda: S('USD'),
    subtotal: D(2200), iva: D(0), retencion: D(0), total: D(2200),
    estado: S('emitida'), lineas: { arrayValue: { values: [] } },
    activo: B(true),
    createdAt: S('2026-09-28T09:00:00.000Z'), updatedAt: S('2026-09-28T09:00:00.000Z'),
  });

  // Dos cobros a la MISMA factura: lo que antes eran dos documentos sueltos y
  // ahora son dos pagos con una aplicación cada uno.
  for (const c of [
    { id: 'COB-67-A', monto: 20000, fecha: '2026-10-01', ref: 'TRF-67-001' },
    { id: 'COB-67-B', monto: 6400, fecha: '2026-10-03', ref: 'TRF-67-002' },
  ]) {
    await escribir(`cobros/${c.id}`, {
      id: S(c.id), facturaId: S('FAC-67-A'), facturaNumero: S('A-6701'),
      embarqueId: S(EMB), embarqueFolio: S('VLIM-26-001'),
      clienteId: S(CLIENTE_ID), clienteNombre: S(CLIENTE),
      monto: D(c.monto), moneda: S('MXN'), fechaCobro: S(c.fecha),
      banco: S('BBVA'), referencia: S(c.ref), activo: B(true),
      createdAt: S(`${c.fecha}T09:00:00.000Z`), updatedAt: S(`${c.fecha}T09:00:00.000Z`),
    });
  }

  // Un depósito a cuenta: cero aplicaciones. Fondea el embarque y NO entra en
  // «cobrado del mes».
  await escribir('depositosCliente/DEP-67', {
    id: S('DEP-67'), embarqueId: S(EMB), embarqueFolio: S('VLIM-26-001'),
    clienteId: S(CLIENTE_ID), clienteNombre: S(CLIENTE),
    monto: D(80000), moneda: S('MXN'), fechaDeposito: S('2026-10-02'),
    referencia: S('DEP-67-001'), comprobante: NULO,
    activo: B(true),
    fechaAlta: S('2026-10-02T09:00:00.000Z'), updatedAt: S('2026-10-02T09:00:00.000Z'),
  });

  // Una orden del embarque, autorizada: su ficha enseña el panel de fondeo,
  // que es el call site de calcularFondeo.
  await escribir('ordenesCompra/OC-67-A', {
    id: S('OC-67-A'), folio: S('OC-2026-0671'), activo: B(true),
    estado: S('autorizada'), origen: S('embarque'),
    embarqueId: S(EMB), embarqueFolio: S('VLIM-26-001'),
    clienteId: S(CLIENTE_ID), clienteNombre: S(CLIENTE),
    proveedorId: S('PRV-0067'), proveedorNombre: S('NAVIERA 67'),
    conceptoId: S('CON-001'), conceptoNombre: S('Flete internacional'),
    descripcion: S('Caso de la tarea 67'),
    monto: D(30000), moneda: S('MXN'),
    saldoPendiente: D(30000), montoDisponible: NULO, esAnticipo: B(false),
    facturaAsociada: S('F-NAV-6701'), comprobantePago: NULO,
    bancoSalida: S('santander_gastos'), cuentaBancariaId: S('CB-67'), cuentaSalida: NULO,
    urgencia: S('normal'), fechaRequerida: S('2026-10-15'), fechaSugeridaPago: S('2026-10-12'),
    historialEstados: { arrayValue: { values: [] } },
    anticiposCruzados: { arrayValue: { values: [] } },
    createdAt: S('2026-10-05T09:00:00.000Z'), updatedAt: S('2026-10-05T09:00:00.000Z'),
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
  await page.screenshot({ path: `${IMG}/67-${nombre}.png`, fullPage: true });
}

test('siembra los casos de pagos', async () => {
  await sembrar();
});

test('Cuentas por cobrar · cartera, KPIs y agrupado por cliente', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');

  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cuentas por cobrar', exact: true }).first().click();
  // El nombre del cliente también vive en un <option> del filtro, así que se
  // espera el folio de la factura, que solo está en la lista.
  await expect(page.getByText('A-6701').first()).toBeVisible({ timeout: 15_000 });

  // Los dos cobros (20,000 + 6,400) dejan la factura de 46,400 con 20,000 de
  // saldo: el número que la lectura unificada tiene que seguir dando.
  await expect(page.getByText('20,000.00').first()).toBeVisible();
  await foto(page, 'por-cobrar');

  await page.setViewportSize(ANCHO);
  await foto(page, 'por-cobrar-angosto');
  await ctx.close();
});

test('la ficha de la orden · el panel de fondeo con depósito y cobros', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');

  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cuentas por pagar', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Por orden' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Por orden' }).click();
  await page.getByText('OC-2026-0671').first().click();
  await expect(page.getByText('OC-2026-0671').first()).toBeVisible({ timeout: 15_000 });
  await foto(page, 'ficha-oc-fondeo');

  await page.setViewportSize(ANCHO);
  await foto(page, 'ficha-oc-fondeo-angosto');
  await ctx.close();
});

test('la ficha del cliente · su cartera en Crédito', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');

  await page.getByRole('button', { name: 'Altas', exact: true }).first().click();
  await page.waitForTimeout(800);
  await page.locator('input[placeholder*="Buscar"]').first().fill('PAGOS 67');
  await page.waitForTimeout(800);
  await page.getByRole('row').filter({ hasText: 'PAGOS 67' }).first().click();
  await expect(page.getByRole('heading', { name: CLIENTE })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /Crédito/ }).first().click();
  await expect(page.getByText(/por cobrar en/).first()).toBeVisible({ timeout: 15_000 });
  await foto(page, 'ficha-cliente-credito');

  await page.setViewportSize(ANCHO);
  await foto(page, 'ficha-cliente-credito-angosto');
  await ctx.close();
});

test('el embarque · la pestaña Facturas con sus cobros en renglones', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');

  // El embarque del recorrido, que ya trae una factura con su cobro: es el
  // renglón que ahora se pinta desde la aplicación del pago y no del cobro.
  await page.getByRole('button', { name: 'Embarques', exact: true }).first().click();
  await page.getByRole('button', { name: /^Todos los embarques/ }).first().click();
  await page.waitForTimeout(1500);
  await page.locator('tr', { hasText: /VLIM-\d{2}-\d{3}/ }).first().click();
  await expect(page.getByRole('button', { name: /^Facturas/ }).first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /^Facturas/ }).first().click();
  await page.waitForTimeout(800);
  await foto(page, 'embarque-facturas');

  await page.setViewportSize(ANCHO);
  await foto(page, 'embarque-facturas-angosto');
  await ctx.close();
});
