/**
 * Tarea 100 — tarifas por kg cobrable.
 *
 *   Pricing crea la tarifa en el wizard (factor, mínimo y escalas; sin factor
 *   en una tarifa sin servicio aéreo NO se guarda). Ventas solicita un aéreo
 *   de 120 kg bruto y 480 kg volumétrico; Pricing ve en el panel de tarifas el
 *   desglose (bruto, volumétrico, cuál se cobró, fórmula), la usa y el costo
 *   del renglón es el TOTAL calculado, con la fórmula en las condiciones.
 *
 * Mismos helpers y emuladores que el recorrido; n8n se simula por ruta.
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



async function sembrarTarifaCobrable(id: string) {
  const s = (stringValue: string) => ({ stringValue });
  const n = (doubleValue: number) => ({ doubleValue });
  const r = await fetch(`${FS}/tarifas/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: {
      id: s(id), tipo: s('tarifario'), conceptoId: s('CON-021'), proveedorId: s('PRV-100'),
      puertoOrigenId: { nullValue: null }, puertoDestinoId: { nullValue: null }, terminalId: { nullValue: null },
      rutaTexto: s('MEX → GDL'),
      precios: { mapValue: { fields: {
        monto: n(6), unidad: s('KG_COBRABLE'), minimo: n(90),
        escalas: { arrayValue: { values: [
          { mapValue: { fields: { desdeKg: n(45), monto: n(5) } } },
          { mapValue: { fields: { desdeKg: n(100), monto: n(4) } } },
          { mapValue: { fields: { desdeKg: n(300), monto: n(3) } } },
        ] } },
      } } },
      moneda: s('USD'), vigenciaTexto: s('Todo 2026'), fechaInicio: s('2026-01-01'), fechaFin: { nullValue: null },
      tiempoTransitoDias: { nullValue: null }, freeTimeDias: { nullValue: null }, condiciones: s(''),
      activo: { booleanValue: true }, origenDatos: s('manual'), creadoPor: s('e2e'),
      fechaAlta: s('2026-10-01'), updatedAt: s('2026-10-01T00:00:00.000Z'),
    } }),
  });
  expect(r.ok).toBe(true);
}

test('Pricing · el wizard exige el factor y guarda factor, mínimo y escalas', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'pricing@vermur.com');
  await irA(page, 'Tarifas');
  await page.getByRole('button', { name: 'Nueva tarifa' }).click();
  const modal = page.locator('div.fixed').filter({ hasText: 'Nueva tarifa' }).last();

  const selects = modal.locator('select');
  await selects.nth(0).selectOption({ index: 1 });   // concepto
  await selects.nth(1).selectOption({ index: 1 });   // proveedor
  await modal.locator('select').filter({ has: page.locator('option[value="KG_COBRABLE"]') }).selectOption('KG_COBRABLE');
  await expect(modal.getByTestId('tarifa-cobrable')).toBeVisible();
  await modal.getByPlaceholder('0.00').first().fill('4.5');
  await modal.getByPlaceholder('Ej. "Semestre 2026-B"').or(modal.getByPlaceholder(/Semestre 2026-B/)).first().fill('Prueba 100');

  // Sin servicio aéreo y sin factor: no se guarda.
  await modal.getByRole('button', { name: 'Crear tarifa' }).click();
  await expect(modal.getByText(/factor volumétrico .* obligatorio/)).toBeVisible();

  await modal.getByTestId('tarifa-factor-vol').fill('250');
  await modal.getByTestId('tarifa-escala-agregar').click();
  await modal.getByTestId('tarifa-escala-desde-0').fill('100');
  await modal.getByTestId('tarifa-escala-monto-0').fill('4');
  await modal.getByTestId('tarifa-escala-agregar').click();
  await modal.getByTestId('tarifa-escala-desde-1').fill('45');
  await modal.getByTestId('tarifa-escala-monto-1').fill('5');
  await page.screenshot({ path: 'sprint/reportes/img/100-wizard-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'sprint/reportes/img/100-wizard-angosto.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await modal.getByRole('button', { name: 'Crear tarifa' }).click();

  await expect.poll(async () => {
    const t = (await leerColeccion('pricing@vermur.com', 'tarifas')).find(x => x.vigenciaTexto === 'Prueba 100');
    return t ? JSON.stringify(t.precios) : '';
  }, { timeout: 15_000 }).toMatch(/KG_COBRABLE/);
  const t = (await leerColeccion('pricing@vermur.com', 'tarifas')).find(x => x.vigenciaTexto === 'Prueba 100')!;
  const p = t.precios as Record<string, unknown>;
  expect(p.factorVolumetricoKgM3).toBe(250);
  // Las escalas se guardan en orden.
  expect((p.escalas as { desdeKg: number }[]).map(e => e.desdeKg)).toEqual([45, 100]);
  await ctx.close();
});

test('Ventas · solicita un aéreo de 120 kg bruto y 480 kg volumétrico', async ({ browser }) => {
  await sembrarTarifaCobrable('TAR-100-AER');
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
  await page.getByPlaceholder('480').fill('480');
  await page.getByPlaceholder('4', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Agregar concepto' }).click();
  await elegirConcepto(page, 'Air Freight');
  await page.getByRole('button', { name: 'Enviar a Pricing' }).click();
  await expect(page.getByText(/Solicitado a Pricing|solicitado/i).first()).toBeVisible({ timeout: 15_000 });

  const cots = await leerColeccion('ventas@vermur.com', 'cotizaciones');
  const mia = cots.filter(c => c.etapa === 'solicitado_pricing' && JSON.stringify(c.servicios).includes('"aereo"')
      && JSON.stringify(c.servicios).includes('480'))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  expect(mia, 'La solicitud aérea no quedó en Firestore').toBeTruthy();
  S.folio = String(mia!.__id);
  await ctx.close();
});

test('Pricing · el panel desglosa el cobrable y "Usar" carga el TOTAL', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'pricing@vermur.com');
  await irA(page, 'CRM');
  await page.getByRole('button', { name: 'Bandeja Pricing' }).click();
  await page.getByText(S.folio, { exact: true }).first().click();
  await page.getByRole('button', { name: 'Iniciar cotización' }).click();
  await page.getByRole('button', { name: /^Servicios/ }).click();

  // Activar el concepto para que el panel de tarifas lo muestre.
  await page.getByRole('button', { name: /Elegir del catálogo/ }).first().click();
  const desglose = page.getByTestId('cobrable-desglose').first();
  await expect(desglose).toBeVisible({ timeout: 15_000 });
  // Volumétrico 480 gana a 120 bruto; 480 kg cae en la escala de 300 (3/kg) → 1,440.
  await expect(desglose).toContainText('480');
  await expect(desglose).toContainText('volumétrico');
  await expect(page.getByTestId('cobrable-formula').first()).toContainText('480 kg cobrable');
  await expect(page.getByTestId('cobrable-formula').first()).toContainText('× 3/kg = 1,440');
  await desglose.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'sprint/reportes/img/100-cotizacion-desktop.png' });

  await page.getByRole('button', { name: 'Usar', exact: true }).first().click();
  await expect.poll(async () => {
    const c = (await leerColeccion('pricing@vermur.com', 'cotizaciones')).find(x => x.__id === S.folio);
    return JSON.stringify(c?.servicios ?? '');
  }, { timeout: 15_000, message: 'La tarifa por kg cobrable no se aplicó' }).toMatch(/1440/);
  const c = (await leerColeccion('pricing@vermur.com', 'cotizaciones')).find(x => x.__id === S.folio)!;
  expect(JSON.stringify(c.servicios)).toContain('kg cobrable (480 kg volumétrico');

  await page.setViewportSize({ width: 390, height: 844 });
  await desglose.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'sprint/reportes/img/100-cotizacion-angosto.png' });
  await ctx.close();
});
