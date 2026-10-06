/**
 * capturas-82.spec.ts — la ficha de la orden con un pago repartido entre dos
 * embarques: la ficha dice lo que el fondeo cuenta para ESTE embarque.
 * Requiere `KEEP=1 ./scripts/e2e.sh` (emuladores + app en :3100).
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const PW = '123456';
const IMG = 'sprint/reportes/img';

const CLIENTE_ID = 'CLI-82';
const CLIENTE = 'COBRANZA 82 SA DE CV';
const EMB = 'EMB-82-A';

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

const SEG = (uid: string) => ({ mapValue: { fields: { uid: S(uid), nombre: S('Admin'), fecha: S('2026-10-03') } } });
const apl = (id: string, num: string, monto: number) => ({ mapValue: { fields: {
  destinoTipo: S('factura'), destinoId: S(id), destinoNumero: S(num), monto: D(monto), moneda: S('MXN'), aplicadaPor: SEG('u1'),
} } });

async function sembrar() {
  await escribir(`clientes/${CLIENTE_ID}`, {
    id: S(CLIENTE_ID), nombre: S(CLIENTE), activo: B(true), rfc: S('CSS260101AA1'),
    origenDatos: S('magaya'), statusOperativo: S('ACTIVO'), numeroEntidadMagaya: S('82001'),
    createdAt: S('2026-10-01T09:00:00.000Z'), updatedAt: S('2026-10-01T09:00:00.000Z'),
  });
  for (const [id, num, emb, total] of [['FAC-82-A', 'A-8201', 'EMB-82-A', 60000], ['FAC-82-B', 'A-8202', 'EMB-82-B', 40000]] as const) {
    await escribir(`facturas/${id}`, {
      id: S(id), numero: S(num), fechaEmision: S('2026-09-10'), fechaVencimiento: S('2026-10-10'),
      diasCredito: { integerValue: '30' }, embarqueId: S(emb), embarqueFolio: S(emb),
      clienteId: S(CLIENTE_ID), clienteNombre: S(CLIENTE), grupoFacturacion: NULO, moneda: S('MXN'),
      subtotal: D(total), iva: D(0), retencion: D(0), total: D(total), estado: S('emitida'),
      lineas: { arrayValue: { values: [] } }, activo: B(true),
      createdAt: S('2026-09-10T09:00:00.000Z'), updatedAt: S('2026-09-10T09:00:00.000Z'),
    });
  }
  await escribir('ordenesCompra/OC-82-A', {
    id: S('OC-82-A'), folio: S('OC-2026-0821'), activo: B(true), estado: S('en_gestion'), origen: S('embarque'),
    embarqueId: S('EMB-82-A'), embarqueFolio: S('EMB-82-A'), clienteId: S(CLIENTE_ID), clienteNombre: S(CLIENTE),
    proveedorId: S('PRV-0082'), proveedorNombre: S('NAVIERA 82'), conceptoId: S('CON-001'),
    conceptoNombre: S('Flete internacional'), descripcion: S('Caso de la tarea 82'),
    monto: D(50000), moneda: S('MXN'), saldoPendiente: D(50000), montoDisponible: NULO, esAnticipo: B(false),
    facturaAsociada: NULO, comprobantePago: NULO, bancoSalida: NULO, cuentaBancariaId: NULO, cuentaSalida: NULO,
    urgencia: S('normal'), fechaRequerida: S('2026-10-20'), fechaSugeridaPago: S('2026-10-16'),
    historialEstados: { arrayValue: { values: [] } }, anticiposCruzados: { arrayValue: { values: [] } },
    createdAt: S('2026-10-05T09:00:00.000Z'), updatedAt: S('2026-10-05T09:00:00.000Z'),
  });
  // UN pago de 100,000 repartido: 60,000 a la factura del embarque A y 40,000 a la del B.
  await escribir('pagos/PAG-82', {
    id: S('PAG-82'), folio: S('PAG-2026-0820'), lado: S('cliente'), terceroTipo: S('cliente'),
    terceroId: S(CLIENTE_ID), terceroNombre: S(CLIENTE), monto: D(100000), moneda: S('MXN'),
    fecha: S('2026-10-03'), banco: NULO, referencia: S('SPEI-82'), comprobante: NULO,
    aplicaciones: { arrayValue: { values: [apl('FAC-82-A', 'A-8201', 60000), apl('FAC-82-B', 'A-8202', 40000)] } },
    destinoIds: { arrayValue: { values: [S('FAC-82-A'), S('FAC-82-B')] } },
    embarqueIds: { arrayValue: { values: [S('EMB-82-A'), S('EMB-82-B')] } },
    activo: B(true), createdAt: S('2026-10-03T09:00:00.000Z'), updatedAt: S('2026-10-03T09:00:00.000Z'),
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
  await page.screenshot({ path: `${IMG}/82-${nombre}.png`, fullPage: true });
}

async function abrirOC(page: Page, folio: string) {
  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cuentas por pagar', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Por orden' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Por orden' }).click();
  await page.getByText(folio).first().click();
  await expect(page.getByText(folio).first()).toBeVisible({ timeout: 15_000 });
}

test('siembra el pago repartido', async () => { await sembrar(); });

test('la ficha de la orden cuenta solo lo que le toca a su embarque', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirOC(page, 'OC-2026-0821');

  // Lo que el fondeo cuenta para el embarque A: 60,000, no los 100,000 del pago.
  await expect(page.getByText(/MXN 60,000\.00/).first()).toBeVisible();
  await expect(page.getByText('de 100,000.00 del pago')).toBeVisible();
  await expect(page.getByText('contra A-8201')).toBeVisible();
  // Positivo de la ausencia: la factura del otro embarque no se lista aquí.
  await expect(page.getByText(/A-8202/)).toHaveCount(0);
  await foto(page, 'ficha-oc-pago-repartido');

  await page.setViewportSize(ANCHO);
  await foto(page, 'ficha-oc-pago-repartido-angosto');
  await ctx.close();
});
