/**
 * Tarea 103 — volumen en la carga terrestre y modalidad en la tarifa.
 *
 *   Pricing crea una tarifa por kg cobrable con modalidad Terrestre: sin
 *   factor no se guarda; con Marítimo tampoco. Ventas solicita un terrestre de
 *   900 kg y 12 m³; Pricing ve el desglose (3,000 kg volumétrico × 250 kg/m³)
 *   y «Usar» carga el TOTAL. Una tarifa vieja sin modalidad no se toca.
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



async function sembrarTarifaTerrestre(id: string) {
  const s = (stringValue: string) => ({ stringValue });
  const n = (doubleValue: number) => ({ doubleValue });
  const r = await fetch(`${FS}/tarifas/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: {
      id: s(id), tipo: s('tarifario'), conceptoId: s('CON-008'), proveedorId: s('PRV-100'),
      puertoOrigenId: { nullValue: null }, puertoDestinoId: { nullValue: null }, terminalId: { nullValue: null },
      rutaTexto: s('TOL → MTY 103'),
      modalidad: s('terrestre'),
      precios: { mapValue: { fields: {
        monto: n(2), unidad: s('KG_COBRABLE'), minimo: n(500), factorVolumetricoKgM3: n(250),
      } } },
      moneda: s('MXN'), vigenciaTexto: s('Todo 2026'), fechaInicio: s('2026-01-01'), fechaFin: { nullValue: null },
      tiempoTransitoDias: { nullValue: null }, freeTimeDias: { nullValue: null }, condiciones: s(''),
      activo: { booleanValue: true }, origenDatos: s('manual'), creadoPor: s('e2e'),
      fechaAlta: s('2026-10-01'), updatedAt: s('2026-10-01T00:00:00.000Z'),
    } }),
  });
  expect(r.ok).toBe(true);
}

test('Pricing · la modalidad decide el factor: terrestre lo exige, marítimo no aplica', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'pricing@vermur.com');
  await irA(page, 'Tarifas');
  await page.getByRole('button', { name: 'Nueva tarifa' }).click();
  const modal = page.locator('div.fixed').filter({ hasText: 'Nueva tarifa' }).last();
  const selects = modal.locator('select');
  await selects.nth(0).selectOption({ index: 1 });
  await selects.nth(1).selectOption({ index: 1 });
  await modal.locator('select').filter({ has: page.locator('option[value="KG_COBRABLE"]') }).selectOption('KG_COBRABLE');
  await modal.getByPlaceholder('0.00').first().fill('4.5');
  await modal.getByPlaceholder(/Semestre 2026-B/).first().fill('Prueba 103');

  // Aéreo: el 167 es el default, el factor no se exige.
  await modal.getByTestId('tarifa-modalidad').selectOption('aereo');
  await expect(modal.getByText('Obligatorio: solo el aéreo tiene uno por default (167).')).toHaveCount(0);
  await expect(modal.getByTestId('tarifa-factor-vol')).toHaveAttribute('placeholder', /167/);

  // Terrestre: obligatorio.
  await modal.getByTestId('tarifa-modalidad').selectOption('terrestre');
  await expect(modal.getByText('Obligatorio: solo el aéreo tiene uno por default (167).')).toBeVisible();
  await modal.getByRole('button', { name: 'Crear tarifa' }).click();
  await expect(modal.getByText(/factor volumétrico .* obligatorio/)).toBeVisible();

  // Marítimo: no aplica, con la razón.
  await modal.getByTestId('tarifa-modalidad').selectOption('maritimo');
  await expect(modal.getByTestId('tarifa-maritimo-aviso')).toBeVisible();
  await modal.getByRole('button', { name: 'Crear tarifa' }).click();
  await expect(modal.getByText(/no aplica en marítimo/).first()).toBeVisible();

  // Terrestre con factor: se guarda con modalidad.
  await modal.getByTestId('tarifa-modalidad').selectOption('terrestre');
  await modal.getByTestId('tarifa-factor-vol').fill('250');
  await page.screenshot({ path: 'sprint/reportes/img/103-wizard-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'sprint/reportes/img/103-wizard-angosto.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await modal.getByRole('button', { name: 'Crear tarifa' }).click();
  await expect.poll(async () => {
    const t = (await leerColeccion('pricing@vermur.com', 'tarifas')).find(x => x.vigenciaTexto === 'Prueba 103');
    return t ? String(t.modalidad) : '';
  }, { timeout: 15_000 }).toBe('terrestre');
  await ctx.close();
});

test('Ventas · solicita un terrestre de 900 kg y 12 m³', async ({ browser }) => {
  await sembrarTarifaTerrestre('TAR-103-TER');
  const { page, ctx } = await entrar(browser, 'ventas@vermur.com');
  await irA(page, 'CRM');
  await page.getByRole('button', { name: 'Cotizaciones', exact: true }).click();
  await page.getByRole('button', { name: /Solicitar cotización|Nueva cotización/ }).click();
  await selectCon(page, 'cliente:CLI-SEED-003').selectOption('cliente:CLI-SEED-003');
  await selectCon(page, 'importacion').selectOption('importacion');
  await page.getByRole('button', { name: 'Terrestre', exact: true }).click();
  await page.getByPlaceholder('Ej. Planta Toluca').fill('Planta Toluca 103');
  await page.getByPlaceholder('Ej. CEDIS Monterrey').fill('CEDIS Monterrey 103');
  await page.getByPlaceholder('21000').fill('900');
  await page.getByPlaceholder('26').fill('4');
  await page.getByPlaceholder('12.5').fill('12');
  await page.screenshot({ path: 'sprint/reportes/img/103-solicitud-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'sprint/reportes/img/103-solicitud-angosto.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Agregar concepto' }).click();
  await elegirConcepto(page, 'Inland Freight');
  await page.getByRole('button', { name: 'Enviar a Pricing' }).click();
  await expect(page.getByText(/Solicitado a Pricing|solicitado/i).first()).toBeVisible({ timeout: 15_000 });

  const cots = await leerColeccion('ventas@vermur.com', 'cotizaciones');
  const mia = cots.filter(c => c.etapa === 'solicitado_pricing' && JSON.stringify(c.servicios).includes('Planta Toluca 103'))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  expect(mia, 'La solicitud terrestre no quedó en Firestore').toBeTruthy();
  expect(JSON.stringify(mia!.servicios)).toMatch(/"volumenM3":12/);
  S.folio = String(mia!.__id);
  await ctx.close();
});

test('Pricing · el panel desglosa el volumétrico terrestre y "Usar" carga el TOTAL', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'pricing@vermur.com');
  await irA(page, 'CRM');
  await page.getByRole('button', { name: 'Bandeja Pricing' }).click();
  await page.getByText(S.folio, { exact: true }).first().click();
  await page.getByRole('button', { name: 'Iniciar cotización' }).click();
  await page.getByRole('button', { name: /^Servicios/ }).click();
  await page.getByRole('button', { name: /Elegir del catálogo/ }).first().click();
  const desglose = page.getByTestId('cobrable-desglose').first();
  await expect(desglose).toBeVisible({ timeout: 15_000 });
  // 12 m³ × 250 = 3,000 kg volumétrico gana a 900 bruto; × 2/kg = 6,000.
  await expect(page.getByTestId('cobrable-formula').first()).toContainText('3,000 kg cobrable');
  await expect(page.getByTestId('cobrable-formula').first()).toContainText('= 6,000');
  await desglose.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'sprint/reportes/img/103-cotizacion-desktop.png' });

  await page.getByRole('button', { name: 'Usar', exact: true }).first().click();
  await expect.poll(async () => {
    const c = (await leerColeccion('pricing@vermur.com', 'cotizaciones')).find(x => x.__id === S.folio);
    return JSON.stringify(c?.servicios ?? '');
  }, { timeout: 15_000, message: 'La tarifa terrestre por kg cobrable no se aplicó' }).toMatch(/6000/);

  await page.setViewportSize({ width: 390, height: 844 });
  await desglose.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'sprint/reportes/img/103-cotizacion-angosto.png' });
  await ctx.close();
});
