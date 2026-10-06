/**
 * 92-fecha-pago-individual.spec.ts — tarea 92 · la fecha real también al pagar UNA orden.
 *
 * Una orden de oficina autorizada el 1-oct. Desde su ficha, Administración
 * prueba una fecha anterior a la autorización y una futura (el botón
 * «Registrar el pago» se deshabilita y dice por qué), y paga con la de ayer:
 * `pagadaPor.fecha` debe ser ayer y la hora de captura queda en el historial.
 *
 * Requiere `KEEP=1 ./scripts/e2e.sh` y luego
 * `npx playwright test tests/e2e/92-fecha-pago-individual.spec.ts --workers=1`.
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
  await escribir('ordenesCompra/OC-92-A', {
    id: S('OC-92-A'), folio: S('OC-2026-0921'), activo: B(true), estado: S('autorizada'), origen: S('oficina'),
    proveedorId: S('PRV-9201'), proveedorNombre: S('PROVEEDOR 92'),
    conceptoId: S('CON-001'), conceptoNombre: S('Renta 92'), descripcion: S('Tarea 92'),
    monto: D(3000), moneda: S('MXN'), saldoPendiente: NULO, montoDisponible: NULO, esAnticipo: B(false),
    facturaAsociada: NULO, comprobantePago: S('SPEI-92'),
    bancoSalida: S('santander_gastos'), cuentaBancariaId: NULO, cuentaSalida: NULO,
    urgencia: S('normal'), fechaRequerida: S('2026-10-01'), fechaSugeridaPago: S('2026-10-01'),
    autorizadaPor: { mapValue: { fields: { uid: S('u-adm'), nombre: S('Admin 92'), fecha: S('2026-10-01T12:00:00.000Z') } } },
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

function dia(delta: number): string {
  const d = new Date(); d.setDate(d.getDate() + delta);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

test('pagar una orden desde su ficha guarda la fecha elegida y respeta la autorización', async ({ browser }) => {
  await sembrar();
  const page = await entrar(browser, 'administracion@vermur.com');
  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cuentas por pagar' }).click();
  await page.getByText('OC-2026-0921').first().click();

  const boton = page.getByRole('button', { name: 'Registrar el pago' });
  const campo = page.getByLabel('Fecha del pago');
  await expect(campo).toBeVisible({ timeout: 15_000 });
  await expect(campo).toHaveValue(dia(0));
  await expect(boton).toBeEnabled();
  await page.screenshot({ path: `${IMG}/92-ficha-escritorio.png`, fullPage: true });

  await campo.fill('2026-09-30');
  await expect(boton).toBeDisabled();
  await expect(page.getByText(/OC-2026-0921 se autorizó el 2026-10-01/)).toBeVisible();
  await page.screenshot({ path: `${IMG}/92-anterior-a-autorizacion.png`, fullPage: true });

  await campo.fill(dia(1));
  await expect(boton).toBeDisabled();
  await expect(page.getByText(/no puede ser futura/)).toBeVisible();

  await campo.fill(dia(-1));
  await expect(boton).toBeEnabled();
  await boton.click();
  await expect(page.getByText(/ya está pagada/)).toBeVisible({ timeout: 15_000 });

  const f = (await leerDoc('ordenesCompra/OC-92-A')).fields;
  expect(f.estado.stringValue).toBe('pagada');
  expect(f.pagadaPor.mapValue.fields.fecha.stringValue).toBe(dia(-1));
  const h = f.historialEstados.arrayValue.values.at(-1).mapValue.fields;
  expect(h.estado.stringValue).toBe('pagada');
  expect(h.fecha.stringValue).toMatch(/T/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${IMG}/92-angosto.png`, fullPage: true });
});
