/**
 * capturas-61.spec.ts — vistas guardadas y columnas configurables en Finanzas.
 *
 * Siembra lo que las dos pantallas necesitan para que la tabla tenga algo que
 * decir: tres órdenes de un proveedor PROPIO —no el IDAMEX de la tarea 58, o
 * sus dos specs se contarían entre sí— y tres facturas al cliente con
 * vencimientos distintos —una vencida, una por vencer y una
 * cobrada— para que los estados de la cartera se vean.
 *
 * Requiere emuladores + app en :3100 arriba: `KEEP=1 ./scripts/e2e.sh`.
 * Se siembra con `Bearer owner` (el emulador trata ese token como Admin SDK),
 * igual que en capturas-57 y 58.
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const PW = '123456';
const IMG = 'sprint/reportes/img';

// ─── Siembra ────────────────────────────────────────────────────────────────

async function sembrarOC(oc: {
  id: string; folio: string; monto: number; moneda: string; estado: string;
  fechaPago: string; factura: string; concepto: string; creado: string;
  noPagar?: boolean;
}) {
  const r = await fetch(`${FS}/ordenesCompra/${oc.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({
      fields: {
        id: { stringValue: oc.id },
        folio: { stringValue: oc.folio },
        activo: { booleanValue: true },
        createdAt: { stringValue: oc.creado },
        updatedAt: { stringValue: oc.creado },
        estado: { stringValue: oc.estado },
        origen: { stringValue: 'oficina' },
        proveedorId: { stringValue: 'PRV-0061' },
        proveedorNombre: { stringValue: 'TRANSPORTES DEL BAJIO' },
        conceptoId: { stringValue: 'CON-001' },
        conceptoNombre: { stringValue: oc.concepto },
        descripcion: { stringValue: 'Caso de la tarea 61' },
        monto: { doubleValue: oc.monto },
        moneda: { stringValue: oc.moneda },
        saldoPendiente: { doubleValue: oc.monto },
        montoDisponible: { nullValue: null },
        esAnticipo: { booleanValue: false },
        facturaAsociada: { stringValue: oc.factura },
        bancoSalida: { stringValue: 'santander_gastos' },
        cuentaBancariaId: { stringValue: 'CB-1' },
        cuentaSalida: { nullValue: null },
        urgencia: { stringValue: 'normal' },
        fechaRequerida: { stringValue: '2026-09-28' },
        fechaSugeridaPago: { stringValue: oc.fechaPago },
        ...(oc.noPagar
          ? { noPagar: { booleanValue: true }, motivoNoPagar: { stringValue: 'Falta fondeo del cliente' } }
          : {}),
        historialEstados: { arrayValue: { values: [] } },
        anticiposCruzados: { arrayValue: { values: [] } },
      },
    }),
  });
  expect(r.ok).toBe(true);
}

async function sembrarFactura(f: {
  id: string; numero: string; cliente: string; clienteId: string;
  moneda: string; total: number; emision: string; vence: string;
}) {
  const r = await fetch(`${FS}/facturas/${f.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({
      fields: {
        id: { stringValue: f.id },
        numero: { stringValue: f.numero },
        fechaEmision: { stringValue: f.emision },
        fechaVencimiento: { stringValue: f.vence },
        diasCredito: { integerValue: '45' },
        embarqueId: { stringValue: 'EMB-61' },
        embarqueFolio: { stringValue: 'VLIM-26-001' },
        clienteId: { stringValue: f.clienteId },
        clienteNombre: { stringValue: f.cliente },
        grupoFacturacion: { nullValue: null },
        moneda: { stringValue: f.moneda },
        subtotal: { doubleValue: f.total },
        iva: { doubleValue: 0 },
        retencion: { doubleValue: 0 },
        total: { doubleValue: f.total },
        estado: { stringValue: 'emitida' },
        lineas: { arrayValue: { values: [] } },
        activo: { booleanValue: true },
        createdAt: { stringValue: `${f.emision}T09:00:00.000Z` },
        updatedAt: { stringValue: `${f.emision}T09:00:00.000Z` },
      },
    }),
  });
  expect(r.ok).toBe(true);
}

async function sembrarCobro(c: {
  id: string; facturaId: string; facturaNumero: string; monto: number; moneda: string;
}) {
  const r = await fetch(`${FS}/cobros/${c.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({
      fields: {
        id: { stringValue: c.id },
        facturaId: { stringValue: c.facturaId },
        facturaNumero: { stringValue: c.facturaNumero },
        embarqueId: { stringValue: 'EMB-61' },
        embarqueFolio: { stringValue: 'VLIM-26-001' },
        clienteId: { stringValue: 'CLI-61-A' },
        clienteNombre: { stringValue: 'FIBREMEX' },
        monto: { doubleValue: c.monto },
        moneda: { stringValue: c.moneda },
        fechaCobro: { stringValue: '2026-10-03' },
        banco: { stringValue: 'BBVA' },
        referencia: { stringValue: 'TRF-61-001' },
        activo: { booleanValue: true },
        createdAt: { stringValue: '2026-10-03T09:00:00.000Z' },
        updatedAt: { stringValue: '2026-10-03T09:00:00.000Z' },
      },
    }),
  });
  expect(r.ok).toBe(true);
}

async function sembrar() {
  await sembrarOC({ id: 'OC-61-A', folio: 'OC-2026-0611', monto: 12000, moneda: 'MXN', estado: 'autorizada', fechaPago: '2026-10-08', factura: 'F-TDB-6101', concepto: 'Maniobras en destino', creado: '2026-10-05T09:00:00.000Z' });
  await sembrarOC({ id: 'OC-61-B', folio: 'OC-2026-0612', monto: 6500, moneda: 'MXN', estado: 'autorizada', fechaPago: '2026-10-12', factura: 'F-TDB-6101', concepto: 'Almacenaje', creado: '2026-10-05T09:01:00.000Z' });
  // Una detenida con «No pagar»: es la columna nueva y el filtro nuevo.
  await sembrarOC({ id: 'OC-61-C', folio: 'OC-2026-0613', monto: 900, moneda: 'USD', estado: 'autorizada', fechaPago: '2026-10-09', factura: 'F-TDB-6102', concepto: 'Flete internacional', creado: '2026-10-05T09:02:00.000Z', noPagar: true });

  await sembrarFactura({ id: 'FAC-61-A', numero: 'A-6101', cliente: 'FIBREMEX', clienteId: 'CLI-61-A', moneda: 'MXN', total: 42000, emision: '2026-08-20', vence: '2026-09-20' });
  await sembrarFactura({ id: 'FAC-61-B', numero: 'A-6102', cliente: 'SUNWAY', clienteId: 'CLI-61-B', moneda: 'USD', total: 2200, emision: '2026-09-28', vence: '2026-10-07' });
  await sembrarFactura({ id: 'FAC-61-C', numero: 'A-6103', cliente: 'FIBREMEX', clienteId: 'CLI-61-A', moneda: 'MXN', total: 8000, emision: '2026-09-15', vence: '2026-10-30' });
  // La tercera queda cobrada completa: el estado «Cobrado» de la tabla.
  await sembrarCobro({ id: 'COB-61-A', facturaId: 'FAC-61-C', facturaNumero: 'A-6103', monto: 8000, moneda: 'MXN' });
}

/**
 * Borra las vistas guardadas de las dos pantallas antes de probarlas. Sin
 * esto, una segunda corrida —o el reintento de Playwright— deja dos vistas
 * con el mismo nombre y el selector se vuelve ambiguo.
 */
async function limpiarVistas() {
  const r = await fetch(`${FS}/vistasUsuario?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  if (!r.ok) return;
  const { documents = [] } = await r.json() as { documents?: { name: string; fields?: Record<string, { stringValue?: string }> }[] };
  for (const d of documents) {
    const modulo = d.fields?.modulo?.stringValue;
    if (modulo !== 'cuentasPorPagar' && modulo !== 'cuentasPorCobrar') continue;
    // `d.name` llega como ruta completa del recurso: projects/…/documents/…
    await fetch(`http://127.0.0.1:8080/v1/${d.name}`, {
      method: 'DELETE', headers: { Authorization: 'Bearer owner' },
    });
  }
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

async function abrirPorPagar(page: Page) {
  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cuentas por pagar', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Por orden' })).toBeVisible({ timeout: 15_000 });
  // La preferencia se guarda por usuario: se normaliza para que el orden de
  // los tests no decida qué vista se está mirando.
  await page.getByRole('button', { name: 'Por orden' }).click();
  await expect(page.getByRole('columnheader', { name: 'Folio' })).toBeVisible({ timeout: 15_000 });
}

/**
 * El renglón de una columna en el panel de configuración: el rótulo es un
 * <span> y el interruptor es el botón del ojo que está a su lado.
 */
async function ocultarColumna(page: Page, rotulo: string) {
  const fila = page.locator('div').filter({ hasText: new RegExp(`^${rotulo}$`) }).last();
  await fila.getByTitle('Ocultar').click();
}

/**
 * El panel se cierra con su telón (`fixed inset-0`), que es quien tapa todo lo
 * demás mientras está abierto: por eso el clic va a una esquina y no al botón.
 */
async function cerrarPanel(page: Page) {
  await page.mouse.click(5, 5);
  await page.waitForTimeout(200);
}

async function abrirPorCobrar(page: Page) {
  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cuentas por cobrar', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Por factura' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Por factura' }).click();
  // «Moneda» es la columna que distingue los dos modos: la tabla agrupada
  // tiene su propio encabezado «Factura», así que ese no sirve de marca.
  await expect(page.getByRole('columnheader', { name: 'Moneda', exact: true })).toBeVisible({ timeout: 15_000 });
}

// ─── 1 · Cuentas por pagar: la tabla configurable ──────────────────────────

test('Cuentas por pagar «Por orden» es la tabla configurable', async ({ browser }) => {
  await sembrar();
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPorPagar(page);

  // Las columnas de la vista por defecto, con «No pagar» y «Factura» nuevas.
  for (const h of ['Folio', 'Estado', 'Proveedor', 'Monto', 'Moneda', 'Factura', 'No pagar']) {
    await expect(page.getByRole('columnheader', { name: h, exact: true })).toBeVisible();
  }
  // §4.3 · Monto y moneda en columnas separadas: 900 USD no se ordena como
  // si fueran 900 pesos.
  await expect(page.getByRole('cell', { name: 'USD', exact: true }).first()).toBeVisible();
  // La orden detenida se ve detenida, con su motivo en el tooltip.
  await expect(page.getByTitle('Falta fondeo del cliente')).toBeVisible();

  await page.waitForTimeout(600);
  await page.screenshot({ path: `${IMG}/61-despues-por-pagar-desktop.png`, fullPage: true });

  // El armazón tiene su propio scroll: `fullPage` da el viewport, así que la
  // captura angosta se arrastra al contenedor de adentro para ver la tabla.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.getByPlaceholder(/Buscar folio/).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${IMG}/61-despues-por-pagar-movil.png`, fullPage: true });

  await ctx.close();
});

// ─── 2 · Las columnas se eligen ────────────────────────────────────────────

test('las columnas se eligen y la elegida desaparece de la tabla', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPorPagar(page);

  await expect(page.getByRole('columnheader', { name: 'Concepto', exact: true })).toBeVisible();
  await page.getByTitle('Configurar columnas').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${IMG}/61-despues-columnas-panel.png`, fullPage: false });

  // Quitar «Concepto» la saca de la tabla al instante.
  await ocultarColumna(page, 'Concepto');
  await expect(page.getByRole('columnheader', { name: 'Concepto', exact: true })).toHaveCount(0);
  await cerrarPanel(page);

  await ctx.close();
});

// ─── 3 · Una vista con nombre guarda columnas Y filtros ────────────────────

test('una vista guardada devuelve las columnas y los filtros', async ({ browser }) => {
  await limpiarVistas();
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPorPagar(page);

  // El escenario de Julio: lo autorizado, en pesos, sin «No pagar».
  await page.getByRole('button', { name: /^Autorizadas/ }).click();
  // 0613 es USD y está marcada «No pagar». Si se filtrara la moneda primero, la
  // ausencia ya no probaría el filtro de «No pagar»: por eso éste va antes.
  await expect(page.getByRole('cell', { name: 'OC-2026-0613' })).toBeVisible();
  await page.getByTitle('Flag «No pagar»').selectOption('no');
  await expect(page.getByRole('cell', { name: 'OC-2026-0611' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'OC-2026-0613' })).toHaveCount(0);
  await page.getByTitle('Moneda de la orden').selectOption('MXN');
  await expect(page.getByRole('cell', { name: 'OC-2026-0611' })).toBeVisible();

  await page.getByTitle('Guardar vista actual').click();
  await page.getByPlaceholder('Nombre de la vista...').fill('Pesos autorizados');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('button', { name: /Pesos autorizados/ })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${IMG}/61-despues-vista-guardada.png`, fullPage: true });

  // Volver a la vista por defecto limpia los filtros…
  await page.getByRole('button', { name: /Pesos autorizados/ }).click();
  await page.getByRole('button', { name: 'Vista por defecto', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'OC-2026-0613' })).toBeVisible();

  // …y volver a la vista guardada los trae de regreso, sin tocar nada más.
  await page.getByRole('button', { name: 'Vista por defecto' }).first().click();
  await page.getByRole('button', { name: 'Pesos autorizados' }).first().click();
  await expect(page.getByRole('cell', { name: 'OC-2026-0613' })).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'OC-2026-0611' })).toBeVisible();

  await ctx.close();
});

// ─── 4 · Cuentas por cobrar: la tabla y el agrupado conviven ──────────────

test('Cuentas por cobrar: «Por factura» es tabla y «Por cliente» sigue agrupando', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPorCobrar(page);

  for (const h of ['Factura', 'Cliente', 'Embarque', 'Vence', 'Resta', 'Estado']) {
    await expect(page.getByRole('columnheader', { name: h, exact: true })).toBeVisible();
  }
  // La vencida se ve vencida y la de dólares conserva su moneda (§4.3).
  await expect(page.getByRole('cell', { name: 'A-6101' })).toBeVisible();
  await expect(page.getByText('Vencido').first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'USD', exact: true }).first()).toBeVisible();

  await page.waitForTimeout(600);
  await page.screenshot({ path: `${IMG}/61-despues-por-cobrar-desktop.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.getByPlaceholder('Factura, cliente o embarque…').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${IMG}/61-despues-por-cobrar-movil.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });

  // El agrupado no se perdió: sigue con su total por cliente y por moneda.
  await expect(page.getByRole('columnheader', { name: 'Moneda', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Por cliente' }).click();
  await expect(page.getByRole('columnheader', { name: 'Moneda', exact: true })).toHaveCount(0);
  await expect(page.getByText('Debe').first()).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${IMG}/61-despues-por-cobrar-agrupado.png`, fullPage: true });

  // La preferencia sobrevive a salir y volver de la pestaña.
  await page.getByRole('button', { name: 'Cuentas por pagar', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cuentas por cobrar', exact: true }).first().click();
  await expect(page.getByText('Debe').first()).toBeVisible({ timeout: 15_000 });

  await ctx.close();
});

// ─── 5 · El CSV sale con las columnas de la vista ─────────────────────────

test('el CSV trae las columnas de la vista, no una lista fija', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPorPagar(page);

  // Se quita una columna de la vista: el archivo tiene que quedarse sin ella.
  await expect(page.getByRole('columnheader', { name: 'Proveedor', exact: true })).toBeVisible();
  await page.getByTitle('Configurar columnas').click();
  await ocultarColumna(page, 'Proveedor');
  await cerrarPanel(page);
  await expect(page.getByRole('columnheader', { name: 'Proveedor', exact: true })).toHaveCount(0);

  const descarga = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar' }).click();
  const archivo = await descarga;
  const ruta = await archivo.path();
  const texto = ruta ? await (await import('node:fs/promises')).readFile(ruta, 'utf8') : '';
  const encabezado = texto.split('\n')[0];

  expect(encabezado).toContain('"Folio"');
  expect(encabezado).toContain('"No pagar"');
  // La columna que se quitó de la vista NO está en el archivo.
  expect(encabezado).not.toContain('"Proveedor"');
  // Y el badge de estado salió como texto, no como objeto.
  expect(texto).toContain('"Autorizada"');

  await ctx.close();
});
