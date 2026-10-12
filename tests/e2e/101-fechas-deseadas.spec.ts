/**
 * Tarea 101 — fechas de recolección y entrega deseadas, de la solicitud al embarque.
 *
 *   Entrega antes de recolección bloquea; una fecha pasada solo avisa.
 *   Pricing las ve; el embarque las muestra como «solicitadas» y NO pisa ETD/ETA.
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { fijarPreferencias } from './preferencias';

// Tarea 90: las vistas de Cuentas por cobrar/pagar se guardan por usuario; cada spec parte del default.
test.beforeAll(async () => { await fijarPreferencias(); });

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const PW = '123456';

// Estado compartido entre roles.
const S = { folio: '', embarqueFolio: '' };

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


// ─── 1 · Ventas ──────────────────────────────────────────────────────────────

test('Ventas · captura las fechas: la inversión bloquea, la pasada avisa', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'ventas@vermur.com');
  await irA(page, 'CRM');
  await page.getByRole('button', { name: 'Cotizaciones', exact: true }).click();
  await page.getByRole('button', { name: /Solicitar cotización|Nueva cotización/ }).click();

  await selectCon(page, 'cliente:CLI-SEED-003').selectOption('cliente:CLI-SEED-003');
  await selectCon(page, 'importacion').selectOption('importacion');
  await page.getByRole('button', { name: 'Aéreo', exact: true }).click();
  await page.getByRole('button', { name: 'Elegir aeropuerto…' }).first().click();
  await page.getByPlaceholder('Buscar puerto, código o país…').fill('Ciudad de México');
  await page.getByRole('button', { name: /Ciudad de México/ }).first().click();
  await page.getByRole('button', { name: 'Elegir aeropuerto…' }).first().click();
  await page.getByPlaceholder('Buscar puerto, código o país…').fill('Guadalajara');
  await page.getByRole('button', { name: /Guadalajara/ }).first().click();
  await page.getByPlaceholder('350').fill('120');
  await page.getByPlaceholder('4', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Agregar concepto' }).click();
  await elegirConcepto(page, 'Air Freight');

  const rec = page.locator('#fecha-recoleccion-deseada');
  const ent = page.locator('#fecha-entrega-deseada');
  await expect(rec).toBeVisible();
  await expect(ent).toBeVisible();

  // Entrega antes de la recolección: error en pantalla y NO se envía.
  await rec.fill('2030-03-20');
  await ent.fill('2030-03-10');
  await expect(page.getByTestId('fechas-deseadas').getByRole('alert')).toContainText('antes de la recolección');
  await page.getByRole('button', { name: 'Enviar a Pricing' }).click();
  // El aviso lo dice y la solicitud no se envió.
  await expect(page.getByTestId('dialogo')).toContainText('antes de la recolección');
  await page.getByTestId('dialogo').getByRole('button').click();
  await expect(page.getByTestId('dialogo')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Enviar a Pricing' })).toBeVisible();
  await page.screenshot({ path: 'sprint/reportes/img/101-solicitud-error-desktop.png', fullPage: true });

  // Una fecha pasada solo avisa.
  await rec.fill('2020-01-05');
  await ent.fill('2030-03-10');
  await expect(page.getByTestId('fechas-deseadas')).toContainText('ya pasó');
  await expect(page.getByTestId('fechas-deseadas').getByRole('alert')).toHaveCount(0);

  // Y la definitiva, futura y coherente.
  await rec.fill('2030-03-05');
  await ent.fill('2030-03-10');
  await page.getByRole('button', { name: 'Enviar a Pricing' }).click();
  await expect(page.getByText(/Solicitado a Pricing|solicitado/i).first()).toBeVisible({ timeout: 15_000 });

  const cots = await leerColeccion('ventas@vermur.com', 'cotizaciones');
  const mia = cots.filter(c => c.etapa === 'solicitado_pricing' && c.fechaEntregaDeseada === '2030-03-10')
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  expect(mia, 'La solicitud con fechas no quedó en Firestore').toBeTruthy();
  expect(mia!.fechaRecoleccionDeseada).toBe('2030-03-05');
  S.folio = String(mia!.__id);
  await ctx.close();

  // Pricing las ve en la ficha.
  const pr = await entrar(browser, 'pricing@vermur.com');
  await irA(pr.page, 'CRM');
  await pr.page.getByRole('button', { name: 'Bandeja Pricing' }).click();
  await pr.page.getByText(S.folio, { exact: true }).first().click();
  await pr.page.getByRole('button', { name: 'Información' }).click();
  await expect(pr.page.locator('#fecha-recoleccion-deseada')).toHaveValue('2030-03-05', { timeout: 15_000 });
  await expect(pr.page.locator('#fecha-entrega-deseada')).toHaveValue('2030-03-10');
  await pr.page.screenshot({ path: 'sprint/reportes/img/101-ficha-pricing-desktop.png', fullPage: true });
  await pr.page.setViewportSize({ width: 390, height: 844 });
  await pr.page.screenshot({ path: 'sprint/reportes/img/101-ficha-pricing-angosto.png', fullPage: true });
  await pr.ctx.close();
});

// ─── 2 · Pricing arma, Administración valida, Ventas gana ────────────────────

test('Pricing · arma el paquete del aéreo expeditado', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'pricing@vermur.com');
  await irA(page, 'CRM');
  await page.getByRole('button', { name: 'Bandeja Pricing' }).click();
  await page.getByText(S.folio, { exact: true }).first().click();
  await page.getByRole('button', { name: 'Iniciar cotización' }).click();
  await page.getByRole('button', { name: /^Servicios/ }).click();

  await page.getByRole('button', { name: 'Agregar proveedor' }).click();
  await page.getByPlaceholder('Buscar por nombre o RFC…').fill('HAPAG LLOYD');
  await page.getByRole('button', { name: /HAPAG LLOYD A G/ }).first().click();
  const fila = page.locator('tr', { has: page.locator('input[value="Air Freight"]') });
  await fila.locator('input[type="number"]').first().fill('900');
  await page.getByTitle(/Elegir a HAPAG LLOYD A G para TODAS las filas/).click();

  await page.getByRole('tab', { name: 'Por concepto' }).click();
  const linea = page.locator('tr', { hasText: 'Air Freight' }).filter({ has: page.getByText('HAPAG') }).first();
  await linea.locator('input[type="number"]').last().fill('150');

  await page.getByRole('button', { name: 'Cotizaciones recibidas' }).click();
  await page.getByRole('button', { name: 'Armar cotización' }).click();
  await expect.poll(async () => {
    const cots = await leerColeccion('pricing@vermur.com', 'cotizaciones');
    return cots.find(c => c.__id === S.folio)?.etapa;
  }, { timeout: 15_000, message: 'La cotización no quedó consolidada' }).toBe('consolidada');
  await ctx.close();
});

test('Administración · valida el expediente del cliente', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await irA(page, 'Altas');
  await page.getByPlaceholder('Buscar por razón social, RFC, representante...').fill('Plásticos Ramírez S.A. de C.V.');
  await page.getByText('Plásticos Ramírez S.A. de C.V.').first().click();
  await page.getByRole('button', { name: 'Expediente' }).click();
  const yaValidado = page.getByText(/Validado por/);
  const notas = page.getByPlaceholder(/Notas|checklist/);
  await expect(yaValidado.or(notas).first()).toBeVisible({ timeout: 15_000 });
  if (await yaValidado.count() > 0 && !(await notas.isVisible().catch(() => false))) { await ctx.close(); return; }
  await notas.fill('Prueba: expediente físico completo en archivo de Administración.');
  await page.getByRole('button', { name: /Validar expediente|Validar formalmente/ }).click();
  await expect(page.getByText(/Validado por/)).toBeVisible({ timeout: 15_000 });
  await ctx.close();
});

test('Ventas · envía al cliente y marca ganada', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'ventas@vermur.com');
  await irA(page, 'CRM');
  await page.getByRole('button', { name: 'Cotizaciones', exact: true }).click();
  await page.getByText(S.folio, { exact: true }).first().click();
  await page.getByRole('button', { name: 'Enviar al cliente' }).click();
  await page.getByRole('button', { name: 'Marcar ganada' }).click();
  await page.getByTestId('dialogo').getByRole('button', { name: 'Marcar ganada' }).click();
  await expect.poll(async () => {
    const cots = await leerColeccion('ventas@vermur.com', 'cotizaciones');
    return cots.find(c => c.__id === S.folio)?.etapa;
  }, { timeout: 15_000, message: 'La cotización no quedó en «ganada»' }).toBe('ganada');
  await ctx.close();
});

// ─── 3 · Operaciones: las fechas llegan como «solicitadas» ───────────────────

test('Operaciones · el embarque muestra las fechas del cliente sin tocar ETD/ETA', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'operaciones@vermur.com');
  await irA(page, 'Embarques');
  await page.getByRole('button', { name: /^Por capturar/ }).click();
  const fila = page.locator('tr', { hasText: S.folio });
  await expect(fila).toBeVisible();
  await fila.getByRole('combobox').selectOption('VLIA');
  await fila.getByRole('button', { name: 'Abrir embarque' }).click();
  await expect(page.getByText(/^VLIA-\d{2}-\d{3}$/).first()).toBeVisible({ timeout: 15_000 });
  S.embarqueFolio = (await page.getByText(/^VLIA-\d{2}-\d{3}$/).first().textContent())!.trim();

  const bloque = page.getByTestId('fechas-deseadas-lectura');
  await expect(bloque).toContainText('5 mar 2030', { timeout: 15_000 });
  await expect(bloque).toContainText('10 mar 2030');
  await expect(bloque).toContainText('Solicitadas por el cliente');

  // ETD y ETA siguen siendo de Operaciones: vacíos, no heredaron nada.
  await expect(page.locator('input[type="date"]').first()).toHaveValue('');
  const embs = await leerColeccion('operaciones@vermur.com', 'embarques');
  const e = embs.find(x => x.folio === S.embarqueFolio)!;
  const fechas = e.fechas as Record<string, string>;
  expect(fechas.salida || '').toBe('');
  expect(fechas.arribo || '').toBe('');
  expect(JSON.stringify(e)).not.toContain('2030-03-05');

  await page.screenshot({ path: 'sprint/reportes/img/101-embarque-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'sprint/reportes/img/101-embarque-angosto.png', fullPage: true });
  await ctx.close();
});
