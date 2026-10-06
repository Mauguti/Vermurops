/**
 * 74-prefactura.spec.ts — P7 · Bloque 4: prefactura.
 *
 *   1. Operaciones marca una orden como prefactura desde su ficha (casilla +
 *      motivo) y queda escrito `esPrefactura` / `motivoPrefactura`.
 *   2. Administración NO ve la casilla editable (la marca es de Operaciones),
 *      pero sí el badge «Factura pendiente · N días» de la pagada sin factura.
 *   3. El contador del encabezado cuenta solo las MARCADAS pagadas sin
 *      factura (la pagada sin marcar no cuenta), y el filtro las aísla.
 *
 * Requiere emuladores + app en :3100: `KEEP=1 ./scripts/e2e.sh`.
 */
import { test, expect, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
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
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields }),
  });
  expect(r.ok).toBe(true);
}
async function leerDoc(ruta: string): Promise<Record<string, any>> {
  const r = await fetch(`${FS}/${ruta}`, { headers: { Authorization: 'Bearer owner' } });
  return r.json() as Promise<Record<string, any>>;
}

const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();
const actor = (dias: number) => ({ mapValue: { fields: { uid: S('u'), nombre: S('Admin'), fecha: S(hace(dias)) } } });

interface Semilla { id: string; folio: string; estado: string; marcada: boolean; dias?: number; factura?: string }
const OCS: Semilla[] = [
  { id: 'OC-74-A', folio: 'OC-2026-0741', estado: 'autorizada', marcada: false },            // la que marca Operaciones
  { id: 'OC-74-B', folio: 'OC-2026-0742', estado: 'pagada', marcada: true, dias: 12 },       // pendiente · 12 días
  { id: 'OC-74-C', folio: 'OC-2026-0743', estado: 'pagada', marcada: true, dias: 5, factura: 'F-NAV-1' }, // recibida
  { id: 'OC-74-D', folio: 'OC-2026-0744', estado: 'pagada', marcada: false, dias: 40 },      // NO es prefactura
];

async function sembrar() {
  for (const o of OCS) {
    await escribir(`ordenesCompra/${o.id}`, {
      id: S(o.id), folio: S(o.folio), activo: B(true), estado: S(o.estado), origen: S('oficina'),
      embarqueId: NULO, embarqueFolio: NULO, clienteId: NULO, clienteNombre: NULO,
      proveedorId: S('PRV-7401'), proveedorNombre: S('NAVIERA 74'),
      conceptoId: S('CON-001'), conceptoNombre: S('Flete 74'), descripcion: S('Tarea 74'),
      monto: D(1000), moneda: S('USD'), saldoPendiente: NULO, montoDisponible: NULO, esAnticipo: B(false),
      facturaAsociada: o.factura ? S(o.factura) : NULO,
      comprobantePago: o.estado === 'pagada' ? S('TR-74') : NULO,
      bancoSalida: NULO, cuentaBancariaId: NULO, cuentaSalida: NULO,
      urgencia: S('normal'), fechaRequerida: S('2026-10-01'), fechaSugeridaPago: S('2026-10-01'),
      pagadaPor: o.estado === 'pagada' ? actor(o.dias ?? 0) : NULO,
      ...(o.marcada ? { esPrefactura: B(true), motivoPrefactura: S('la naviera cobra antes') } : {}),
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

async function irAPorPagar(page: Page) {
  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cuentas por pagar', exact: true }).first().click();
  await page.getByRole('button', { name: 'Por orden', exact: true }).click();
  await page.getByPlaceholder(/Buscar folio/).fill('NAVIERA 74');
  await expect(page.getByText('OC-2026-0742').first()).toBeVisible({ timeout: 15_000 });
}

test('Operaciones marca la prefactura desde la ficha y queda guardada', async ({ browser }) => {
  await sembrar();
  const page = await entrar(browser, 'operaciones@vermur.com');
  await irAPorPagar(page);
  await page.getByText('OC-2026-0741').first().click();

  const panel = page.getByTestId('panel-prefactura');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await panel.getByRole('checkbox').check();
  await panel.getByLabel('Motivo de la prefactura').fill('la naviera cobra antes de facturar');
  await panel.getByLabel('Motivo de la prefactura').blur();

  await expect(async () => {
    const f = (await leerDoc('ordenesCompra/OC-74-A')).fields;
    expect(f.esPrefactura.booleanValue).toBe(true);
    expect(f.motivoPrefactura.stringValue).toBe('la naviera cobra antes de facturar');
  }).toPass({ timeout: 15_000 });
  await expect(page.getByText('Prefactura', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `${IMG}/74-ficha-operaciones.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: `${IMG}/74-ficha-operaciones-angosto.png`, fullPage: true });

  // Quitar la marca: la bandera vuelve a false y el motivo a null, no undefined.
  await panel.getByRole('checkbox').uncheck();
  await expect(async () => {
    const f = (await leerDoc('ordenesCompra/OC-74-A')).fields;
    expect(f.esPrefactura.booleanValue).toBe(false);
    expect(f.motivoPrefactura).toHaveProperty('nullValue');
  }).toPass({ timeout: 15_000 });
});

test('Administración ve el contador, el badge y el filtro; no edita la marca', async ({ browser }) => {
  await sembrar();
  const page = await entrar(browser, 'administracion@vermur.com');
  await irAPorPagar(page);

  // Solo B cuenta: C ya tiene factura, D no está marcada, A está sin pagar.
  const contador = page.getByTestId('contador-prefacturas');
  await expect(contador).toContainText('1 prefactura pagada sin factura');
  await expect(contador).toContainText('la más vieja de 12 días');
  await page.screenshot({ path: `${IMG}/74-bandeja-administracion.png`, fullPage: true });

  const filaB = page.getByRole('row').filter({ hasText: 'OC-2026-0742' });
  await expect(filaB).toContainText('Factura pendiente · 12 días');
  await expect(page.getByRole('row').filter({ hasText: 'OC-2026-0743' })).toContainText('Factura recibida');
  await expect(page.getByRole('row').filter({ hasText: 'OC-2026-0744' })).not.toContainText('Factura pendiente');

  // El filtro aísla las pendientes.
  await page.locator('select').filter({ hasText: 'Prefactura: indistinto' }).selectOption('pendientes');
  await expect(page.getByText('OC-2026-0742').first()).toBeVisible();
  await expect(page.getByText('OC-2026-0743')).toHaveCount(0);
  await expect(page.getByText('OC-2026-0744')).toHaveCount(0);

  // En la ficha de una marcada, Administración ve la casilla deshabilitada.
  await page.getByText('OC-2026-0742').first().click();
  const panel = page.getByTestId('panel-prefactura');
  await expect(panel.getByRole('checkbox')).toBeDisabled({ timeout: 15_000 });
  await expect(panel).toContainText('La marca la pone Operaciones');
  await page.screenshot({ path: `${IMG}/74-ficha-administracion.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: `${IMG}/74-ficha-administracion-angosto.png`, fullPage: true });
});
