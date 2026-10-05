/**
 * capturas-63.spec.ts — un solo botón de documentos que clasifica el tipo.
 *
 * Comprueba lo que se puede comprobar sin el agente: que el botón único esté
 * en los tres lugares, que por casilla ya NO haya «Subir documento», y que la
 * orden de compra tenga su sección de documentos con el complemento de pago
 * entre los tipos.
 *
 * La clasificación en sí no se prueba aquí: exige n8n real, y el flujo
 * `clasificar-documento-oc` todavía no existe. Lo que sí está cubierto con
 * tests unitarios es la traducción del tipo y el veredicto del lote
 * (`lib/loteDocumentos.test.ts`).
 *
 * Requiere emuladores + app en :3100 arriba: `KEEP=1 ./scripts/e2e.sh`.
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const PW = '123456';
const IMG = 'sprint/reportes/img';

const s = (stringValue: string) => ({ stringValue });

/** Una orden de oficina para abrir su ficha y ver la sección nueva. */
async function sembrarOC() {
  const r = await fetch(`${FS}/ordenesCompra/OC-63-A`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({
      fields: {
        id: s('OC-63-A'), folio: s('OC-2026-0631'),
        activo: { booleanValue: true },
        createdAt: s('2026-10-05T09:00:00.000Z'), updatedAt: s('2026-10-05T09:00:00.000Z'),
        estado: s('en_gestion'), origen: s('oficina'),
        proveedorId: s('PRV-0063'), proveedorNombre: s('TRANSPORTES DEL BAJIO'),
        conceptoId: s('CON-001'), conceptoNombre: s('Maniobras en destino'),
        descripcion: s('Caso de la tarea 63'),
        monto: { doubleValue: 12000 }, moneda: s('MXN'),
        saldoPendiente: { doubleValue: 12000 }, montoDisponible: { nullValue: null },
        esAnticipo: { booleanValue: false },
        urgencia: s('normal'),
        fechaRequerida: s('2026-10-10'), fechaSugeridaPago: s('2026-10-12'),
        historialEstados: { arrayValue: { values: [] } },
        anticiposCruzados: { arrayValue: { values: [] } },
      },
    }),
  });
  expect(r.ok).toBe(true);
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

// ─── 1 · Expediente del cliente ─────────────────────────────────────────────

test('cliente · un solo botón «Subir documentos», sin botón por casilla', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await page.getByRole('button', { name: 'Altas', exact: true }).first().click();
  await page.getByPlaceholder('Buscar por razón social, RFC, representante...')
    .fill('Plásticos Ramírez S.A. de C.V.');
  await page.getByText('Plásticos Ramírez S.A. de C.V.').first().click();
  await page.getByRole('button', { name: 'Expediente' }).click();

  // El botón único existe una sola vez.
  await expect(page.getByRole('button', { name: /Subir documentos/ })).toHaveCount(1);
  // Y el de casilla ya no está: ninguna de las seis casillas vacías lo pinta.
  await expect(page.getByRole('button', { name: 'Subir documento', exact: true })).toHaveCount(0);
  // Las marcas manuales siguen: el documento físico en oficina sigue valiendo.
  await expect(page.getByRole('button', { name: 'Marcar en físico' }).first()).toBeVisible();

  await page.screenshot({ path: `${IMG}/63-cliente-expediente.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${IMG}/63-cliente-expediente-390.png`, fullPage: true });
  await ctx.close();
});

// ─── 2 · Expediente del proveedor ───────────────────────────────────────────

test('proveedor · el mismo botón único en su expediente', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await page.getByRole('button', { name: 'Altas', exact: true }).first().click();
  await page.getByRole('button', { name: /^Proveedores/ }).first().click();
  // El primero de la lista; cualquiera sirve para la pantalla.
  await page.locator('tbody tr').first().click();
  await page.getByRole('button', { name: /Expediente/ }).first().click();

  await expect(page.getByRole('button', { name: /Subir documentos/ })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Subir documento', exact: true })).toHaveCount(0);

  await page.screenshot({ path: `${IMG}/63-proveedor-expediente.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${IMG}/63-proveedor-expediente-390.png`, fullPage: true });
  await ctx.close();
});

// ─── 3 · Documentos de la orden de compra ───────────────────────────────────

test('orden de compra · sección de documentos con el complemento de pago', async ({ browser }) => {
  await sembrarOC();
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cuentas por pagar', exact: true }).first().click();
  await page.getByText('OC-2026-0631').first().click();

  await expect(page.getByText('Documentos de la orden')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Aquí van el complemento de pago/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Subir documentos/ })).toHaveCount(1);

  await page.screenshot({ path: `${IMG}/63-oc-documentos.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${IMG}/63-oc-documentos-390.png`, fullPage: true });
  await ctx.close();
});
