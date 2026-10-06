/**
 * 73-pago-grupo-proveedor.spec.ts — P6 · Programación de pagos escribe UN pago.
 *
 * Tres órdenes autorizadas de un mismo proveedor (una SIN factura) y una de
 * otro proveedor. Administración registra el pago del grupo y se comprueba:
 *   - la tarjeta del grupo no cambia (mismas órdenes, mismo total);
 *   - existe UN documento en `pagos/` con 3 aplicaciones, lado proveedor;
 *   - las tres órdenes quedaron pagadas y cada una muestra su folio PAG-;
 *   - la orden del otro proveedor sigue autorizada.
 *
 * Requiere `KEEP=1 ./scripts/e2e.sh` y luego
 * `npx playwright test tests/e2e/73-pago-grupo-proveedor.spec.ts --workers=1`.
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
  { id: 'OC-73-A', folio: 'OC-2026-0731', monto: 48400, prov: 'PRV-7301', nombre: 'IDAMEX 73', factura: 'F-IDA-7301' },
  { id: 'OC-73-B', folio: 'OC-2026-0732', monto: 20000, prov: 'PRV-7301', nombre: 'IDAMEX 73', factura: 'F-IDA-7302' },
  { id: 'OC-73-C', folio: 'OC-2026-0733', monto: 5200, prov: 'PRV-7301', nombre: 'IDAMEX 73', factura: null },
  { id: 'OC-73-D', folio: 'OC-2026-0734', monto: 9000, prov: 'PRV-7302', nombre: 'OTRO PROVEEDOR 73', factura: 'F-OTR-1' },
];

async function sembrar() {
  const r = await fetch(`${FS}/pagos?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  const d = await r.json() as { documents?: { name: string; fields: Record<string, any> }[] };
  for (const doc of d.documents ?? []) {
    if ((doc.fields?.terceroId?.stringValue ?? '').startsWith('PRV-73')) await borrar(`pagos/${doc.name.split('/').pop()}`);
  }
  await escribir('embarques/EMB-73', {
    id: S('EMB-73'), folio: S('VLIM-26-073'), bitacora: ARR([]), createdAt: S('2026-10-01T09:00:00.000Z'),
  });
  for (const o of OCS) {
    await escribir(`ordenesCompra/${o.id}`, {
      id: S(o.id), folio: S(o.folio), activo: B(true), estado: S('autorizada'), origen: S('embarque'),
      embarqueId: S('EMB-73'), embarqueFolio: S('VLIM-26-073'),
      proveedorId: S(o.prov), proveedorNombre: S(o.nombre),
      conceptoId: S('CON-001'), conceptoNombre: S('Flete 73'), descripcion: S('Tarea 73'),
      monto: D(o.monto), moneda: S('MXN'), saldoPendiente: NULO, montoDisponible: NULO, esAnticipo: B(false),
      facturaAsociada: o.factura ? S(o.factura) : NULO, comprobantePago: NULO,
      bancoSalida: S('santander_gastos'), cuentaBancariaId: S('cta-73'), cuentaSalida: NULO,
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

test('Administración paga un grupo: un solo pago con folio, cada orden lo muestra', async ({ browser }) => {
  await sembrar();
  const page = await entrar(browser, 'administracion@vermur.com');

  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Programación de pagos', exact: true }).first().click();

  // La tarjeta del proveedor trae sus tres órdenes y el total de siempre.
  const cabecera = page.locator('div.bg-neutral-bg').filter({ hasText: 'IDAMEX 73' }).first();
  await expect(cabecera).toBeVisible({ timeout: 15_000 });
  const tarjeta = cabecera.locator('xpath=ancestor::div[.//button[contains(., "OC-2026-0731")]][1]');
  await expect(tarjeta).toContainText('OC-2026-0731', { timeout: 15_000 });
  await expect(tarjeta).toContainText('OC-2026-0733');
  await expect(tarjeta).toContainText('73,600.00');
  await page.screenshot({ path: `${IMG}/73-programacion-antes.png`, fullPage: true });

  await tarjeta.getByRole('button', { name: 'Registrar pago' }).click();
  const modal = page.getByTestId('modal-pago-proveedor');
  await expect(modal.getByTestId('total-pago')).toContainText('73,600.00');
  await modal.getByLabel('Referencia de la transferencia').fill('TR-7301');
  await modal.getByRole('button', { name: 'Confirmar pago' }).click();

  // UN documento en pagos/, lado proveedor, tres aplicaciones.
  await expect(async () => {
    const r = await fetch(`${FS}/pagos?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
    const d = await r.json() as { documents?: { fields: Record<string, any> }[] };
    const suyos = (d.documents ?? []).filter(x => x.fields?.terceroId?.stringValue === 'PRV-7301');
    expect(suyos).toHaveLength(1);
    const f = suyos[0].fields;
    expect(f.lado.stringValue).toBe('proveedor');
    expect(f.referencia.stringValue).toBe('TR-7301');
    expect(f.monto.doubleValue ?? Number(f.monto.integerValue)).toBe(73600);
    expect(f.aplicaciones.arrayValue.values).toHaveLength(3);
    expect(f.folio.stringValue).toMatch(/^PAG-\d{4}-\d{4}$/);
  }).toPass({ timeout: 20_000 });

  // Las tres pagadas; la del otro proveedor sigue autorizada.
  for (const id of ['OC-73-A', 'OC-73-B', 'OC-73-C']) {
    await expect(async () => {
      expect((await leerDoc(`ordenesCompra/${id}`)).fields.estado.stringValue).toBe('pagada');
    }).toPass({ timeout: 15_000 });
  }
  expect((await leerDoc('ordenesCompra/OC-73-D')).fields.estado.stringValue).toBe('autorizada');

  // Cada orden muestra con qué pago se cubrió.
  await page.getByRole('button', { name: 'Cuentas por pagar', exact: true }).first().click();
  await page.getByText('OC-2026-0733').first().click();
  await expect(page.getByTestId('pago-que-cubrio')).toContainText(/PAG-\d{4}-\d{4}/, { timeout: 15_000 });
  await expect(page.getByTestId('pago-que-cubrio')).toContainText('3 órdenes');
  await page.screenshot({ path: `${IMG}/73-orden-cubierta.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: `${IMG}/73-orden-cubierta-angosto.png`, fullPage: true });
});
