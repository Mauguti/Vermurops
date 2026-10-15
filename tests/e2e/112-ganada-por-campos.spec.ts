/**
 * Tarea 112 — marcar ganada escribe solo lo suyo (P3 del plan de la ficha).
 *
 * Con el interruptor de embarque automático APAGADO (COT-2026-0112) y ENCENDIDO
 * (COT-2026-0113): una nota que otra pestaña agrega mientras la ficha está
 * abierta sobrevive a «Marcar ganada».
 */
import { test, expect, type Page, type Browser } from '@playwright/test';
import { fijarPreferencias } from './preferencias';

test.beforeAll(async () => { await fijarPreferencias(); });
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const FS_RAIZ = 'projects/vermur-logistics-app/databases/(default)/documents';
const OWNER = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' };
const CLIENTE = 'CLI-SEED-003';

async function entrar(browser: Browser, email: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(process.env.PASSWORD_CUENTAS_PRUEBA ?? '');
  await page.locator('#login-submit').click();
  await expect(page.getByText('Emuladores · producción intacta')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
  return { page, ctx };
}

async function patch(ruta: string, campos: string[], fields: Record<string, unknown>) {
  const mask = campos.map(c => `updateMask.fieldPaths=${c}`).join('&');
  const r = await fetch(`${FS}/${ruta}?${mask}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields }) });
  expect(r.ok, await r.clone().text()).toBeTruthy();
}

async function leer(ruta: string): Promise<{ fields: Record<string, any> }> {
  const r = await fetch(`${FS}/${ruta}`, { headers: OWNER });
  return r.json() as never;
}

async function notaDeOtraPestana(folio: string, id: string, texto: string) {
  const r = await fetch(`${FS}:commit`, {
    method: 'POST', headers: OWNER,
    body: JSON.stringify({ writes: [{ transform: {
      document: `${FS_RAIZ}/cotizaciones/${folio}`,
      fieldTransforms: [{ fieldPath: 'actividades', appendMissingElements: { values: [{ mapValue: { fields: {
        id: { stringValue: id }, tipo: { stringValue: 'nota' }, descripcion: { stringValue: texto },
        texto: { stringValue: texto }, autor: { stringValue: 'Otra pestaña' }, fecha: { stringValue: new Date().toISOString() },
      } } }] } }],
    } }] }),
  });
  expect(r.ok, await r.clone().text()).toBeTruthy();
}

const idsActividades = (d: { fields: Record<string, any> }): string[] =>
  (d.fields.actividades?.arrayValue?.values ?? []).map((v: any) => v.mapValue.fields.id?.stringValue);

async function prepararCliente() {
  await patch(`clientes/${CLIENTE}`, ['expedienteValidado'], { expedienteValidado: { mapValue: { fields: {
    por: { stringValue: 'e2e' }, fecha: { stringValue: new Date().toISOString() }, notas: { stringValue: 'e2e 112' },
  } } } });
}

/**
 * Las cotizaciones de ejemplo no están «listas» (les faltan costos e impuestos),
 * así que no ofrecen «Marcar ganada». Se clona la que dejó el recorrido
 * (COT-2026-0009, completa) en una nueva, enviada al cliente y sin embarque.
 * Por eso este spec corre DESPUÉS del recorrido.
 */
async function clonarCotizacionLista(folio: string) {
  const origen = await leer('cotizaciones/COT-2026-0009');
  expect(origen.fields?.servicios, 'falta COT-2026-0009: corre el recorrido antes').toBeTruthy();
  const fields = { ...origen.fields };
  delete fields.estadoFinal;
  delete fields.embarqueIds;
  fields.id = { stringValue: folio };
  fields.etapa = { stringValue: 'enviada_cliente' };
  const r = await fetch(`${FS}/cotizaciones/${folio}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields }) });
  expect(r.ok, await r.clone().text()).toBeTruthy();
}

async function ganar(page: Page, folio: string, notaId: string) {
  await clonarCotizacionLista(folio);
  await page.getByRole('button', { name: 'CRM' }).first().click();
  await page.getByRole('button', { name: 'Cotizaciones', exact: true }).click();
  await page.getByText(folio, { exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Marcar ganada' })).toBeVisible({ timeout: 20_000 });
  await notaDeOtraPestana(folio, notaId, `Nota ajena ${notaId}`);
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Marcar ganada' }).click();
  await page.getByTestId('dialogo').getByRole('button', { name: 'Marcar ganada' }).click();
}

test('interruptor APAGADO: queda ganada y la nota ajena sobrevive', async ({ browser }) => {
  await prepararCliente();
  const { page, ctx } = await entrar(browser, 'admin@vermur.com');
  const folio = 'COT-2026-0112';
  const id = `act-112-off-${Date.now()}`;
  await ganar(page, folio, id);
  await expect.poll(async () => (await leer(`cotizaciones/${folio}`)).fields.etapa?.stringValue, { timeout: 15_000 }).toBe('ganada');
  const d = await leer(`cotizaciones/${folio}`);
  expect(idsActividades(d), 'la nota ajena se perdió').toContain(id);
  expect(d.fields.embarqueIds?.arrayValue?.values ?? [], 'apagado no abre embarque').toHaveLength(0);
  await page.screenshot({ path: 'sprint/reportes/img/112-ganada-apagado-desktop.png', fullPage: true });
  await ctx.close();
});

test('interruptor ENCENDIDO: queda ganada, con embarque, y la nota ajena sobrevive', async ({ browser }) => {
  await prepararCliente();
  await patch('contadores/configuracionEmbarques', ['embarqueAutomatico'], { embarqueAutomatico: { booleanValue: true } });
  const { page, ctx } = await entrar(browser, 'admin@vermur.com');
  const folio = 'COT-2026-0113';
  const id = `act-112-on-${Date.now()}`;
  try {
    await ganar(page, folio, id);
    await expect.poll(async () => (await leer(`cotizaciones/${folio}`)).fields.etapa?.stringValue, { timeout: 20_000 }).toBe('ganada');
    const d = await leer(`cotizaciones/${folio}`);
    expect(idsActividades(d), 'la nota ajena se perdió').toContain(id);
    expect((d.fields.embarqueIds?.arrayValue?.values ?? []).length, 'no se abrió embarque').toBeGreaterThan(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'sprint/reportes/img/112-ganada-encendido-angosto.png', fullPage: true });
  } finally {
    await patch('contadores/configuracionEmbarques', ['embarqueAutomatico'], { embarqueAutomatico: { booleanValue: false } });
    await ctx.close();
  }
});
