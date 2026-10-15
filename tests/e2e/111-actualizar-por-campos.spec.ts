/**
 * Tarea 111 — updateCotizacion escribe solo lo tocado (P2 del plan de la ficha).
 *
 *   1. Una nota que otra pestaña escribió mientras la ficha está abierta
 *      sobrevive a la nota local (la repro de §3 del plan).
 *   2. Un PDF generado sigue en «PDF generados» después de escribir una nota.
 *
 * La «otra pestaña» es un commit REST al emulador con appendMissingElements:
 * exactamente lo que ve el listener cuando otro usuario guarda.
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { fijarPreferencias } from './preferencias';

test.beforeAll(async () => { await fijarPreferencias(); });
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const FS_RAIZ = 'projects/vermur-logistics-app/databases/(default)/documents';
const PW = '123456';
const FOLIO = 'COT-2026-0002';
const EXTERNA = 'Nota de OTRA pestana 111';
const LOCAL = 'Nota local 111';
const LOCAL_2 = 'Nota despues del PDF 111';

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

/** Ids de actividades y de pdfs guardados en el documento. */
async function guardado(): Promise<{ actividades: string[]; textos: string[]; pdfs: string[] }> {
  const token = await tokenDe('admin@vermur.com');
  const r = await fetch(`${FS}/cotizaciones/${FOLIO}`, { headers: { Authorization: `Bearer ${token}` } });
  const d = await r.json() as { fields: Record<string, { arrayValue?: { values?: { mapValue: { fields: Record<string, { stringValue?: string }> } }[] } }> };
  const lista = (k: string) => d.fields[k]?.arrayValue?.values ?? [];
  const campo = (v: { mapValue: { fields: Record<string, { stringValue?: string }> } }, c: string) => v.mapValue.fields[c]?.stringValue ?? '';
  return {
    actividades: lista('actividades').map(v => campo(v, 'id')),
    textos: lista('actividades').map(v => campo(v, 'descripcion') + campo(v, 'texto') + campo(v, 'detalle')),
    pdfs: lista('pdfs').map(v => campo(v, 'id')),
  };
}

const PDF_ID = `pdf-111-${Date.now()}`;

/** El registro que escribe usePdfCotizacion al generar un PDF. */
async function pdfDeOtraPestana(id: string) {
  const r = await fetch(`${FS}:commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ writes: [{ transform: {
      document: `${FS_RAIZ}/cotizaciones/${FOLIO}`,
      fieldTransforms: [{ fieldPath: 'pdfs', appendMissingElements: { values: [{ mapValue: { fields: {
        id: { stringValue: id }, version: { integerValue: '1' }, idioma: { stringValue: 'es' },
        nombreArchivo: { stringValue: `${FOLIO} v1.pdf` }, storagePath: { stringValue: `cotizaciones/${FOLIO}/pdf/${id}.pdf` },
        url: { stringValue: 'http://127.0.0.1:9199/falso.pdf' },
        generadoPor: { mapValue: { fields: { uid: { stringValue: 'x' }, nombre: { stringValue: 'Otra pestaña' } } } },
        fecha: { stringValue: new Date().toISOString() },
      } } }] } }],
    } }] }),
  });
  expect(r.ok, await r.clone().text()).toBeTruthy();
}

/** Lo que haría OTRA pestaña: agregar una actividad al documento, sin pasar por la ficha. */
async function notaDeOtraPestana(id: string, texto: string) {
  const fecha = new Date().toISOString();
  const r = await fetch(`${FS}:commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ writes: [{ transform: {
      document: `${FS_RAIZ}/cotizaciones/${FOLIO}`,
      fieldTransforms: [{ fieldPath: 'actividades', appendMissingElements: { values: [{ mapValue: { fields: {
        id: { stringValue: id }, tipo: { stringValue: 'nota' },
        descripcion: { stringValue: texto }, texto: { stringValue: texto },
        autor: { stringValue: 'Otra pestaña' }, fecha: { stringValue: fecha },
        // Forma REAL de una nota (Historial ordena por createdAt y la nombra por responsableId):
        // sin ellos la ficha truena al reabrirse y la segunda vuelta no pasa de la pantalla en blanco.
        createdAt: { stringValue: fecha }, responsableId: { stringValue: 'Otra pestaña' },
      } } }] } }],
    } }] }),
  });
  expect(r.ok, await r.clone().text()).toBeTruthy();
}

async function abrirFicha(page: Page) {
  await irA(page, 'CRM');
  await page.getByRole('button', { name: 'Cotizaciones', exact: true }).click();
  await page.getByText(FOLIO, { exact: true }).first().click();
  await page.getByRole('button', { name: 'Historial / Notas' }).click();
}

async function escribirNota(page: Page, texto: string) {
  await page.getByPlaceholder('Agregar una anotación comercial...').fill(texto);
  await page.getByRole('button', { name: 'Agregar nota' }).click();
}

const NOTA_EXTERNA_ID = `act-externa-111-${Date.now()}`;

test('la nota de otra pestaña y el PDF generado sobreviven a una nota local', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'admin@vermur.com');
  await abrirFicha(page);
  await expect(page.getByPlaceholder('Agregar una anotación comercial...')).toBeVisible({ timeout: 20_000 });

  await notaDeOtraPestana(NOTA_EXTERNA_ID, EXTERNA);
  await expect.poll(async () => (await guardado()).actividades, { timeout: 10_000 }).toContain(NOTA_EXTERNA_ID);
  // La ficha NO la muestra (no adopta lo ajeno todavía: P4); eso no cambia aquí.
  await page.waitForTimeout(1500);

  await escribirNota(page, LOCAL);
  await expect.poll(async () => (await guardado()).textos.join('|'), { timeout: 15_000 }).toContain(LOCAL);
  const g = await guardado();
  expect(g.actividades, 'la nota externa se perdió').toContain(NOTA_EXTERNA_ID);
  expect(g.textos.join('|')).toContain(EXTERNA);
  await page.screenshot({ path: 'sprint/reportes/img/111-notas-desktop.png', fullPage: true });

  // ── Un PDF generado sigue en «PDF generados» después de escribir una nota ──
  // La ficha de esta cotización de ejemplo no ofrece «Generar PDF» (le faltan datos),
  // así que el registro entra como lo escribe usePdfCotizacion: un arrayUnion sobre `pdfs`.
  // La generación por interfaz la cubre el recorrido (paso 2).
  await pdfDeOtraPestana(PDF_ID);
  await expect.poll(async () => (await guardado()).pdfs, { timeout: 10_000 }).toContain(PDF_ID);
  const antes = (await guardado()).pdfs;

  await escribirNota(page, LOCAL_2);
  await expect.poll(async () => (await guardado()).textos.join('|'), { timeout: 15_000 }).toContain(LOCAL_2);
  const g2 = await guardado();
  for (const id of antes) expect(g2.pdfs, 'el registro del PDF se perdió').toContain(id);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'sprint/reportes/img/111-pdf-angosto.png', fullPage: true });
  await ctx.close();
});
