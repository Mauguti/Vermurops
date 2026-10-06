/**
 * 81-formulario-pago-proveedor.spec.ts — tarea 81 · el formulario de «Registrar pago».
 *
 * Tres órdenes autorizadas de un proveedor. Administración desmarca una, pone
 * la fecha de AYER, elige cuenta, escribe la referencia y adjunta un JPG.
 * Se comprueba: un solo pago con 2 aplicaciones y fecha de ayer; el mismo
 * comprobante ligado a las dos órdenes (misma storagePath, subido una vez);
 * la tercera sigue autorizada; y una fecha futura no deja confirmar.
 *
 * Requiere `KEEP=1 ./scripts/e2e.sh` y luego
 * `npx playwright test tests/e2e/81-formulario-pago-proveedor.spec.ts --workers=1`.
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
  { id: 'OC-81-A', folio: 'OC-2026-0811', monto: 48400, prov: 'PRV-8101', nombre: 'IDAMEX 81', factura: 'F-IDA-8111' },
  { id: 'OC-81-B', folio: 'OC-2026-0812', monto: 20000, prov: 'PRV-8101', nombre: 'IDAMEX 81', factura: 'F-IDA-8112' },
  { id: 'OC-81-C', folio: 'OC-2026-0813', monto: 5200, prov: 'PRV-8101', nombre: 'IDAMEX 81', factura: null },
  { id: 'OC-81-D', folio: 'OC-2026-0814', monto: 9000, prov: 'PRV-8102', nombre: 'OTRO PROVEEDOR 81', factura: 'F-OTR-1' },
];

async function sembrar() {
  const r = await fetch(`${FS}/pagos?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  const d = await r.json() as { documents?: { name: string; fields: Record<string, any> }[] };
  for (const doc of d.documents ?? []) {
    if ((doc.fields?.terceroId?.stringValue ?? '').startsWith('PRV-81')) await borrar(`pagos/${doc.name.split('/').pop()}`);
  }
  await escribir('embarques/EMB-81', {
    id: S('EMB-81'), folio: S('VLIM-26-081'), bitacora: ARR([]), createdAt: S('2026-10-01T09:00:00.000Z'),
  });
  for (const o of OCS) {
    await escribir(`ordenesCompra/${o.id}`, {
      id: S(o.id), folio: S(o.folio), activo: B(true), estado: S('autorizada'), origen: S('embarque'),
      embarqueId: S('EMB-81'), embarqueFolio: S('VLIM-26-081'),
      proveedorId: S(o.prov), proveedorNombre: S(o.nombre),
      conceptoId: S('CON-001'), conceptoNombre: S('Flete 81'), descripcion: S('Tarea 81'),
      monto: D(o.monto), moneda: S('MXN'), saldoPendiente: NULO, montoDisponible: NULO, esAnticipo: B(false),
      facturaAsociada: o.factura ? S(o.factura) : NULO, comprobantePago: NULO,
      bancoSalida: S('santander_gastos'), cuentaBancariaId: S('cta-81'), cuentaSalida: NULO,
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


const JPG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

function ayer(): string {
  const d = new Date(); d.setDate(d.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

test('Administración paga dos de tres órdenes con fecha de ayer y comprobante JPG', async ({ browser }) => {
  await sembrar();
  const page = await entrar(browser, 'administracion@vermur.com');
  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Programación de pagos', exact: true }).first().click();

  const cabecera = page.locator('div.bg-neutral-bg').filter({ hasText: 'IDAMEX 81' }).first();
  await expect(cabecera).toBeVisible({ timeout: 15_000 });
  const tarjeta = cabecera.locator('xpath=ancestor::div[.//button[contains(., "OC-2026-0811")]][1]');
  await expect(tarjeta).toContainText('73,600.00', { timeout: 15_000 });
  await tarjeta.getByRole('button', { name: 'Registrar pago' }).click();

  const modal = page.getByTestId('modal-pago-proveedor');
  // Todas marcadas de entrada; el total es el del grupo.
  await expect(modal.getByLabel('Incluir OC-2026-0811')).toBeChecked();
  await expect(modal.getByLabel('Incluir OC-2026-0813')).toBeChecked();
  await expect(modal.getByTestId('total-pago')).toContainText('73,600.00');
  await page.screenshot({ path: `${IMG}/81-modal-inicial.png`, fullPage: true });

  // Se desmarca la de 5,200: el total baja a lo que sí sale del banco.
  await modal.getByLabel('Incluir OC-2026-0813').uncheck();
  await expect(modal.getByTestId('total-pago')).toContainText('68,400.00');

  // Sin referencia no se confirma; con fecha futura tampoco.
  await expect(modal.getByRole('button', { name: 'Confirmar pago' })).toBeDisabled();
  await modal.getByLabel('Referencia de la transferencia').fill('TR-8101');
  await expect(modal.getByRole('button', { name: 'Confirmar pago' })).toBeEnabled();
  const manana = new Date(); manana.setDate(manana.getDate() + 1);
  const p2 = (n: number) => String(n).padStart(2, '0');
  await modal.getByLabel('Fecha del pago').fill(`${manana.getFullYear()}-${p2(manana.getMonth() + 1)}-${p2(manana.getDate())}`);
  await expect(modal.getByRole('button', { name: 'Confirmar pago' })).toBeDisabled();
  await expect(modal.getByRole('alert')).toContainText('futura');

  await modal.getByLabel('Fecha del pago').fill(ayer());
  await modal.getByLabel('Cuenta de salida').selectOption('bbva');
  await modal.getByLabel('Comprobante del pago').setInputFiles({ name: 'spei.jpg', mimeType: 'image/jpeg', buffer: JPG });
  await page.screenshot({ path: `${IMG}/81-modal-lleno.png`, fullPage: true });
  await modal.getByRole('button', { name: 'Confirmar pago' }).click();
  await expect(modal).toHaveCount(0, { timeout: 20_000 });

  // UN pago, 2 aplicaciones, fecha de ayer, cuenta y comprobante.
  let pagoFields: Record<string, any> = {};
  await expect(async () => {
    const r = await fetch(`${FS}/pagos?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
    const d = await r.json() as { documents?: { fields: Record<string, any> }[] };
    const suyos = (d.documents ?? []).filter(x => x.fields?.terceroId?.stringValue === 'PRV-8101');
    expect(suyos).toHaveLength(1);
    pagoFields = suyos[0].fields;
    expect(pagoFields.aplicaciones.arrayValue.values).toHaveLength(2);
  }).toPass({ timeout: 20_000 });
  expect(pagoFields.fecha.stringValue).toBe(ayer());
  expect(pagoFields.banco.stringValue).toBe('bbva');
  expect(pagoFields.referencia.stringValue).toBe('TR-8101');
  expect(pagoFields.monto.doubleValue ?? Number(pagoFields.monto.integerValue)).toBe(68400);
  expect(pagoFields.folio.stringValue).toMatch(/^PAG-\d{4}-\d{4}$/);
  expect(pagoFields.comprobante.mapValue.fields.nombre.stringValue).toBe('spei.jpg');

  // Las dos pagadas, con el MISMO archivo; la tercera sigue autorizada y sin él.
  const rutas: string[] = [];
  for (const id of ['OC-81-A', 'OC-81-B']) {
    await expect(async () => {
      expect((await leerDoc(`ordenesCompra/${id}`)).fields.estado.stringValue).toBe('pagada');
    }).toPass({ timeout: 15_000 });
    const docs = (await leerDoc(`ordenesCompra/${id}`)).fields.documentos.arrayValue.values;
    expect(docs).toHaveLength(1);
    expect(docs[0].mapValue.fields.tipo.stringValue).toBe('comprobante_pago');
    rutas.push(docs[0].mapValue.fields.storagePath.stringValue);
  }
  expect(rutas[0]).toBe(rutas[1]);
  expect(rutas[0]).toMatch(/^ordenesCompra\/OC-81-[AB]\/documentos\/.+spei\.jpg$/);
  const tercera = (await leerDoc('ordenesCompra/OC-81-C')).fields;
  expect(tercera.estado.stringValue).toBe('autorizada');
  expect(tercera.documentos).toBeUndefined();

  // La tarjeta conserva a la que quedó fuera.
  await expect(page.getByText('OC-2026-0813').first()).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: `${IMG}/81-despues.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: 'Registrar pago' }).first().click();
  await page.screenshot({ path: `${IMG}/81-modal-angosto.png`, fullPage: true });
});
