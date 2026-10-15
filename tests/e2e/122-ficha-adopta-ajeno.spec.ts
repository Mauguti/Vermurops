/**
 * Tarea 122 — la ficha adopta lo ajeno y avisa del conflicto (P4 del plan).
 *
 *   1. Una nota, un PDF y un cambio de etapa que otra pestaña escribió
 *      aparecen solos en la ficha abierta, sin recargar, y lo que la persona
 *      tenía escrito sin enviar no se pierde.
 *   2. Si las dos copias cambian lo mismo (servicios), sale la franja ámbar;
 *      «Ver cambios» la detalla y «Recargar» toma la copia de la otra persona.
 *
 * La «otra pestaña» del caso 1 es REST contra el emulador (lo que vería el
 * listener); en el caso 2 son dos navegadores reales, uno de ellos sin red
 * mientras edita.
 */
import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const FS_RAIZ = 'projects/vermur-logistics-app/databases/(default)/documents';
const PW = process.env.PASSWORD_CUENTAS_PRUEBA ?? '';
const NOTAS = 'COT-2026-0002';
const ETAPAS = 'COT-2026-0004';
const CONFLICTO = 'COT-2026-0003';
const EXTERNA = 'Nota de OTRA pestana 122';
const BORRADOR = 'Borrador sin enviar 122';
const PDF_ID = `pdf-122-${Date.now()}`;
const NOTA_ID = `act-externa-122-${Date.now()}`;

async function entrar(browser: Browser): Promise<{ page: Page; ctx: BrowserContext }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill('admin@vermur.com');
  await page.getByPlaceholder('••••••••').fill(PW);
  await page.locator('#login-submit').click();
  await expect(page.getByText('Emuladores · producción intacta')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
  return { page, ctx };
}

async function abrirFicha(page: Page, folio: string) {
  await page.getByRole('button', { name: 'CRM', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cotizaciones', exact: true }).click();
  await page.getByText(folio, { exact: true }).first().click();
}

async function tokenAdmin(): Promise<string> {
  const r = await fetch(`${AUTH}/accounts:signInWithPassword?key=emulador`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@vermur.com', password: PW, returnSecureToken: true }),
  });
  return (await r.json() as { idToken: string }).idToken;
}

async function documento(folio: string): Promise<string> {
  const r = await fetch(`${FS}/cotizaciones/${folio}`, { headers: { Authorization: `Bearer ${await tokenAdmin()}` } });
  return r.text();
}

async function transformar(folio: string, campo: string, valor: unknown) {
  const r = await fetch(`${FS}:commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ writes: [{ transform: {
      document: `${FS_RAIZ}/cotizaciones/${folio}`,
      fieldTransforms: [{ fieldPath: campo, appendMissingElements: { values: [valor] } }],
    } }] }),
  });
  expect(r.ok, await r.clone().text()).toBeTruthy();
}

async function ponerEtapa(folio: string, etapa: string) {
  const r = await fetch(`${FS}/cotizaciones/${folio}?updateMask.fieldPaths=etapa`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: { etapa: { stringValue: etapa } } }),
  });
  expect(r.ok, await r.clone().text()).toBeTruthy();
}

test('la nota, el PDF y la etapa de otra pestaña aparecen solos y el borrador no se pierde', async ({ browser }) => {
  const { page, ctx } = await entrar(browser);

  // ── Nota y PDF en la ficha de COT-2026-0002 ──
  await abrirFicha(page, NOTAS);
  await page.getByRole('button', { name: 'Historial / Notas' }).click();
  const caja = page.getByPlaceholder('Agregar una anotación comercial...');
  await expect(caja).toBeVisible({ timeout: 20_000 });
  await caja.fill(BORRADOR);
  await expect(page.getByText(EXTERNA)).toHaveCount(0);

  const fecha = new Date().toISOString();
  await transformar(NOTAS, 'actividades', { mapValue: { fields: {
    id: { stringValue: NOTA_ID }, tipo: { stringValue: 'nota' },
    descripcion: { stringValue: EXTERNA }, texto: { stringValue: EXTERNA },
    autor: { stringValue: 'Otra pestaña' }, fecha: { stringValue: fecha },
    createdAt: { stringValue: fecha }, responsableId: { stringValue: 'Otra pestaña' },
  } } });
  await transformar(NOTAS, 'pdfs', { mapValue: { fields: {
    id: { stringValue: PDF_ID }, version: { integerValue: '1' }, idioma: { stringValue: 'es' },
    nombreArchivo: { stringValue: 'COT-122-otra-pestana.pdf' },
    storagePath: { stringValue: `cotizaciones/${NOTAS}/pdf/${PDF_ID}.pdf` },
    url: { stringValue: 'http://127.0.0.1:9199/falso.pdf' },
    generadoPor: { mapValue: { fields: { uid: { stringValue: 'x' }, nombre: { stringValue: 'Otra pestaña' } } } },
    fecha: { stringValue: fecha },
  } } });

  await expect(page.getByText(EXTERNA)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('COT-122-otra-pestana.pdf')).toBeVisible({ timeout: 10_000 });
  // Lo que la persona escribía sigue ahí, y sin conflicto no hay franja.
  await expect(caja).toHaveValue(BORRADOR);
  await expect(page.getByTestId('aviso-conflicto-cotizacion')).toHaveCount(0);
  await page.screenshot({ path: 'sprint/reportes/img/122-adopta-escritorio.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'sprint/reportes/img/122-adopta-angosto.png', fullPage: true });

  // El borrador se envía y la nota ajena no se pierde.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Agregar nota' }).click();
  await expect.poll(async () => documento(NOTAS), { timeout: 15_000 }).toContain(BORRADOR);
  expect(await documento(NOTAS)).toContain(EXTERNA);

  // ── La etapa: COT-2026-0004 ──
  await page.getByRole('button', { name: /Regresar|Volver|Cotizaciones/ }).first().click().catch(() => undefined);
  await abrirFicha(page, ETAPAS).catch(async () => {
    await page.getByRole('button', { name: 'CRM', exact: true }).first().click();
    await page.getByText(ETAPAS, { exact: true }).first().click();
  });
  const siguiente = page.locator('p', { hasText: 'Siguiente:' }).first();
  await expect(siguiente).toBeVisible({ timeout: 15_000 });
  const antes = await siguiente.innerText();
  await ponerEtapa(ETAPAS, 'consolidada');
  await expect.poll(async () => (await siguiente.innerText()) !== antes, { timeout: 10_000 }).toBeTruthy();
  await ponerEtapa(ETAPAS, 'cotizaciones_recibidas'); // se devuelve lo sembrado
  await ctx.close();
});

test('si las dos copias editan lo mismo sale la franja; Ver cambios y Recargar', async ({ browser }) => {
  const A = await entrar(browser);
  const B = await entrar(browser);
  const campo = (p: Page) => p.getByPlaceholder(/Ej\. temperatura controlada/).first();

  await abrirFicha(A.page, CONFLICTO);
  await abrirFicha(B.page, CONFLICTO);
  await expect(campo(A.page)).toBeVisible({ timeout: 20_000 });
  await expect(campo(B.page)).toBeVisible({ timeout: 20_000 });

  // B edita sin red: su copia cambia y el guardado no llega.
  await B.ctx.setOffline(true);
  await campo(B.page).fill('Nota B 122');
  await B.page.waitForTimeout(8000);

  // A guarda lo suyo sobre el mismo campo.
  await campo(A.page).fill('Nota A 122');
  await expect.poll(async () => documento(CONFLICTO), { timeout: 15_000 }).toContain('Nota A 122');

  // B recupera la red: llega lo de A y las dos copias chocan.
  await B.ctx.setOffline(false);
  const franja = B.page.getByTestId('aviso-conflicto-cotizacion');
  await expect(franja).toBeVisible({ timeout: 30_000 });
  await expect(franja).toContainText('Otra persona modificó esta cotización');
  await expect(campo(B.page)).toHaveValue('Nota B 122'); // no se pisa lo suyo
  await B.page.screenshot({ path: 'sprint/reportes/img/122-conflicto-escritorio.png', fullPage: true });
  await B.page.setViewportSize({ width: 390, height: 844 });
  await B.page.screenshot({ path: 'sprint/reportes/img/122-conflicto-angosto.png', fullPage: true });
  await B.page.setViewportSize({ width: 1440, height: 900 });

  await franja.getByRole('button', { name: 'Ver cambios' }).click();
  await expect(B.page.getByTestId('aviso-conflicto-detalle')).toContainText('Servicios');

  await franja.getByRole('button', { name: 'Recargar' }).click();
  await expect(franja).toHaveCount(0);
  await expect(campo(B.page)).toHaveValue('Nota A 122');

  // Sin conflicto, la ficha de A nunca mostró la franja.
  await expect(A.page.getByTestId('aviso-conflicto-cotizacion')).toHaveCount(0);
  await A.ctx.close();
  await B.ctx.close();
});
