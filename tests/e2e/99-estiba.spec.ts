/**
 * Tarea 99 — estibable y niveles de estiba.
 *
 *   Terrestre: máximo 5. Aéreo: máximo 3. Marítimo: sin tope.
 *   Un número fuera del tope se queda en el campo con su aviso y NO se guarda.
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



const S2 = { folio: '' };

async function abrirSolicitud(page: Page, modalidad: 'Terrestre' | 'Aéreo' | 'Marítimo') {
  await irA(page, 'CRM');
  await page.getByRole('button', { name: 'Cotizaciones', exact: true }).click();
  await page.getByRole('button', { name: /Solicitar cotización|Nueva cotización/ }).click();
  await selectCon(page, 'cliente:CLI-SEED-003').selectOption('cliente:CLI-SEED-003');
  await selectCon(page, 'importacion').selectOption('importacion');
  await page.getByRole('button', { name: modalidad, exact: true }).click();
}

test('Terrestre · 6 niveles no se aceptan, 5 sí', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'ventas@vermur.com');
  await abrirSolicitud(page, 'Terrestre');

  const estiba = page.getByTestId('campo-estiba');
  // Sin marcar: sin número y «Sin indicar» (no es lo mismo que «no estibable»).
  await expect(estiba.getByText('Sin indicar')).toBeVisible();
  await expect(estiba.getByTestId('niveles-estiba')).toHaveCount(0);
  await estiba.getByTestId('estibable-check').check();
  await expect(estiba.getByText('Máximo 5')).toBeVisible();

  const niveles = estiba.getByTestId('niveles-estiba');
  await niveles.fill('6');
  await expect(estiba.getByTestId('error-estiba')).toContainText('El máximo en terrestre es 5');
  await page.screenshot({ path: 'sprint/reportes/img/99-terrestre-6-escritorio.png' });
  await niveles.fill('5');
  await expect(estiba.getByTestId('error-estiba')).toHaveCount(0);

  // Desmarcar oculta el número.
  await estiba.getByTestId('estibable-check').uncheck();
  await expect(estiba.getByTestId('niveles-estiba')).toHaveCount(0);
  await estiba.getByTestId('estibable-check').check();
  await niveles.fill('4');
  await expect(estiba.getByTestId('error-estiba')).toHaveCount(0);

  await page.getByPlaceholder('Ej. Planta Toluca').fill('Planta Toluca');
  await page.getByPlaceholder('Ej. CEDIS Monterrey').fill('CEDIS Monterrey');
  await page.getByPlaceholder('21000').fill('8000');
  await page.getByPlaceholder('26', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Agregar concepto' }).click();
  await elegirConcepto(page, 'National Inland Freight Coordination');
  await page.getByRole('button', { name: 'Enviar a Pricing' }).click();
  await expect(page.getByText(/Solicitado a Pricing|solicitado/i).first()).toBeVisible({ timeout: 15_000 });

  const cots = await leerColeccion('ventas@vermur.com', 'cotizaciones');
  const mia = cots.filter(c => c.etapa === 'solicitado_pricing' && JSON.stringify(c.servicios).includes('"terrestre"'))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  expect(mia, 'La solicitud terrestre no quedó en Firestore').toBeTruthy();
  const carga = (mia!.servicios as unknown as Record<string, unknown>[])[0].carga as Record<string, unknown>;
  expect(carga.estibable).toBe(true);
  expect(carga.nivelesEstiba, 'se guardó el último valor válido, no el 6').toBe(4);
  S2.folio = String(mia!.__id);

  // Pricing lo ve en el resumen de la solicitud, con el texto nuevo.
  await ctx.close();
  const pr = await entrar(browser, 'pricing@vermur.com');
  await irA(pr.page, 'CRM');
  await pr.page.getByRole('button', { name: 'Bandeja Pricing' }).click();
  await pr.page.getByText(S2.folio, { exact: true }).first().click();
  await pr.page.getByRole('button', { name: 'Información' }).click();
  await expect(pr.page.getByTestId('campo-estiba').getByTestId('niveles-estiba')).toHaveValue('4', { timeout: 15_000 });
  await pr.ctx.close();
});

test('Aéreo · el máximo es 3', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'ventas@vermur.com');
  await abrirSolicitud(page, 'Aéreo');
  const estiba = page.getByTestId('campo-estiba');
  await estiba.getByTestId('estibable-check').check();
  await expect(estiba.getByText('Máximo 3')).toBeVisible();
  await estiba.getByTestId('niveles-estiba').fill('4');
  await expect(estiba.getByTestId('error-estiba')).toContainText('El máximo en aéreo es 3');
  await estiba.getByTestId('niveles-estiba').fill('3');
  await expect(estiba.getByTestId('error-estiba')).toHaveCount(0);
  await ctx.close();
});

test('Marítimo LCL · sin tope', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'ventas@vermur.com');
  await abrirSolicitud(page, 'Marítimo');
  await page.getByRole('button', { name: /LCL/ }).click();
  const estiba = page.getByTestId('campo-estiba');
  await expect(estiba.getByTestId('estibable-check')).toBeChecked();
  await expect(estiba.getByText('Sin tope')).toBeVisible();
  await estiba.getByTestId('niveles-estiba').fill('12');
  await expect(estiba.getByTestId('error-estiba')).toHaveCount(0);
  await estiba.getByTestId('niveles-estiba').fill('0');
  await expect(estiba.getByTestId('error-estiba')).toBeVisible();
  await ctx.close();
});

test('Angosto · el campo cabe a 390 px', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'ventas@vermur.com');
  await page.setViewportSize({ width: 390, height: 844 });
  await abrirSolicitud(page, 'Aéreo');
  const estiba = page.getByTestId('campo-estiba');
  await estiba.getByTestId('estibable-check').check();
  await estiba.getByTestId('niveles-estiba').fill('4');
  await expect(estiba.getByTestId('error-estiba')).toBeVisible();
  const caja = await estiba.boundingBox();
  expect(caja!.x + caja!.width, 'el campo no desborda el ancho').toBeLessThanOrEqual(391);
  await estiba.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'sprint/reportes/img/99-aereo-4-angosto.png' });
  await ctx.close();
});
