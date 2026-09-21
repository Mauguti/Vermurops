/**
 * El recorrido de la prueba con el cliente (jueves 24-sep-2026).
 *
 * Los cuatro roles, de punta a punta, contra EMULADORES:
 *   Ventas         solicitud FCL con puertos y conceptos señalados
 *   Pricing        proveedor en la comparativa, elegir, versión nueva,
 *                  consolidar, PDF, enviar, marcar ganada
 *   Operaciones    abrir embarque con serie, capturar, factura de proveedor,
 *                  solicitar pago, gestionar la OC
 *   Administración depósito del cliente, autorizar y pagar, factura al
 *                  cliente, cobro, los tres cierres
 *
 * Es la definición de terminado: si esto pasa, el equipo puede hacer lo
 * mismo el jueves. Los agentes externos (n8n) se simulan por ruta: el PDF
 * y el clasificador no se pueden llamar con un token del emulador.
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const PW = '123456';

// Estado compartido entre roles.
const S = { folio: '', embarqueId: '', embarqueFolio: '', ocFolio: '' };

const PDF_FALSO = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function entrar(browser: Browser, email: string): Promise<{ page: Page; ctx: BrowserContext }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await simularAgentes(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(PW);
  await page.locator('#login-submit').click();
  await expect(page.getByText('Emuladores · producción intacta')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
  return { page, ctx };
}

async function irA(page: Page, modulo: string) {
  await page.getByRole('button', { name: modulo, exact: true }).first().click();
}

/** n8n no se puede llamar con un token del emulador: se simula la Cloud Function. */
async function simularAgentes(page: Page) {
  await page.route('**/clasificarDocumento', async route => {
    const flujo = route.request().headers()['x-vermur-flujo'];
    if (flujo === 'pdf-cotizacion') {
      await route.fulfill({ status: 200, contentType: 'application/pdf', body: PDF_FALSO });
      return;
    }
    if (flujo === 'documento-embarque') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        ok: true, tipo: 'factura_proveedor', confianza: 'alta',
        nombreOriginal: 'factura-hapag.pdf', nombrePropuesto: 'Factura HAPAG HL-77001',
        destinoSugerido: 'facturas_proveedor',
        datos: {
          numeroDocumento: 'HL-77001', fecha: '2026-09-21', emisor: 'HAPAG LLOYD A G', total: 1700, moneda: 'USD',
          conceptos: [{ descripcion: 'Ocean Freight', monto: 1500, moneda: 'USD' }, { descripcion: 'Documentation fee', monto: 200, moneda: 'USD' }],
        },
        avisos: [], requiereRevision: false,
      }) });
      return;
    }
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: `flujo no simulado: ${flujo}` }) });
  });
}

async function tokenDe(email: string): Promise<string> {
  const r = await fetch(`${AUTH}/accounts:signInWithPassword?key=emulador`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW, returnSecureToken: true }),
  });
  return (await r.json() as { idToken: string }).idToken;
}

async function leerColeccion(email: string, col: string): Promise<Record<string, unknown>[]> {
  const token = await tokenDe(email);
  const r = await fetch(`${FS}/${col}?pageSize=300`, { headers: { Authorization: `Bearer ${token}` } });
  const d = await r.json() as { documents?: { name: string; fields: Record<string, unknown> }[] };
  return (d.documents ?? []).map(doc => ({ __id: doc.name.split('/').pop(), ...plano(doc.fields) }));
}

/** Aplana el JSON de la REST de Firestore a valores simples (un nivel). */
function plano(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    const o = v as Record<string, unknown>;
    if ('stringValue' in o) out[k] = o.stringValue;
    else if ('integerValue' in o) out[k] = Number(o.integerValue);
    else if ('doubleValue' in o) out[k] = o.doubleValue;
    else if ('booleanValue' in o) out[k] = o.booleanValue;
    else if ('nullValue' in o) out[k] = null;
    else if ('mapValue' in o) out[k] = plano((o.mapValue as { fields?: Record<string, unknown> }).fields ?? {});
    else if ('arrayValue' in o) out[k] = ((o.arrayValue as { values?: unknown[] }).values ?? []).map(x => plano({ x } as never).x);
  }
  return out;
}

/** El selector que contiene una opción con ese value. Las etiquetas del formulario no están ligadas al input. */
const selectCon = (page: Page, value: string) => page.locator('select').filter({ has: page.locator(`option[value="${value}"]`) }).first();

const inputTras = (page: Page, label: string) => page.locator(`label:has-text("${label}")`).first().locator('xpath=following-sibling::*[1]');

async function elegirConcepto(page: Page, termino: string) {
  await page.getByRole('button', { name: 'Seleccionar concepto...' }).last().click();
  const buscador = page.getByPlaceholder('Buscar concepto...');
  await buscador.fill(termino);
  await page.locator('body').getByRole('button', { name: new RegExp(termino, 'i') }).first().click();
}

// ─── 1 · Ventas: la solicitud ────────────────────────────────────────────────

test('Ventas · solicita una cotización FCL con puertos y conceptos', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'ventas@vermur.com');
  await irA(page, 'CRM');
  await page.getByRole('button', { name: 'Cotizaciones', exact: true }).click();
  await page.getByRole('button', { name: /Solicitar cotización|Nueva cotización/ }).click();

  await selectCon(page, 'cliente:CLI-SEED-003').selectOption('cliente:CLI-SEED-003');
  await selectCon(page, 'importacion').selectOption('importacion');
  await page.getByRole('button', { name: 'Marítimo', exact: true }).click();

  // Puertos del catálogo
  const puertos = page.getByRole('button', { name: 'Elegir del catálogo…' });
  await puertos.first().click();
  await page.getByPlaceholder('Buscar puerto, código o país…').fill('Shanghai');
  await page.getByRole('button', { name: /Shanghai/ }).first().click();
  await page.getByRole('button', { name: 'Elegir del catálogo…' }).first().click();
  await page.getByPlaceholder('Buscar puerto, código o país…').fill('Manzanillo');
  await page.getByRole('button', { name: /Manzanillo/ }).first().click();

  await page.getByPlaceholder('18500').fill('18500');

  // Conceptos señalados del catálogo
  await page.getByRole('button', { name: 'Agregar concepto' }).click();
  await elegirConcepto(page, 'Ocean Freight');
  await page.getByRole('button', { name: 'Agregar concepto' }).click();
  await elegirConcepto(page, 'Documentation');

  await page.getByRole('button', { name: 'Enviar a Pricing' }).click();
  await expect(page.getByText(/Solicitado a Pricing|solicitado/i).first()).toBeVisible({ timeout: 15_000 });

  const cots = await leerColeccion('ventas@vermur.com', 'cotizaciones');
  const mia = cots.filter(c => c.etapa === 'solicitado_pricing' && (c.prospecto as Record<string, unknown>)?.empresa === 'Plásticos Ramírez S.A. de C.V.')
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  expect(mia, 'La solicitud no quedó en Firestore en solicitado_pricing').toBeTruthy();
  S.folio = String(mia!.__id);
  console.log('[e2e] solicitud', S.folio);
  await ctx.close();
});

// ─── 2 · Pricing: cotiza, versiona, PDF, envía, gana ─────────────────────────

test('Pricing · comparativa, elige el paquete, versión nueva, consolida y genera el PDF', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'pricing@vermur.com');
  await irA(page, 'CRM');
  await page.getByRole('button', { name: 'Bandeja Pricing' }).click();
  await page.getByText(S.folio, { exact: true }).first().click();
  await expect(page.getByText('Plásticos Ramírez', { exact: false }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Iniciar cotización' }).click();
  await page.getByRole('button', { name: /^Servicios/ }).click();

  // Comparativa: un proveedor del catálogo, sus montos, y elegir su paquete.
  await page.getByRole('button', { name: 'Agregar proveedor' }).click();
  await page.getByPlaceholder('Buscar por nombre o RFC…').fill('HAPAG LLOYD');
  await page.getByRole('button', { name: /HAPAG LLOYD A G/ }).first().click();

  const filaOcean = page.locator('tr', { has: page.locator('input[value="Ocean Freight"]') });
  await filaOcean.locator('input[type="number"]').first().fill('1500');
  const filaDoc = page.locator('tr', { has: page.locator('input[value="Documentation"]') });
  await filaDoc.locator('input[type="number"]').first().fill('200');
  await page.getByTitle(/Elegir a HAPAG LLOYD A G para TODAS las filas/).click();

  // Profit por línea, en la vista por concepto.
  await page.getByRole('tab', { name: 'Por concepto' }).click();
  await expect(page.getByText('HAPAG LLOYD A G').first()).toBeVisible();
  const lineaOcean = page.locator('tr', { hasText: 'Ocean Freight' }).filter({ has: page.getByText('HAPAG') }).first();
  await lineaOcean.locator('input[type="number"]').last().fill('300');
  const lineaDoc = page.locator('tr', { hasText: 'Documentation' }).filter({ has: page.getByText('HAPAG') }).first();
  await lineaDoc.locator('input[type="number"]').last().fill('50');

  await page.getByRole('button', { name: 'Cotizaciones recibidas' }).click();
  await page.getByRole('button', { name: 'Consolidar cotización' }).click();

  // Versión nueva: la v1 queda como registro.
  await page.getByRole('button', { name: 'Nueva versión' }).click();
  await page.getByPlaceholder(/El cliente pidió otra naviera/).fill('Ajuste de profit antes de enviar');
  await page.getByRole('button', { name: 'Crear versión' }).click();
  await expect(page.getByText(/estás en la v2/)).toBeVisible({ timeout: 15_000 });

  // PDF, en inglés y en español.
  await page.getByRole('button', { name: 'Generar PDF' }).click();
  const dl = page.waitForEvent('download');
  await page.locator('.fixed').getByRole('button', { name: 'Generar PDF' }).click();
  const archivo = await dl;
  expect(archivo.suggestedFilename()).toBe(`${S.folio} v2.pdf`);
  await expect(page.getByText(/quedó guardado como evidencia de la v2/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
  await expect(page.getByRole('link', { name: `${S.folio} v2.pdf` })).toBeVisible({ timeout: 15_000 });

  await ctx.close();
});

// ─── 2b · Ventas: envía al cliente y la marca ganada ─────────────────────────
// Pricing consolida; ENVIAR al cliente y cerrar la venta es de Ventas (§4.1:
// consolidada → enviada_cliente solo ventas/admin).

test('Ventas · envía la cotización al cliente y la marca ganada', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'ventas@vermur.com');
  await irA(page, 'CRM');
  await page.getByRole('button', { name: 'Cotizaciones', exact: true }).click();
  await page.getByText(S.folio, { exact: true }).first().click();
  await page.getByRole('button', { name: 'Enviar al cliente' }).click();
  await page.getByRole('button', { name: 'Marcar ganada' }).click();
  // La etapa se verifica en la base: en la ficha «Ganada» vive en un badge
  // que Ventas ve con otra etiqueta (línea de tiempo colapsada).
  await expect.poll(async () => {
    const cots = await leerColeccion('ventas@vermur.com', 'cotizaciones');
    return cots.find(c => c.__id === S.folio)?.etapa;
  }, { timeout: 15_000, message: 'La cotización no quedó en «ganada»' }).toBe('ganada');
  await ctx.close();
});

// ─── 3 · Operaciones: embarque con serie, captura, factura del proveedor, pago

test('Operaciones · abre el embarque con serie, captura, concilia la factura y pide el pago', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'operaciones@vermur.com');
  await irA(page, 'Embarques');
  await page.getByRole('button', { name: /^Por capturar/ }).click();
  const fila = page.locator('tr', { hasText: S.folio });
  await expect(fila).toBeVisible();
  await fila.getByRole('combobox').selectOption('VLIM');
  await fila.getByRole('button', { name: 'Abrir embarque' }).click();
  await expect(page.getByText(/^VLIM-\d{2}-\d{3}$/).first()).toBeVisible({ timeout: 15_000 });
  S.embarqueFolio = (await page.getByText(/^VLIM-\d{2}-\d{3}$/).first().textContent())!.trim();
  console.log('[e2e] embarque', S.embarqueFolio);

  // Captura mínima: guía y booking.
  await inputTras(page, 'Guía (MBL / AWB)').fill('HLCUSHA2609001');
  await inputTras(page, 'Número de Reserva (Booking)').fill('BKG-88112');
  await page.getByRole('button', { name: 'Guardar Cambios' }).click();

  // Cargos por proveedor: el grupo de Hapag, sin factura, y el pago.
  await page.getByRole('button', { name: /^Cargos/ }).click();
  await expect(page.getByText('HAPAG LLOYD A G').first()).toBeVisible();
  await expect(page.getByText('Sin factura').first()).toBeVisible();
  await page.getByRole('button', { name: 'Solicitar pago' }).first().click();
  await expect(page.getByText(/Orden OC-\d{4}-\d{4} solicitada/)).toBeVisible({ timeout: 15_000 });
  S.ocFolio = (await page.getByText(/Orden OC-\d{4}-\d{4} solicitada/).textContent())!.match(/OC-\d{4}-\d{4}/)![0];

  // Factura del proveedor: se clasifica (simulado) y se concilia.
  await page.getByRole('button', { name: /^Facturas/ }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Elegir la factura/ }).click();
  await (await chooser).setFiles({ name: 'factura-hapag.pdf', mimeType: 'application/pdf', buffer: PDF_FALSO });
  await expect(page.getByText('Conciliar factura de proveedor')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Se marcan 2 cargo\(s\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar conciliación' }).click();
  await expect(page.getByText(/Factura conciliada: 2 cargo/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /^Cargos/ }).click();
  await expect(page.getByText('En orden de compra').or(page.getByText('Facturado')).first()).toBeVisible();

  // La OC: Operaciones la toma y la gestiona.
  await irA(page, 'Finanzas');
  await page.getByRole('button', { name: 'Cuentas por pagar' }).click();
  await page.getByText(S.ocFolio).first().click();
  await page.getByRole('button', { name: 'Tomar y gestionar' }).click();
  await expect(page.getByText('En gestión').first()).toBeVisible({ timeout: 15_000 });

  const embs = await leerColeccion('operaciones@vermur.com', 'embarques');
  S.embarqueId = String(embs.find(e => e.folio === S.embarqueFolio)!.__id);

  // La conciliación precargó la OC con el número real de la factura, y el
  // total (1,700) cuadra contra el cargo de la OC (1,500): debe decir «difiere».
  const ocs = await leerColeccion('operaciones@vermur.com', 'ordenesCompra');
  const oc = ocs.find(o => o.folio === S.ocFolio)!;
  expect(String(oc.facturaAsociada)).toContain('HL-77001');
  expect((oc.facturaDatos as Record<string, unknown>).cotejo).toBe('difiere');
  await ctx.close();
});

// ─── 4 · Administración: depósito, autoriza, paga, factura, cobro, cierres ──

test('Administración · depósito, autoriza y paga la OC, factura y cobra al cliente, cierra', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await irA(page, 'Finanzas');
  await page.getByRole('button', { name: 'Cuentas por pagar' }).click();
  await page.getByText(S.ocFolio).first().click();

  // Sin fondeo no se autoriza: el depósito del cliente lo libera.
  await expect(page.getByText(/Para «Autorizar el pago»/)).toBeVisible();
  await page.getByPlaceholder('0.00').fill('5000');
  await page.getByPlaceholder('Ref. bancaria').fill('DEP-0921-001');
  await page.getByRole('button', { name: 'Registrar depósito' }).click();
  await expect(page.getByText(/Depósito de USD 5,000.00 registrado/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Autorizar el pago' }).click({ timeout: 15_000 });
  await expect(page.getByText('Autorizada').first()).toBeVisible({ timeout: 15_000 });

  await inputTras(page, 'Comprobante de pago').fill('SPEI-20260921-771');
  await inputTras(page, 'Comprobante de pago').blur();
  await page.getByRole('button', { name: 'Registrar el pago' }).click({ timeout: 15_000 });
  await expect(page.getByText(/ya está pagada/)).toBeVisible({ timeout: 15_000 });

  // La factura al cliente y su cobro, desde el embarque.
  await irA(page, 'Embarques');
  await page.getByRole('button', { name: 'Todos los embarques' }).click();
  await page.getByText(S.embarqueFolio, { exact: true }).first().click();
  await page.getByRole('button', { name: /^Facturas/ }).click();
  await page.getByPlaceholder('A-1234').fill('F-2026-1001');
  await page.getByRole('button', { name: 'Registrar factura', exact: true }).click();
  await expect(page.getByText(/Factura F-2026-1001 registrada/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Registrar cobro' }).first().click();
  // El monto: el saldo completo (el placeholder lo muestra).
  const montoCobro = inputTras(page, 'Monto');
  await montoCobro.fill((await montoCobro.getAttribute('placeholder') ?? '0').replace(/,/g, ''));
  await page.getByPlaceholder('Referencia').fill('SPEI-CLI-4411');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText(/Cobro registrado/)).toBeVisible({ timeout: 15_000 });

  // Los tres cierres.
  await page.getByRole('button', { name: /^Información/ }).click();
  for (const c of ['Cierre Operativo', 'Cierre de Pagos / Finanzas', 'Cierre Administrativo']) {
    await page.locator('div', { hasText: c }).filter({ has: page.locator('button') }).last().locator('button').last().click();
  }
  await expect(page.getByText('Entregado').first()).toBeVisible({ timeout: 15_000 });

  const embs = await leerColeccion('administracion@vermur.com', 'embarques');
  const e = embs.find(x => x.__id === S.embarqueId)!;
  expect(e.cierres).toEqual({ operativo: true, pago: true, administrativo: true });
  await ctx.close();
});
