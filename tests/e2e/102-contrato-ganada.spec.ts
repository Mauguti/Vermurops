/**
 * Tarea 102 — contrato de la cotización ganada.
 *
 *   Ganar → aviso «Sin contrato firmado» → subir contrato → marcarlo firmado →
 *   el aviso desaparece, el filtro «Ganadas sin contrato» deja de listarla y el
 *   reemplazo deja la versión anterior en Historial / Notas.
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
const S = { folio: '' };

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


// ─── 1 · Se llega a ganada ───────────────────────────────────────────────────

test('Ventas solicita, Pricing arma, Administración valida, Ventas gana', async ({ browser }) => {
  const v = await entrar(browser, 'ventas@vermur.com');
  let page = v.page;
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
  await page.getByRole('button', { name: 'Enviar a Pricing' }).click();
  await expect(page.getByText(/Solicitado a Pricing|solicitado/i).first()).toBeVisible({ timeout: 15_000 });
  const cots = await leerColeccion('ventas@vermur.com', 'cotizaciones');
  const mia = cots.filter(c => c.etapa === 'solicitado_pricing')
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  expect(mia, 'La solicitud no quedó en Firestore').toBeTruthy();
  S.folio = String(mia!.__id);
  await v.ctx.close();

  const p = await entrar(browser, 'pricing@vermur.com');
  page = p.page;
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
    const c = await leerColeccion('pricing@vermur.com', 'cotizaciones');
    return c.find(x => x.__id === S.folio)?.etapa;
  }, { timeout: 15_000, message: 'La cotización no quedó consolidada' }).toBe('consolidada');
  await p.ctx.close();

  const a = await entrar(browser, 'administracion@vermur.com');
  page = a.page;
  await irA(page, 'Altas');
  await page.getByPlaceholder('Buscar por razón social, RFC, representante...').fill('Plásticos Ramírez S.A. de C.V.');
  await page.getByText('Plásticos Ramírez S.A. de C.V.').first().click();
  await page.getByRole('button', { name: 'Expediente' }).click();
  const yaValidado = page.getByText(/Validado por/);
  const notas = page.getByPlaceholder(/Notas|checklist/);
  await expect(yaValidado.or(notas).first()).toBeVisible({ timeout: 15_000 });
  if (!(await yaValidado.count() > 0 && !(await notas.isVisible().catch(() => false)))) {
    await notas.fill('Prueba: expediente físico completo en archivo de Administración.');
    await page.getByRole('button', { name: /Validar expediente|Validar formalmente/ }).click();
    await expect(page.getByText(/Validado por/)).toBeVisible({ timeout: 15_000 });
  }
  await a.ctx.close();

  const v2 = await entrar(browser, 'ventas@vermur.com');
  page = v2.page;
  await irA(page, 'CRM');
  await page.getByRole('button', { name: 'Cotizaciones', exact: true }).click();
  await page.getByText(S.folio, { exact: true }).first().click();
  await page.getByRole('button', { name: 'Enviar al cliente' }).click();
  // Antes de ganar no hay sección de contrato.
  await page.getByRole('button', { name: 'Marcar ganada' }).click();
  await page.getByTestId('dialogo').getByRole('button', { name: 'Marcar ganada' }).click();
  await expect.poll(async () => {
    const c = await leerColeccion('ventas@vermur.com', 'cotizaciones');
    return c.find(x => x.__id === S.folio)?.etapa;
  }, { timeout: 15_000, message: 'La cotización no quedó en «ganada»' }).toBe('ganada');
  await v2.ctx.close();
});

// ─── 2 · El contrato ─────────────────────────────────────────────────────────

test('Ventas · sin contrato avisa, sube el contrato, lo marca firmado y el aviso se va', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'ventas@vermur.com');
  await irA(page, 'CRM');
  await page.getByRole('button', { name: 'Cotizaciones', exact: true }).click();

  // Filtro «Ganadas sin contrato»: la lista la trae.
  await page.getByRole('button', { name: /^Filtros/ }).click();
  await page.getByTestId('filtro-ganadas-sin-contrato').click();
  await expect(page.getByText(S.folio, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: 'sprint/reportes/img/102-filtro-desktop.png', fullPage: true });
  await page.getByText(S.folio, { exact: true }).first().click();

  const aviso = page.getByTestId('aviso-sin-contrato').first();
  await expect(aviso).toContainText('Sin contrato firmado', { timeout: 15_000 });
  const seccion = page.getByTestId('seccion-contrato');
  await expect(seccion).toBeVisible();
  await expect(seccion.getByRole('button', { name: 'Generar contrato' })).toBeDisabled();
  await expect(seccion).toContainText('Falta la plantilla de Vermur');

  // Un formato que no es válido se rechaza con el motivo.
  await page.getByTestId('contrato-archivo').setInputFiles({ name: 'contrato.docx', mimeType: 'application/msword', buffer: Buffer.from('x') });
  await expect(seccion.getByRole('alert')).toContainText('Solo se aceptan PDF');

  // Sube el PDF.
  await page.getByTestId('contrato-archivo').setInputFiles({ name: 'contrato-v1.pdf', mimeType: 'application/pdf', buffer: PDF_FALSO });
  await expect(seccion).toContainText('contrato-v1.pdf', { timeout: 20_000 });
  // Subido pero sin firmar: sigue avisando, con el matiz.
  await expect(page.getByTestId('aviso-sin-contrato').first()).toContainText('no se marcó como firmado');
  await expect(page.getByTestId('contrato-firmado')).not.toBeChecked();

  // Reemplazo: la anterior queda en el historial.
  await page.getByTestId('contrato-archivo').setInputFiles({ name: 'contrato-v2.pdf', mimeType: 'application/pdf', buffer: PDF_FALSO });
  await expect(seccion).toContainText('contrato-v2.pdf', { timeout: 20_000 });

  // Firmado: el aviso desaparece.
  await page.getByTestId('contrato-firmado').check();
  await expect(page.getByTestId('aviso-sin-contrato')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId('contrato-firmado')).toBeChecked();
  await page.screenshot({ path: 'sprint/reportes/img/102-ficha-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'sprint/reportes/img/102-ficha-angosto.png', fullPage: true });

  const c = (await leerColeccion('ventas@vermur.com', 'cotizaciones')).find(x => x.__id === S.folio)!;
  const contrato = c.contrato as Record<string, unknown>;
  expect(contrato.nombreArchivo).toBe('contrato-v2.pdf');
  expect(contrato.firmado).toBe(true);
  expect(String(contrato.storagePath)).toMatch(new RegExp(`^cotizaciones/${S.folio}/contrato/`));
  expect(contrato.subidoPor).toBe('ventas@vermur.com');
  const textos = JSON.stringify(c.actividades);
  expect(textos).toContain('Contrato subido');
  expect(textos).toContain('Contrato reemplazado');
  expect(textos).toContain('contrato-v1.pdf');
  expect(c.etapa).toBe('ganada'); // no bloquea ni mueve nada
  await ctx.close();

  // Y el filtro ya no la lista.
  const v = await entrar(browser, 'ventas@vermur.com');
  await irA(v.page, 'CRM');
  await v.page.getByRole('button', { name: 'Cotizaciones', exact: true }).click();
  await v.page.getByRole('button', { name: /^Filtros/ }).click();
  await v.page.getByTestId('filtro-ganadas-sin-contrato').click();
  await expect(v.page.getByText(S.folio, { exact: true })).toHaveCount(0);
  await v.ctx.close();
});

// ─── 3 · El embarque avisa si falta ──────────────────────────────────────────

test('Operaciones · el embarque de una ganada sin contrato firmado avisa; no frena', async ({ browser }) => {
  // Se quita el firmado para probar el aviso en el embarque.
  const token = await tokenDe('ventas@vermur.com');
  const r = await fetch(`${FS}/cotizaciones/${S.folio}?updateMask.fieldPaths=contrato`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: {} }),
  });
  expect(r.ok).toBeTruthy();

  const { page, ctx } = await entrar(browser, 'operaciones@vermur.com');
  await irA(page, 'Embarques');
  await page.getByRole('button', { name: /^Por capturar/ }).click();
  const fila = page.locator('tr', { hasText: S.folio });
  await expect(fila).toBeVisible();
  await fila.getByRole('combobox').selectOption('VLIA');
  await fila.getByRole('button', { name: 'Abrir embarque' }).click();
  await expect(page.getByText(/^VLIA-\d{2}-\d{3}$/).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('aviso-sin-contrato')).toContainText('Sin contrato firmado', { timeout: 15_000 });
  await page.screenshot({ path: 'sprint/reportes/img/102-embarque-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'sprint/reportes/img/102-embarque-angosto.png', fullPage: true });
  await ctx.close();
});
