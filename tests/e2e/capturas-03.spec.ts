/**
 * Capturas de la tarea 03: freno al enviar con líneas sin tasa de impuesto.
 *
 * Reproduce el flujo del recorrido (solicitud + comparativa) y captura:
 *   1. Franja bloqueada: Documentation tiene venta pero no impuesto resuelto.
 *   2. Franja desbloqueada: tras elegir IVA 0% en la columna Impuesto.
 *
 * Corre con emuladores levantados: ./scripts/dev-emuladores.sh
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const PW = '123456';
const IMG = 'sprint/reportes/img';

const PDF_FALSO = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');

const S = { folio: '' };

async function entrar(browser: Browser, email: string, ancho = 1280): Promise<{ page: Page; ctx: BrowserContext }> {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.route('**/clasificarDocumento', async route => {
    const flujo = route.request().headers()['x-vermur-flujo'];
    if (flujo === 'pdf-cotizacion') {
      await route.fulfill({ status: 200, contentType: 'application/pdf', body: PDF_FALSO });
      return;
    }
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false }) });
  });
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

const selectCon = (page: Page, value: string) =>
  page.locator('select').filter({ has: page.locator(`option[value="${value}"]`) }).first();

async function elegirConcepto(page: Page, termino: string) {
  await page.getByRole('button', { name: 'Seleccionar concepto...' }).last().click();
  const buscador = page.getByPlaceholder('Buscar concepto...');
  await buscador.fill(termino);
  await page.locator('body').getByRole('button', { name: new RegExp(termino, 'i') }).first().click();
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
  return (d.documents ?? []).map(doc => {
    const out: Record<string, unknown> = { __id: doc.name.split('/').pop() };
    for (const [k, v] of Object.entries(doc.fields)) {
      const o = v as Record<string, unknown>;
      if ('stringValue' in o) out[k] = o.stringValue;
      else if ('integerValue' in o) out[k] = Number(o.integerValue);
    }
    return out;
  });
}

// ── 1 · Ventas: solicitud (igual que el recorrido) ───────────────────────────

test('Solicitud para capturas', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'ventas@vermur.com');
  await irA(page, 'CRM');
  await page.getByRole('button', { name: 'Cotizaciones', exact: true }).click();
  await page.getByRole('button', { name: /Solicitar cotización|Nueva cotización/ }).click();

  await selectCon(page, 'cliente:CLI-SEED-003').selectOption('cliente:CLI-SEED-003');
  await selectCon(page, 'importacion').selectOption('importacion');
  await page.getByRole('button', { name: 'Marítimo', exact: true }).click();

  const puertos = page.getByRole('button', { name: 'Elegir del catálogo…' });
  await puertos.first().click();
  await page.getByPlaceholder('Buscar puerto, código o país…').fill('Shanghai');
  await page.getByRole('button', { name: /Shanghai/ }).first().click();
  await page.getByRole('button', { name: 'Elegir del catálogo…' }).first().click();
  await page.getByPlaceholder('Buscar puerto, código o país…').fill('Manzanillo');
  await page.getByRole('button', { name: /Manzanillo/ }).first().click();

  await page.getByPlaceholder('18500').fill('18500');

  await page.getByRole('button', { name: 'Agregar concepto' }).click();
  await elegirConcepto(page, 'Ocean Freight');
  await page.getByRole('button', { name: 'Agregar concepto' }).click();
  await elegirConcepto(page, 'Documentation');

  await page.getByRole('button', { name: 'Enviar a Pricing' }).click();
  await expect(page.getByText(/Solicitado a Pricing|solicitado/i).first()).toBeVisible({ timeout: 15_000 });

  const cots = await leerColeccion('ventas@vermur.com', 'cotizaciones');
  const mia = cots.filter(c => c.etapa === 'solicitado_pricing')
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))[0];
  expect(mia).toBeTruthy();
  S.folio = String(mia!.__id);
  console.log('[capturas-03] folio:', S.folio);
  await ctx.close();
});

// ── 2 · Pricing: comparativa y capturas ──────────────────────────────────────

test('Captura freno de impuesto: bloqueada y desbloqueada', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'pricing@vermur.com');
  await irA(page, 'CRM');
  await page.getByRole('button', { name: 'Bandeja Pricing' }).click();
  await page.getByText(S.folio, { exact: true }).first().click();
  await expect(page.getByText('Plásticos Ramírez', { exact: false }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Iniciar cotización' }).click();
  await page.getByRole('button', { name: /^Servicios/ }).click();

  // Proveedor
  await page.getByRole('button', { name: 'Agregar proveedor' }).click();
  await page.getByPlaceholder('Buscar por nombre o RFC…').fill('HAPAG LLOYD');
  await page.getByRole('button', { name: /HAPAG LLOYD A G/ }).first().click();

  // Montos en la comparativa
  const filaOcean = page.locator('tr', { has: page.locator('input[value="Ocean Freight"]') });
  await filaOcean.locator('input[type="number"]').first().fill('1500');
  const filaDoc = page.locator('tr', { has: page.locator('input[value="Documentation"]') });
  await filaDoc.locator('input[type="number"]').first().fill('200');
  await page.getByTitle(/Elegir a HAPAG LLOYD A G para TODAS las filas/).click();

  // Profit por línea
  await page.getByRole('tab', { name: 'Por concepto' }).click();
  await expect(page.getByText('HAPAG LLOYD A G').first()).toBeVisible();
  const lineaOcean = page.locator('tr', { hasText: 'Ocean Freight' }).filter({ has: page.getByText('HAPAG') }).first();
  await lineaOcean.locator('input[type="number"]').last().fill('300');
  const lineaDoc = page.locator('tr', { hasText: 'Documentation' }).filter({ has: page.getByText('HAPAG') }).first();
  await lineaDoc.locator('input[type="number"]').last().fill('50');

  // Avanzar a «Lista para enviar» SIN elegir impuesto en Documentation
  await page.getByRole('button', { name: 'Cotizaciones recibidas' }).click();
  await page.getByRole('button', { name: 'Armar cotización' }).click();

  // Franja bloqueada
  await expect(page.getByText(/sin tasa de impuesto/)).toBeVisible({ timeout: 15_000 });

  // CAPTURA 1: desktop
  await page.screenshot({ path: `${IMG}/03-freno-impuesto-desktop.png`, fullPage: false });

  // CAPTURA 2: angosto
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${IMG}/03-freno-impuesto-angosto.png`, fullPage: false });

  // Resolver: elegir IVA 0% en la columna Impuesto
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Servicios/ }).click();
  await page.getByRole('tab', { name: 'Por concepto' }).click();
  const lineaDoc2 = page.locator('tr', { hasText: 'Documentation' }).filter({ has: page.getByText('HAPAG') }).first();
  await lineaDoc2.locator('select').selectOption('iva0');
  await page.waitForTimeout(1500); // autoguardado

  // Franja desbloqueada
  await expect(page.getByText(/sin tasa de impuesto/)).not.toBeVisible({ timeout: 10_000 });

  // CAPTURA 3: desktop con freno resuelto
  await page.screenshot({ path: `${IMG}/03-freno-resuelto-desktop.png`, fullPage: false });

  await ctx.close();
});
