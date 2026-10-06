/**
 * 84-reglas-pago-grupo.spec.ts — segunda red para las reglas de dinero de la 73.
 *
 * Cada regla de `construirPagoDeGrupo` / `problemasDelGrupo` la sostenía UNA
 * aserción, el test unitario. Quien borra la regla y su test en el mismo
 * cambio dejaba la suite en verde. Aquí cada una se prueba por OTRO camino:
 * la pantalla real y el emulador de Firestore.
 *
 *   1. Anticipo cruzado: lo que sale del banco es monto − anticipo, y el pago
 *      guardado trae ese monto (total y aplicación), no el de la orden.
 *   2. Proveedores distintos: la UI nunca agrupa dos, pero una sesión con el
 *      modal abierto puede quedar vieja. Mientras está abierto otra persona
 *      cambia el proveedor de una orden; al confirmar NO se escribe nada.
 *   3. Monedas mezcladas: igual, cambiando la moneda de una orden (§4.3).
 *
 * Requiere `KEEP=1 ./scripts/e2e.sh` y luego
 * `npx playwright test tests/e2e/84-reglas-pago-grupo.spec.ts --workers=1`.
 */
import { test, expect, type Page } from '@playwright/test';

test.setTimeout(120_000);
test.describe.configure({ mode: 'serial' });

const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const PW = '123456';
const S = (stringValue: string) => ({ stringValue });
const D = (doubleValue: number) => ({ doubleValue });
const B = (booleanValue: boolean) => ({ booleanValue });
const NULO = { nullValue: null };
const ARR = (values: unknown[]) => ({ arrayValue: { values } });

async function escribir(ruta: string, fields: Record<string, unknown>, mascara: string[] = []) {
  const q = mascara.map(m => `updateMask.fieldPaths=${m}`).join('&');
  const r = await fetch(`${FS}/${ruta}${q ? `?${q}` : ''}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields }),
  });
  expect(r.ok).toBe(true);
}
async function leerDoc(ruta: string): Promise<Record<string, any>> {
  const r = await fetch(`${FS}/${ruta}`, { headers: { Authorization: 'Bearer owner' } });
  return r.json() as Promise<Record<string, any>>;
}
async function pagosDe(prefijoProveedor: string): Promise<Record<string, any>[]> {
  const r = await fetch(`${FS}/pagos?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  const d = await r.json() as { documents?: { fields: Record<string, any> }[] };
  return (d.documents ?? []).map(x => x.fields)
    .filter(f => (f?.terceroId?.stringValue ?? '').startsWith(prefijoProveedor));
}
async function borrarPagos(prefijoProveedor: string) {
  const r = await fetch(`${FS}/pagos?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  const d = await r.json() as { documents?: { name: string; fields: Record<string, any> }[] };
  for (const doc of d.documents ?? []) {
    if ((doc.fields?.terceroId?.stringValue ?? '').startsWith(prefijoProveedor)) {
      await fetch(`${FS}/pagos/${doc.name.split('/').pop()}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
    }
  }
}

interface Semilla { id: string; folio: string; monto: number; prov: string; nombre: string; anticipo?: number }

async function sembrar(prefijo: string, ocs: Semilla[]) {
  await borrarPagos(`PRV-${prefijo}`);
  await escribir(`embarques/EMB-${prefijo}`, {
    id: S(`EMB-${prefijo}`), folio: S(`VLIM-26-${prefijo}`), bitacora: ARR([]), createdAt: S('2026-10-01T09:00:00.000Z'),
  });
  for (const o of ocs) {
    await escribir(`ordenesCompra/${o.id}`, {
      id: S(o.id), folio: S(o.folio), activo: B(true), estado: S('autorizada'), origen: S('embarque'),
      embarqueId: S(`EMB-${prefijo}`), embarqueFolio: S(`VLIM-26-${prefijo}`),
      proveedorId: S(o.prov), proveedorNombre: S(o.nombre),
      conceptoId: S('CON-001'), conceptoNombre: S('Flete 84'), descripcion: S('Tarea 84'),
      monto: D(o.monto), moneda: S('MXN'), saldoPendiente: NULO, montoDisponible: NULO, esAnticipo: B(false),
      facturaAsociada: S(`F-${o.id}`), comprobantePago: NULO,
      bancoSalida: S('santander_gastos'), cuentaBancariaId: S('cta-84'), cuentaSalida: NULO,
      urgencia: S('normal'), fechaRequerida: S('2026-10-01'), fechaSugeridaPago: S('2026-10-01'),
      historialEstados: ARR([]),
      anticiposCruzados: ARR(o.anticipo ? [{ mapValue: { fields: {
        ocId: S('OC-ANT-84'), folio: S('OC-2026-0899'), montoAplicado: D(o.anticipo),
        moneda: S('MXN'), fechaPago: S('2026-09-30T10:00:00.000Z'),
      } } }] : []),
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

/** Abre el modal de «Registrar pago» de la tarjeta del proveedor. */
async function abrirModal(page: Page, nombre: string, folioPrimera: string, total: string) {
  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Programación de pagos', exact: true }).first().click();
  const cabecera = page.locator('div.bg-neutral-bg').filter({ hasText: nombre }).first();
  await expect(cabecera).toBeVisible({ timeout: 15_000 });
  const tarjeta = cabecera.locator(`xpath=ancestor::div[.//button[contains(., "${folioPrimera}")]][1]`);
  await expect(tarjeta).toContainText(total, { timeout: 15_000 });
  await tarjeta.getByRole('button', { name: 'Registrar pago' }).click();
  const modal = page.getByTestId('modal-pago-proveedor');
  await expect(modal.getByTestId('total-pago')).toContainText(total);
  return modal;
}

test('anticipo cruzado: el pago guardado es monto − anticipo, no el monto de la orden', async ({ browser }) => {
  await sembrar('8401', [
    { id: 'OC-84A', folio: 'OC-2026-0841', monto: 10000, prov: 'PRV-8401', nombre: 'IDAMEX 84A', anticipo: 2500 },
    { id: 'OC-84B', folio: 'OC-2026-0842', monto: 6000, prov: 'PRV-8401', nombre: 'IDAMEX 84A' },
  ]);
  const page = await entrar(browser, 'administracion@vermur.com');
  // 10,000 − 2,500 + 6,000: si la regla se pierde, la tarjeta diría 16,000.
  const modal = await abrirModal(page, 'IDAMEX 84A', 'OC-2026-0841', '13,500.00');
  await modal.getByLabel('Referencia de la transferencia').fill('TR-8401');
  await modal.getByRole('button', { name: 'Confirmar pago' }).click();

  await expect(async () => {
    const suyos = await pagosDe('PRV-8401');
    expect(suyos).toHaveLength(1);
    const f = suyos[0];
    expect(f.monto.doubleValue ?? Number(f.monto.integerValue)).toBe(13500);
    const montos = f.aplicaciones.arrayValue.values
      .map((v: any) => v.mapValue.fields.monto.doubleValue ?? Number(v.mapValue.fields.monto.integerValue))
      .sort((a: number, b: number) => a - b);
    expect(montos).toEqual([6000, 7500]);
  }).toPass({ timeout: 20_000 });
});

for (const caso of [
  {
    titulo: 'proveedores distintos',
    prefijo: '8402', razon: /proveedores distintos/,
    cambio: { proveedorId: S('PRV-8499'), proveedorNombre: S('OTRO 84') },
  },
  {
    titulo: 'monedas mezcladas',
    prefijo: '8403', razon: /monedas distintas/,
    cambio: { moneda: S('USD') },
  },
]) {
  test(`${caso.titulo}: con el modal abierto una orden cambia y confirmar no escribe nada`, async ({ browser }) => {
    const p = caso.prefijo;
    await sembrar(p, [
      { id: `OC-${p}A`, folio: `OC-2026-${p}1`, monto: 10000, prov: `PRV-${p}`, nombre: `IDAMEX ${p}` },
      { id: `OC-${p}B`, folio: `OC-2026-${p}2`, monto: 6000, prov: `PRV-${p}`, nombre: `IDAMEX ${p}` },
    ]);
    const page = await entrar(browser, 'administracion@vermur.com');
    const modal = await abrirModal(page, `IDAMEX ${p}`, `OC-2026-${p}1`, '16,000.00');
    await modal.getByLabel('Referencia de la transferencia').fill(`TR-${p}`);

    // Otra sesión cambia la orden B mientras este modal sigue abierto.
    await escribir(`ordenesCompra/OC-${p}B`, caso.cambio, Object.keys(caso.cambio));
    await page.waitForTimeout(2_000);

    await modal.getByRole('button', { name: 'Confirmar pago' }).click();
    await expect(modal.getByRole('alert')).toContainText(caso.razon, { timeout: 10_000 });

    // Todo o nada: ni pago, ni orden pagada.
    expect(await pagosDe(`PRV-${p}`)).toHaveLength(0);
    for (const id of [`OC-${p}A`, `OC-${p}B`]) {
      expect((await leerDoc(`ordenesCompra/${id}`)).fields.estado.stringValue).toBe('autorizada');
    }
  });
}
