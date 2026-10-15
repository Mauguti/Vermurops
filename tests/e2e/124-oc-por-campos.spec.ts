/**
 * Tarea 124 — la orden de compra guarda solo lo tocado.
 *
 * Administración cambia «Sale de» en la ficha de la OC; en la MISMA tarea
 * síncrona, «otra persona» (REST) marca «No pagar» y le agrega un documento.
 * La copia local de la ficha sigue vieja con certeza. Las tres cosas tienen
 * que sobrevivir: el banco elegido, el «No pagar» y el documento ajeno.
 *
 * Requiere emuladores + app en :3100 (`./scripts/e2e.sh`).
 */
import { test, expect, type Page } from '@playwright/test';
import { fijarPreferencias } from './preferencias';

test.beforeAll(async () => { await fijarPreferencias(); });
test.setTimeout(120_000);

const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const FS_RAIZ = 'projects/vermur-logistics-app/databases/(default)/documents';
const IMG = 'sprint/reportes/img';
const S = (stringValue: string) => ({ stringValue });
const D = (doubleValue: number) => ({ doubleValue });
const B = (booleanValue: boolean) => ({ booleanValue });
const NULO = { nullValue: null };
const ARR = (values: unknown[]) => ({ arrayValue: { values } });
const OWNER = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' };

async function escribir(ruta: string, fields: Record<string, unknown>) {
  const r = await fetch(`${FS}/${ruta}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields }) });
  expect(r.ok).toBe(true);
}
async function leerDoc(ruta: string): Promise<Record<string, any>> {
  return (await fetch(`${FS}/${ruta}`, { headers: OWNER })).json() as Promise<Record<string, any>>;
}

async function entrar(browser: any, email: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page: Page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill(email);
  await page.getByPlaceholder('••••••••').fill('123456');
  await page.locator('#login-submit').click();
  await expect(page.getByText('Emuladores · producción intacta')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
  return page;
}

test('mientras Administración edita la OC, «No pagar» y el documento de otra persona sobreviven', async ({ browser }) => {
  await escribir('ordenesCompra/OC-124-A', {
    id: S('OC-124-A'), folio: S('OC-2026-1241'), activo: B(true), estado: S('autorizada'), origen: S('oficina'),
    embarqueId: NULO, embarqueFolio: NULO, clienteId: NULO, clienteNombre: NULO,
    proveedorId: S('PRV-12401'), proveedorNombre: S('PROVEEDOR 124'),
    conceptoId: S('CON-001'), conceptoNombre: S('Flete 124'), descripcion: S('Tarea 124'),
    monto: D(10000), moneda: S('MXN'), saldoPendiente: NULO, montoDisponible: NULO, esAnticipo: B(false),
    facturaAsociada: S('F-124'), comprobantePago: NULO, noPagar: B(false), motivoNoPagar: NULO,
    bancoSalida: NULO, cuentaBancariaId: NULO, cuentaSalida: NULO,
    urgencia: S('normal'), fechaRequerida: S('2026-10-01'), fechaSugeridaPago: S('2026-10-01'),
    autorizadaPor: { mapValue: { fields: { uid: S('u-adm'), nombre: S('Admin 124'), fecha: S('2026-10-01T12:00:00.000Z') } } },
    historialEstados: ARR([]), anticiposCruzados: ARR([]), documentos: ARR([]),
    createdAt: S('2026-10-01T09:00:00.000Z'), updatedAt: S('2026-10-01T09:00:00.000Z'),
  });

  const page = await entrar(browser, 'administracion@vermur.com');
  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cuentas por pagar', exact: true }).first().click();
  await page.getByRole('button', { name: 'Por orden', exact: true }).click();
  await page.getByPlaceholder(/Buscar folio/).fill('PROVEEDOR 124');
  await page.getByText('OC-2026-1241').first().click();
  const select = page.locator('select').filter({ has: page.locator('option[value="bbva"]') }).first();
  await expect(select).toBeVisible({ timeout: 15_000 });
  const el = await select.elementHandle();

  await page.evaluate(({ el, FS, FS_RAIZ }) => {
    const xhr = (url: string, body: unknown, metodo: string) => {
      const r = new XMLHttpRequest();
      r.open(metodo, url, false);
      r.setRequestHeader('Content-Type', 'application/json');
      r.setRequestHeader('Authorization', 'Bearer owner');
      r.send(JSON.stringify(body));
      if (r.status >= 300) throw new Error(`${r.status} ${r.responseText}`);
    };
    xhr(`${FS}/ordenesCompra/OC-124-A?updateMask.fieldPaths=noPagar&updateMask.fieldPaths=motivoNoPagar`,
      { fields: { noPagar: { booleanValue: true }, motivoNoPagar: { stringValue: 'El cliente no ha fondeado' } } }, 'PATCH');
    xhr(`${FS}:commit`, { writes: [{ transform: {
      document: `${FS_RAIZ}/ordenesCompra/OC-124-A`,
      fieldTransforms: [{ fieldPath: 'documentos', appendMissingElements: { values: [{ mapValue: { fields: {
        id: { stringValue: 'doc-ajeno-124' }, tipo: { stringValue: 'comprobante_pago' }, nombre: { stringValue: 'ajeno-124.pdf' },
        url: { stringValue: 'http://127.0.0.1/ajeno-124.pdf' }, fecha: { stringValue: new Date().toISOString() },
        subidoPor: { stringValue: 'Otra persona' },
      } } }] } }],
    } }] }, 'POST');
    const s = el as HTMLSelectElement;
    s.value = 'bbva';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }, { el, FS, FS_RAIZ });

  await expect(async () => {
    const f = (await leerDoc('ordenesCompra/OC-124-A')).fields;
    expect(f.bancoSalida?.stringValue, 'no se guardó el banco').toBe('bbva');
    expect(f.noPagar.booleanValue, 'se perdió «No pagar» de la otra persona').toBe(true);
    expect(f.motivoNoPagar.stringValue).toBe('El cliente no ha fondeado');
    const docs = (f.documentos.arrayValue.values ?? []).map((v: any) => v.mapValue.fields.id.stringValue);
    expect(docs, 'se perdió el documento de la otra persona').toContain('doc-ajeno-124');
  }).toPass({ timeout: 20_000 });

  // La ficha adopta lo ajeno: el documento de la otra persona aparece sin recargar.
  await expect(page.getByText('ajeno-124.pdf').first()).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: `${IMG}/124-oc-escritorio.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: `${IMG}/124-oc-angosto.png`, fullPage: true });
});
