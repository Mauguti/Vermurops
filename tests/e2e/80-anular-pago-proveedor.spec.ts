/**
 * 80-anular-pago-proveedor.spec.ts — tarea 80 · la pestaña Pagos muestra los
 * pagos a proveedor y anular uno regresa sus órdenes a «autorizada».
 *
 * (Parte del 73: mismo sembrado y misma entrada.)

 *
 * Requiere `KEEP=1 ./scripts/e2e.sh` y luego
 * `npx playwright test tests/e2e/80-anular-pago-proveedor.spec.ts --workers=1`.
 */
import { test, expect, type Page } from '@playwright/test';

test.setTimeout(120_000);

const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const PW = '123456';
const IMG = 'sprint/reportes/img';
const S = (stringValue: string) => ({ stringValue });
const D = (doubleValue: number) => ({ doubleValue });
const B = (booleanValue: boolean) => ({ booleanValue });
const NULO = { nullValue: null };
const ARR = (values: unknown[]) => ({ arrayValue: { values } });

async function escribir(ruta: string, fields: Record<string, unknown>) {
  const r = await fetch(`${FS}/${ruta}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields }),
  });
  expect(r.ok).toBe(true);
}
async function borrar(ruta: string) {
  await fetch(`${FS}/${ruta}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
}
async function leerDoc(ruta: string): Promise<Record<string, any>> {
  const r = await fetch(`${FS}/${ruta}`, { headers: { Authorization: 'Bearer owner' } });
  return r.json() as Promise<Record<string, any>>;
}


const OCS = [
  { id: 'OC-80-A', folio: 'OC-2026-0801', monto: 48400, prov: 'PRV-8001', nombre: 'IDAMEX 80' },
  { id: 'OC-80-B', folio: 'OC-2026-0802', monto: 20000, prov: 'PRV-8001', nombre: 'IDAMEX 80' },
];

async function sembrar() {
  const r = await fetch(`${FS}/pagos?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  const d = await r.json() as { documents?: { name: string; fields: Record<string, any> }[] };
  for (const doc of d.documents ?? []) {
    if ((doc.fields?.terceroId?.stringValue ?? '').startsWith('PRV-80')) await borrar(`pagos/${doc.name.split('/').pop()}`);
  }
  await escribir('embarques/EMB-80', {
    id: S('EMB-80'), folio: S('VLIM-26-080'), bitacora: ARR([]), createdAt: S('2026-10-01T09:00:00.000Z'),
  });
  for (const o of OCS) {
    await escribir(`ordenesCompra/${o.id}`, {
      id: S(o.id), folio: S(o.folio), activo: B(true), estado: S('autorizada'), origen: S('embarque'),
      embarqueId: S('EMB-80'), embarqueFolio: S('VLIM-26-080'),
      proveedorId: S(o.prov), proveedorNombre: S(o.nombre),
      conceptoId: S('CON-001'), conceptoNombre: S('Flete 80'), descripcion: S('Tarea 80'),
      monto: D(o.monto), moneda: S('MXN'), saldoPendiente: NULO, montoDisponible: NULO, esAnticipo: B(false),
      facturaAsociada: NULO, comprobantePago: NULO,
      bancoSalida: S('santander_gastos'), cuentaBancariaId: S('cta-80'), cuentaSalida: NULO,
      urgencia: S('normal'), fechaRequerida: S('2026-10-01'), fechaSugeridaPago: S('2026-10-01'),
      historialEstados: ARR([]), anticiposCruzados: ARR([]),
      createdAt: S('2026-10-01T09:00:00.000Z'), updatedAt: S('2026-10-01T09:00:00.000Z'),
    });
  }
}

async function entrar(browser: any, email: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page: Page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(PW);
  await page.locator('#login-submit').click();
  await expect(page.getByText('Emuladores · producción intacta')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
  return page;
}

async function pagarGrupo(page: Page) {
  page.on('dialog', d => { void d.accept('TR-8001'); });
  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Programación de pagos', exact: true }).first().click();
  const cabecera = page.locator('div.bg-neutral-bg').filter({ hasText: 'IDAMEX 80' }).first();
  await expect(cabecera).toBeVisible({ timeout: 15_000 });
  const tarjeta = cabecera.locator('xpath=ancestor::div[.//button[contains(., "OC-2026-0801")]][1]');
  await expect(tarjeta).toContainText('68,400.00', { timeout: 15_000 });
  await tarjeta.getByRole('button', { name: 'Registrar pago' }).click();
  for (const id of ['OC-80-A', 'OC-80-B']) {
    await expect(async () => {
      expect((await leerDoc(`ordenesCompra/${id}`)).fields.estado.stringValue).toBe('pagada');
    }).toPass({ timeout: 15_000 });
  }
}

async function pagoDelProveedor(): Promise<{ id: string; fields: Record<string, any> }> {
  const r = await fetch(`${FS}/pagos?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  const d = await r.json() as { documents?: { name: string; fields: Record<string, any> }[] };
  const suyo = (d.documents ?? []).find(x => x.fields?.terceroId?.stringValue === 'PRV-8001')!;
  return { id: suyo.name.split('/').pop()!, fields: suyo.fields };
}

async function abrirFichaDelPago(page: Page) {
  await page.getByRole('button', { name: 'Pagos', exact: true }).first().click();
  // El filtro Cliente / Proveedor deja solo las salidas.
  await page.getByTestId('filtro-lado-pago').selectOption('proveedor');
  const fila = page.getByRole('row').filter({ hasText: 'IDAMEX 80' });
  await expect(fila).toHaveCount(1, { timeout: 15_000 });
  await fila.getByRole('button', { name: 'Abrir' }).click();
  await expect(page.getByTestId('ficha-pago')).toContainText('OC-2026-0801');
}

test('Pagar un grupo y anularlo: las órdenes regresan a autorizada con motivo', async ({ browser }) => {
  await sembrar();
  const page = await entrar(browser, 'administracion@vermur.com');
  await pagarGrupo(page);
  await abrirFichaDelPago(page);

  const ficha = page.getByTestId('ficha-pago');
  await expect(ficha).toContainText('OC-2026-0802');
  await expect(ficha.getByTestId('estado-orden-pago').first()).toHaveText('pagada');
  // Sin quitar aplicación ni aplicar saldo: un pago a proveedor se anula completo.
  await expect(ficha.getByRole('button', { name: 'Quitar aplicación' })).toHaveCount(0);
  await expect(ficha.getByRole('button', { name: 'Anular pago' })).toBeEnabled();
  await page.screenshot({ path: `${IMG}/80-ficha-proveedor.png`, fullPage: true });

  await ficha.getByRole('button', { name: 'Anular pago' }).click();
  const confirmar = page.getByTestId('motivo-pago').getByRole('button', { name: 'Anular pago' });
  await expect(confirmar).toBeDisabled();
  await page.getByLabel('Motivo de la corrección').fill('La transferencia se devolvió');
  await page.screenshot({ path: `${IMG}/80-anular-motivo.png`, fullPage: true });
  await confirmar.click();
  await expect(ficha).toContainText('anulado', { timeout: 15_000 });

  for (const id of ['OC-80-A', 'OC-80-B']) {
    await expect(async () => {
      const f = (await leerDoc(`ordenesCompra/${id}`)).fields;
      expect(f.estado.stringValue).toBe('autorizada');
      expect(f.comprobantePago?.nullValue === null || f.comprobantePago === undefined).toBe(true);
      const hist = f.historialEstados.arrayValue.values as any[];
      expect(hist.at(-1).mapValue.fields.motivo.stringValue).toContain('La transferencia se devolvió');
    }).toPass({ timeout: 15_000 });
  }
  const { fields } = await pagoDelProveedor();
  expect(fields.activo.booleanValue).toBe(false);
  expect(fields.anulacion.mapValue.fields.motivo.stringValue).toBe('La transferencia se devolvió');
  await page.screenshot({ path: `${IMG}/80-anulado.png`, fullPage: true });

  // Las órdenes vuelven a Programación de pagos, listas para otro pago.
  await ficha.getByRole('button', { name: 'Cerrar' }).click();
  await page.getByRole('button', { name: 'Programación de pagos', exact: true }).first().click();
  await expect(page.locator('div.bg-neutral-bg').filter({ hasText: 'IDAMEX 80' }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('OC-2026-0801').first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: `${IMG}/80-programacion-angosto.png`, fullPage: true });
});

test('Si una orden no puede regresar, no se anula nada y la ficha dice cuál', async ({ browser }) => {
  await sembrar();
  const page = await entrar(browser, 'administracion@vermur.com');
  await pagarGrupo(page);
  // Una orden se movió por fuera: ya no está pagada.
  const b = (await leerDoc('ordenesCompra/OC-80-B')).fields;
  await escribir('ordenesCompra/OC-80-B', { ...b, estado: S('autorizada') });

  await abrirFichaDelPago(page);
  const ficha = page.getByTestId('ficha-pago');
  await expect(ficha.getByTestId('problemas-anulacion')).toContainText('OC-2026-0802', { timeout: 15_000 });
  await expect(ficha.getByTestId('anular-pago')).toBeDisabled();
  await page.screenshot({ path: `${IMG}/80-no-puede-regresar.png`, fullPage: true });

  // Nada cambió: el pago sigue vivo y la orden A sigue pagada.
  expect((await pagoDelProveedor()).fields.activo.booleanValue).toBe(true);
  expect((await leerDoc('ordenesCompra/OC-80-A')).fields.estado.stringValue).toBe('pagada');
});

test('Operaciones lee la ficha del pago a proveedor y no ve el botón de anular', async ({ browser }) => {
  await sembrar();
  const admin = await entrar(browser, 'administracion@vermur.com');
  await pagarGrupo(admin);
  const page = await entrar(browser, 'operaciones@vermur.com');
  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await abrirFichaDelPago(page);
  await expect(page.getByTestId('ficha-pago')).toContainText('OC-2026-0801');
  await expect(page.getByTestId('ficha-pago').getByRole('button', { name: 'Anular pago' })).toHaveCount(0);
});
