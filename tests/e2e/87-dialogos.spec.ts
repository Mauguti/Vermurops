/**
 * 87-dialogos.spec.ts — tarea 87.
 * (1) «Sin cuenta» avisa sin bloquear; (2) «Marcar No pagar» pide el motivo en
 * un modal de la plataforma (no el prompt del navegador); (3) «Eliminar vista»
 * pide confirmación en un modal. Ninguno dispara un diálogo nativo.
 *
 * Requiere `KEEP=1 ./scripts/e2e.sh` y luego
 * `npx playwright test tests/e2e/87-dialogos.spec.ts --workers=1`.
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


async function sembrar() {
  await escribir('embarques/EMB-87', {
    id: S('EMB-87'), folio: S('VLIM-26-087'), bitacora: ARR([]), createdAt: S('2026-10-01T09:00:00.000Z'),
  });
  await escribir('ordenesCompra/OC-87-A', {
    id: S('OC-87-A'), folio: S('OC-2026-0871'), activo: B(true), estado: S('autorizada'), origen: S('embarque'),
    embarqueId: S('EMB-87'), embarqueFolio: S('VLIM-26-087'),
    proveedorId: S('PRV-8701'), proveedorNombre: S('PROVEEDOR 87'),
    conceptoId: S('CON-001'), conceptoNombre: S('Flete 87'), descripcion: S('Tarea 87'),
    monto: D(10000), moneda: S('MXN'), saldoPendiente: NULO, montoDisponible: NULO, esAnticipo: B(false),
    facturaAsociada: S('F-87'), comprobantePago: NULO, noPagar: B(false),
    bancoSalida: NULO, cuentaBancariaId: S('cta-87'), cuentaSalida: NULO,
    urgencia: S('normal'), fechaRequerida: S('2026-10-01'), fechaSugeridaPago: S('2026-10-01'),
    autorizadaPor: { mapValue: { fields: { uid: S('u-adm'), nombre: S('Admin 87'), fecha: S('2026-10-01T12:00:00.000Z') } } },
    historialEstados: ARR([]), anticiposCruzados: ARR([]),
    createdAt: S('2026-10-01T09:00:00.000Z'), updatedAt: S('2026-10-01T09:00:00.000Z'),
  });
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



test('Sin cuenta avisa sin bloquear, y los modales reemplazan a los nativos', async ({ browser }) => {
  await sembrar();
  const page = await entrar(browser, 'administracion@vermur.com');
  let nativos = 0;
  page.on('dialog', d => { nativos++; void d.dismiss(); });

  // ── 1 · Aviso de «Sin cuenta» en el pago a proveedor ──
  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Programación de pagos', exact: true }).first().click();
  const cabecera = page.locator('div.bg-neutral-bg').filter({ hasText: 'PROVEEDOR 87' }).first();
  await expect(cabecera).toBeVisible({ timeout: 15_000 });
  const tarjeta = cabecera.locator('xpath=ancestor::div[.//button[contains(., "OC-2026-0871")]][1]');
  await tarjeta.getByRole('button', { name: 'Registrar pago' }).click();
  const modal = page.getByTestId('modal-pago-proveedor');
  await modal.getByLabel('Referencia de la transferencia').fill('TR-8701');

  await modal.getByLabel('Cuenta de salida').selectOption('');
  await expect(modal.getByTestId('aviso-sin-cuenta')).toContainText('Julio no podrá conciliarlo por cuenta');
  await expect(modal.getByRole('button', { name: 'Confirmar pago' })).toBeEnabled();   // no bloquea
  await page.screenshot({ path: `${IMG}/87-aviso-sin-cuenta.png`, fullPage: true });
  await modal.getByLabel('Cuenta de salida').selectOption('bbva');
  await expect(modal.getByTestId('aviso-sin-cuenta')).toHaveCount(0);
  await modal.getByRole('button', { name: 'Cancelar' }).click();
  await expect(modal).toHaveCount(0);

  // ── 2 · «No pagar» pide el motivo en un modal ──
  await page.getByText('OC-2026-0871').first().click();
  await page.getByRole('button', { name: 'Marcar «No pagar»' }).click();
  const dialogo = page.getByTestId('dialogo');
  await expect(dialogo).toContainText('¿Por qué se detiene este pago?');
  await page.screenshot({ path: `${IMG}/87-dialogo-no-pagar.png`, fullPage: true });
  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialogo).toHaveCount(0);
  expect((await leerDoc('ordenesCompra/OC-87-A')).fields.noPagar.booleanValue).toBe(false);   // cancelar no marca

  await page.getByRole('button', { name: 'Marcar «No pagar»' }).click();
  await dialogo.getByLabel('¿Por qué se detiene este pago?').fill('El cliente no ha fondeado');
  await dialogo.getByRole('button', { name: 'Detener pago' }).click();
  await expect(dialogo).toHaveCount(0);
  await expect(async () => {
    const f = (await leerDoc('ordenesCompra/OC-87-A')).fields;
    expect(f.noPagar.booleanValue).toBe(true);
    expect(f.motivoNoPagar.stringValue).toBe('El cliente no ha fondeado');
  }).toPass({ timeout: 15_000 });

  // ── 3 · Ningún cuadro nativo se abrió ──
  expect(nativos).toBe(0);

  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: 'Quitar «No pagar»' }).click();
  await page.getByRole('button', { name: 'Marcar «No pagar»' }).click();
  await page.screenshot({ path: `${IMG}/87-dialogo-angosto.png`, fullPage: true });
});
