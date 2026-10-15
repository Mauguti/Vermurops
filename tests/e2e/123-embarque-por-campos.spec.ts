/**
 * Tarea 123 — la ficha de embarque guarda solo lo tocado.
 *
 *   1. Dos pestañas sobre el mismo embarque: lo que la otra escribió (una nota
 *      de bitácora y el cierre de pago) sobrevive al guardado de ESTA ficha
 *      (el cierre operativo). La «otra pestaña» es REST contra el emulador,
 *      disparado en la misma tarea síncrona que el clic para que la copia local
 *      siga vieja con certeza, que es justo el caso que antes se pisaba.
 *   2. Abrir un embarque desde una cotización cuyo primer embarque lo abrió otra
 *      pestaña conserva los dos ids en `embarqueIds` (arrayUnion, tarea 112),
 *      con la copia local de la cotización todavía vieja.
 */
import { test, expect, type Page, type Browser } from '@playwright/test';
import { fijarPreferencias } from './preferencias';
import { idsDe } from './aislamiento';

test.beforeAll(async () => { await fijarPreferencias(); });
test.describe.configure({ mode: 'serial' });
test.setTimeout(150_000);

const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const FS_RAIZ = 'projects/vermur-logistics-app/databases/(default)/documents';
const OWNER = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' };
const IMG = 'sprint/reportes/img';
const NOTA_AJENA = `Nota ajena 123 ${Date.now()}`;
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

async function leer(ruta: string): Promise<{ fields: Record<string, any> }> {
  return (await fetch(`${FS}/${ruta}`, { headers: OWNER })).json() as never;
}

async function patch(ruta: string, campos: string[], fields: Record<string, unknown>) {
  const mask = campos.map(c => `updateMask.fieldPaths=${c}`).join('&');
  const r = await fetch(`${FS}/${ruta}?${mask}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields }) });
  expect(r.ok, await r.clone().text()).toBeTruthy();
}

const cierre = (d: { fields: Record<string, any> }, k: string) => d.fields.cierres?.mapValue?.fields?.[k]?.booleanValue;
const textosBitacora = (d: { fields: Record<string, any> }): string[] =>
  (d.fields.bitacora?.arrayValue?.values ?? []).map((v: any) => v.mapValue.fields.titulo?.stringValue ?? '');

test('dos pestañas: la nota y el cierre de la otra sobreviven al guardado de esta ficha', async ({ browser }) => {
  const antes = await idsDe('operaciones@vermur.com', 'embarques');
  const { page, ctx } = await entrar(browser, 'operaciones@vermur.com');
  await page.getByRole('button', { name: 'Embarques', exact: true }).first().click();
  await page.getByRole('button', { name: 'Todos los embarques' }).click();
  await page.getByRole('button', { name: /Nuevo Embarque/ }).click();
  await expect(page.getByText('Cierre Operativo').first()).toBeVisible({ timeout: 20_000 });
  const despues = await idsDe('operaciones@vermur.com', 'embarques');
  const id = [...despues].find(x => !antes.has(x))!;
  expect(id, 'no apareció el embarque nuevo').toBeTruthy();

  /*
   * La «otra pestaña» escribe y, EN LA MISMA tarea síncrona de esta página, se
   * da el clic: el listener no puede haber entregado nada todavía, así que la
   * copia local es vieja con certeza (congelar la red no lo logra: el
   * long-poll ya abierto no pasa por las rutas de Playwright).
   */
  const toggle = await page.locator("xpath=//span[contains(., 'Cierre Operativo')]/ancestor::div[contains(@class,'justify-between')][1]//button").first().elementHandle();
  await toggle!.scrollIntoViewIfNeeded();
  const nota = { id: `bit-123-${Date.now()}`, titulo: NOTA_AJENA, fecha: new Date().toISOString() };
  await page.evaluate(({ el, FS, FS_RAIZ, id, nota }) => {
    const xhr = (url: string, body: unknown, metodo = 'POST') => {
      const r = new XMLHttpRequest();
      r.open(metodo, url, false);
      r.setRequestHeader('Content-Type', 'application/json');
      r.setRequestHeader('Authorization', 'Bearer owner');
      r.send(JSON.stringify(body));
      if (r.status >= 300) throw new Error(`${r.status} ${r.responseText}`);
    };
    xhr(`${FS}:commit`, { writes: [{ transform: {
      document: `${FS_RAIZ}/embarques/${id}`,
      fieldTransforms: [{ fieldPath: 'bitacora', appendMissingElements: { values: [{ mapValue: { fields: {
        id: { stringValue: nota.id }, tipo: { stringValue: 'comentario' }, titulo: { stringValue: nota.titulo },
        fecha: { stringValue: nota.fecha },
        autor: { mapValue: { fields: { uid: { stringValue: 'otra' }, nombre: { stringValue: 'Otra pestaña' } } } },
      } } }] } }],
    } }] });
    xhr(`${FS}/embarques/${id}?updateMask.fieldPaths=cierres.pago`,
      { fields: { cierres: { mapValue: { fields: { pago: { booleanValue: true } } } } } }, 'PATCH');
    (el as HTMLElement).click();
  }, { el: toggle, FS, FS_RAIZ, id, nota });

  await expect.poll(async () => cierre(await leer(`embarques/${id}`), 'operativo'), { timeout: 20_000 }).toBe(true);
  const d = await leer(`embarques/${id}`);
  expect(textosBitacora(d), 'se perdió la nota de la otra pestaña').toContain(NOTA_AJENA);
  expect(cierre(d, 'pago'), 'se perdió el cierre de pago de la otra pestaña').toBe(true);
  expect(textosBitacora(d).length, 'el cierre propio debe dejar su entrada de bitácora').toBeGreaterThanOrEqual(2);
  await expect(page.getByText(NOTA_AJENA)).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: `${IMG}/123-dos-pestanas-escritorio.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${IMG}/123-dos-pestanas-angosto.png`, fullPage: true });
  await ctx.close();
});

/** Clona la cotización completa que dejó el recorrido (COT-2026-0009) como ganada y sin embarque. */
async function clonarGanada(folio: string) {
  const origen = await leer('cotizaciones/COT-2026-0009');
  expect(origen.fields?.servicios, 'falta COT-2026-0009: corre el recorrido antes').toBeTruthy();
  const fields = { ...origen.fields };
  delete fields.estadoFinal;
  delete fields.embarqueIds;
  fields.id = { stringValue: folio };
  fields.etapa = { stringValue: 'ganada' };
  const r = await fetch(`${FS}/cotizaciones/${folio}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields }) });
  expect(r.ok, await r.clone().text()).toBeTruthy();
}

test('abrir dos embarques seguidos desde la misma cotización conserva los dos ids', async ({ browser }) => {
  const folio = `COT-2026-9${String(Date.now()).slice(-5)}`; // único por corrida: el embarque ya abierto la esconde de la bandeja
  await patch(`clientes/${CLIENTE}`, ['expedienteValidado'], { expedienteValidado: { mapValue: { fields: {
    por: { stringValue: 'e2e' }, fecha: { stringValue: new Date().toISOString() }, notas: { stringValue: 'e2e 123' },
  } } } });
  await clonarGanada(folio);

  const { page, ctx } = await entrar(browser, 'operaciones@vermur.com');
  await page.getByRole('button', { name: 'Embarques', exact: true }).first().click();
  const fila = page.locator('tr', { hasText: folio });
  await expect(fila).toBeVisible({ timeout: 20_000 });
  const boton = await fila.getByRole('button', { name: /Abrir embarque/ }).elementHandle();

  /*
   * El primer embarque lo abre «otra pestaña»: en la MISMA tarea síncrona de
   * esta página se escribe su id en la cotización y se da el clic, así la copia
   * local de `quote` no puede traerlo todavía. Este segundo «Abrir embarque»
   * tiene que SUMAR su id, no reemplazar la lista.
   */
  await page.evaluate(({ el, FS, folio }) => {
    const r = new XMLHttpRequest();
    r.open('PATCH', `${FS}/cotizaciones/${folio}?updateMask.fieldPaths=embarqueIds`, false);
    r.setRequestHeader('Content-Type', 'application/json');
    r.setRequestHeader('Authorization', 'Bearer owner');
    r.send(JSON.stringify({ fields: { embarqueIds: { arrayValue: { values: [{ stringValue: 'EMB-OTRA-PESTANA-123' }] } } } }));
    if (r.status >= 300) throw new Error(`${r.status} ${r.responseText}`);
    (el as HTMLElement).click();
  }, { el: boton, FS, folio });

  await expect(page.getByText(folio).first()).toBeVisible({ timeout: 20_000 }); // la ficha del embarque nuevo
  const idsDe123 = async () => ((await leer(`cotizaciones/${folio}`)).fields.embarqueIds?.arrayValue?.values ?? []).map((v: any) => v.stringValue);
  await expect.poll(async () => (await idsDe123()).length, { timeout: 20_000 }).toBe(2);
  const ids = ((await leer(`cotizaciones/${folio}`)).fields.embarqueIds?.arrayValue?.values ?? []).map((v: any) => v.stringValue);
  expect(ids, 'se perdió el id del primer embarque').toContain('EMB-OTRA-PESTANA-123');
  expect(ids.filter((x: string) => x !== 'EMB-OTRA-PESTANA-123'), 'falta el id del segundo').toHaveLength(1);
  await page.screenshot({ path: `${IMG}/123-dos-embarques-escritorio.png`, fullPage: true });
  await ctx.close();
});
