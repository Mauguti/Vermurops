/**
 * capturas-57.spec.ts — capturas de la tarea 57.
 *
 * Tres frentes: las siete cuentas bancarias, el expediente en OneDrive (con
 * su columna y su filtro) y las pantallas que quedaron en estado honesto al
 * quitar el folio inventado.
 *
 * Requiere emuladores + app en :3100 arriba: `KEEP=1 ./scripts/e2e.sh`.
 *
 * La orden de compra se siembra con `Bearer owner` (el emulador trata ese
 * token como Admin SDK) y con `bancoSalida: 'santander'` a propósito: es el
 * id de ANTES de las siete cuentas, y la captura tiene que probar que un
 * registro viejo se sigue viendo en el selector.
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const PW = '123456';
const IMG = 'sprint/reportes/img';
const OC_ID = 'OC-57-LEGACY';

async function sembrarOCLegacy() {
  const r = await fetch(`${FS}/ordenesCompra/${OC_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({
      fields: {
        id: { stringValue: OC_ID },
        folio: { stringValue: 'OC-2026-0057' },
        // `activo` y `createdAt` no son decoración: la consulta del hook es
        // where('activo','==',true) + orderBy('createdAt'), y sin los dos el
        // documento existe en Firestore y no sale en la bandeja.
        activo: { booleanValue: true },
        createdAt: { stringValue: '2026-10-05T12:00:00.000Z' },
        updatedAt: { stringValue: '2026-10-05T12:00:00.000Z' },
        estado: { stringValue: 'autorizada' },
        origen: { stringValue: 'oficina' },
        proveedorId: { stringValue: 'PRV-0001' },
        proveedorNombre: { stringValue: 'IDAMEX' },
        conceptoId: { stringValue: 'CON-001' },
        conceptoNombre: { stringValue: 'Flete internacional' },
        descripcion: { stringValue: 'Captura de la tarea 57: banco guardado con el id viejo.' },
        monto: { doubleValue: 18500 },
        moneda: { stringValue: 'MXN' },
        saldoPendiente: { doubleValue: 18500 },
        montoDisponible: { doubleValue: 0 },
        esAnticipo: { booleanValue: false },
        // El id viejo: antes «santander» era una sola cuenta.
        bancoSalida: { stringValue: 'santander' },
        cuentaBancariaId: { nullValue: null },
        cuentaSalida: { nullValue: null },
        urgencia: { stringValue: 'normal' },
        solicitadaPor: { stringValue: 'operaciones@vermur.com' },
        autorizadaPor: { stringValue: 'administracion@vermur.com' },
        fechaRequerida: { stringValue: '2026-10-20' },
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

// ─── 1 · Las siete cuentas, y el id viejo que se sigue viendo ───────────────

test('el selector «Sale de» ofrece las siete cuentas con su uso, y conserva el banco viejo', async ({ browser }) => {
  await sembrarOCLegacy();
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');

  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cuentas por pagar', exact: true }).first().click();
  await page.getByText('OC-2026-0057').first().click();

  const selectBanco = page.locator('select').filter({
    has: page.locator('option[value="santander_impuestos"]'),
  }).first();
  await expect(selectBanco).toBeVisible({ timeout: 15_000 });

  // Las siete de hoy, más el id viejo que traía guardado el documento.
  await expect(selectBanco.locator('option')).toHaveCount(8);
  for (const id of [
    'santander_gastos', 'santander_impuestos', 'bbva', 'banorte',
    'monex_mxn', 'monex_usd', 'partnerpay',
  ]) {
    await expect(selectBanco.locator(`option[value="${id}"]`)).toHaveCount(1);
  }
  // El valor guardado sigue siendo el que está elegido: no se pintó en la
  // primera de la lista como si alguien hubiera escogido esa.
  await expect(selectBanco).toHaveValue('santander');
  // El aviso de abajo, no la etiqueta del <option>, que dice lo mismo.
  const avisoViejo = page.locator('p', { hasText: /Elige una de las siete cuentas actuales/ });
  await expect(avisoViejo).toBeVisible();

  await selectBanco.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${IMG}/57-cuentas-oc-desktop.png`, fullPage: false });

  // Elegir una de las siete quita el aviso del registro viejo.
  await selectBanco.selectOption('santander_impuestos');
  await expect(avisoViejo).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await selectBanco.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${IMG}/57-cuentas-oc-movil.png`, fullPage: false });

  await ctx.close();
});

// ─── 2 · OneDrive: la etiqueta, la columna y el filtro ──────────────────────

test('Altas muestra la columna OneDrive y el filtro saca los que no tienen carpeta', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');

  await page.getByRole('button', { name: 'Altas', exact: true }).first().click();
  await expect(page.getByRole('columnheader', { name: 'OneDrive' })).toBeVisible({ timeout: 15_000 });

  const filtro = page.locator('select').filter({ has: page.locator('option[value="todos"]') }).first();
  await expect(filtro).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${IMG}/57-onedrive-lista-desktop.png`, fullPage: false });

  // «Sin carpeta» no puede dejar ningún «Sí» en la columna.
  await filtro.selectOption('no');
  await page.waitForTimeout(600);
  const conCarpeta = page.locator('td').filter({ hasText: /^Sí$/ });
  await expect(page.locator('td').filter({ hasText: /^No$/ }).first()).toBeVisible();
  await expect(conCarpeta).toHaveCount(0);
  await page.screenshot({ path: `${IMG}/57-onedrive-filtro-sin-carpeta-desktop.png`, fullPage: false });

  // Y «Con carpeta» no puede dejar ningún «No».
  await filtro.selectOption('si');
  await page.waitForTimeout(600);
  await expect(conCarpeta.first()).toBeVisible();
  await expect(page.locator('td').filter({ hasText: /^No$/ })).toHaveCount(0);

  await filtro.selectOption('todos');
  await page.waitForTimeout(600);

  // La ficha: la etiqueta ya dice OneDrive.
  await page.locator('tbody tr').first().click();
  await page.getByRole('button', { name: /Expediente/ }).first().click();
  await expect(page.getByText('Carpeta en OneDrive')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Carpeta creada en OneDrive')).toBeVisible();
  await expect(page.getByText(/Google Drive/)).toHaveCount(0);
  await page.getByText('Carpeta en OneDrive').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${IMG}/57-onedrive-ficha-desktop.png`, fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.getByText('Carpeta en OneDrive').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${IMG}/57-onedrive-ficha-movil.png`, fullPage: false });

  await ctx.close();
});

// ─── 3 · El folio inventado y las pantallas de ejemplo ──────────────────────

test('Facturas (CFDI) ya no anuncia un folio siguiente inventado', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'admin@vermur.com');

  // Facturas (CFDI): nada de F-2023-xxx, ni el «Folio siguiente».
  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Facturas (CFDI)', exact: true }).first().click();
  await expect(page.getByText('Módulo en desarrollo')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/F-2023/)).toHaveCount(0);
  await expect(page.getByText(/Folio siguiente/)).toHaveCount(0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${IMG}/57-facturas-cfdi-desktop.png`, fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${IMG}/57-facturas-cfdi-movil.png`, fullPage: false });
  await page.setViewportSize({ width: 1440, height: 900 });

  /*
   * Reservas y Recolecciones NO se capturan aquí, y es un hallazgo: `App.tsx`
   * las rutea y `users.ts` se las da al rol admin, pero el menú lateral no
   * tiene ninguna entrada para ellas ni con admin (el árbol del fallo de esta
   * misma corrida lo confirma: Dashboard, CRM, Embarques, Finanzas, Tipo de
   * cambio, Altas, Puertos, Tarifas, Reportes, Configuración y nada más).
   * Son rutas huérfanas: nadie llama a safeNavigate('bookings') ni
   * ('pickups'). Su contenido de ejemplo igual se quitó —el código seguía
   * ahí y una entrada de menú lo hubiera vuelto visible— pero no hay cómo
   * llegar a ellas para fotografiarlas. Queda anotado en el reporte.
   */

  await ctx.close();
});
