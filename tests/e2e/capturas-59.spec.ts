/**
 * capturas-59.spec.ts — tráfico y mes de cierre en la lista de Embarques.
 *
 * Siembra los cinco casos que importan para el cierre de mes de Julio:
 * importación por folio, exportación por folio, importación aérea (para
 * combinar con modalidad), un folio de Magaya con ruta que no permite deducir
 * el tráfico, y una exportación sin ETD —la que NO cae en ningún mes y por la
 * que el encabezado avisa.
 *
 * Requiere emuladores + app en :3100 arriba: `KEEP=1 ./scripts/e2e.sh`.
 * Se siembra con `Bearer owner` (el emulador trata ese token como Admin SDK),
 * igual que en capturas-57 y 58.
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const PW = '123456';
const IMG = 'sprint/reportes/img';

const s = (stringValue: string) => ({ stringValue });

async function sembrarEmbarque(e: {
  id: string; folio: string; modalidad: string;
  origen: string; destino: string; etd: string; eta: string; creado: string;
}) {
  const r = await fetch(`${FS}/embarques/${e.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({
      fields: {
        id: s(e.id), folio: s(e.folio), cotizacionId: s(''),
        modalidad: s(e.modalidad), tipo: s('hijo'), masterId: { nullValue: null },
        numeroGuia: s('MAEU59'), numeroReservacion: s(''), referenciaCliente: s('PO-59'),
        responsableOperativo: s('operaciones@vermur.com'),
        entidades: { mapValue: { fields: {
          expedidor: s('Shanghai Export Ltd'), consignatario: s('Caso 59'),
          notificar: s(''), agenteAduanal: s(''), agenteCarga: s(''),
          agenteDestino: s(''), importador: s(''), clienteCobrar: s('Caso 59 S.A.'),
        } } },
        ruta: { mapValue: { fields: {
          origen: { mapValue: { fields: {
            puertoCarga: s(e.origen), transportista: s(''), buque: s(''),
            bandera: s(''), viaje: s(''),
          } } },
          destino: { mapValue: { fields: {
            puertoDescarga: s(e.destino), transportistaEntrega: s(''), lugarEntrega: s(''),
          } } },
          aduana: { mapValue: { fields: { aes: { booleanValue: false }, pedimento: s('') } } },
        } } },
        fechas: { mapValue: { fields: {
          salida: s(e.etd), arribo: s(e.eta), ordenGeneral: s(''),
          limiteDocumentacion: s(''), libreDemoras: s(''), libreAlmacenaje: s(''),
        } } },
        cierres: { mapValue: { fields: {
          operativo: { booleanValue: false }, pago: { booleanValue: false },
          administrativo: { booleanValue: false },
        } } },
        descripcionCarga: s('Caso de la tarea 59'),
        valorDeclarado: { doubleValue: 0 },
        cargos: { mapValue: { fields: {
          cobrar: { arrayValue: { values: [] } }, pagar: { arrayValue: { values: [] } },
        } } },
        documentos: { arrayValue: { values: [] } },
        eventos: { arrayValue: { values: [] } },
        createdAt: s(e.creado), updatedAt: s(e.creado),
      },
    }),
  });
  expect(r.ok).toBe(true);
}

/** Los cinco casos. Los meses están elegidos para que no se confundan. */
async function sembrarCasos() {
  // Importación marítima: arriba en SEPTIEMBRE, zarpó en agosto.
  await sembrarEmbarque({ id: 'E59-IMPO', folio: 'VLIM-59-591', modalidad: 'maritimo', origen: 'Shanghai (CNSHA), CHN', destino: 'Lázaro Cárdenas (MXLZC), MEX', etd: '2026-08-05', eta: '2026-09-18', creado: '2026-10-05T10:00:00.000Z' });
  // Exportación marítima: zarpó en AGOSTO, arriba en septiembre. Cierra en agosto.
  await sembrarEmbarque({ id: 'E59-EXPO', folio: 'VLEM-59-592', modalidad: 'maritimo', origen: 'Veracruz (MXVER), MEX', destino: 'Houston, USA', etd: '2026-08-11', eta: '2026-09-25', creado: '2026-10-05T10:01:00.000Z' });
  // Importación aérea: para combinar tráfico con modalidad.
  await sembrarEmbarque({ id: 'E59-AEREO', folio: 'VLIA-59-593', modalidad: 'aereo', origen: 'Frankfurt (FRA), GER', destino: 'AICM (MEX), CDMX, MEX', etd: '2026-09-29', eta: '2026-10-03', creado: '2026-10-05T10:02:00.000Z' });
  // Folio de Magaya y ruta sin extremo mexicano: tráfico desconocido.
  await sembrarEmbarque({ id: 'E59-SIN', folio: 'BOL 9016599', modalidad: 'maritimo', origen: 'Shanghai (CNSHA), CHN', destino: 'Houston, USA', etd: '2026-08-20', eta: '2026-09-30', creado: '2026-10-05T10:03:00.000Z' });
  // Exportación sin ETD: no cae en NINGÚN mes, aunque tenga ETA.
  await sembrarEmbarque({ id: 'E59-EXPO-SIN', folio: 'VLET-59-594', modalidad: 'terrestre', origen: 'Monterrey, MEX', destino: 'Laredo (Border Crossing), USA', etd: '', eta: '2026-09-14', creado: '2026-10-05T10:04:00.000Z' });
}

async function entrar(browser: Browser, email: string): Promise<{ page: Page; ctx: BrowserContext }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(PW);
  await page.locator('#login-submit').click();
  await expect(page.getByText('Emuladores · producción intacta')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
  return { page, ctx };
}

async function abrirEmbarques(page: Page) {
  await page.getByRole('button', { name: 'Embarques', exact: true }).first().click();
  // Operaciones entra en «Por capturar»; la lista vive en la otra pestaña.
  await page.getByRole('button', { name: /Todos los embarques/ }).first().click();
  await expect(page.getByRole('columnheader', { name: 'Tráfico' })).toBeVisible({ timeout: 15_000 });
}

const selTrafico = (page: Page) => page.locator('select[title*="Importación / exportación"]');
const selMes = (page: Page) => page.locator('select[title*="Mes de cierre"]');
const selModalidad = (page: Page) => page.locator('select').filter({ hasText: 'Modalidad: todas' });
const fila = (page: Page, folio: string) => page.getByRole('row').filter({ hasText: folio });

// ─── 1 · La columna dice el tráfico, y dice de dónde lo supo ────────────────

test('la columna Tráfico clasifica por folio y por ruta, y «—» cuando no se puede', async ({ browser }) => {
  await sembrarCasos();
  const { page, ctx } = await entrar(browser, 'operaciones@vermur.com');
  await abrirEmbarques(page);

  // Del folio.
  await expect(fila(page, 'VLIM-59-591').getByTitle(/^Importación · Del folio VLIM-59-591/)).toBeVisible();
  await expect(fila(page, 'VLEM-59-592').getByTitle(/^Exportación · Del folio VLEM-59-592/)).toBeVisible();

  // De la ruta: el folio de Magaya no es una serie de Vermur.
  await expect(fila(page, 'BOL 9016599')).toBeVisible();
  await expect(fila(page, 'BOL 9016599').getByText('—').first()).toBeVisible();

  await page.getByPlaceholder(/Buscar por folio/).fill('59-59');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${IMG}/59-lista-trafico-desktop.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${IMG}/59-lista-trafico-movil.png`, fullPage: false });

  await ctx.close();
});

// ─── 2 · El filtro de tráfico, combinado con el de modalidad ────────────────

test('el filtro separa impo de expo y se combina con modalidad', async ({ browser }) => {
  await sembrarCasos();
  const { page, ctx } = await entrar(browser, 'operaciones@vermur.com');
  await abrirEmbarques(page);

  // Positivo previo: sin filtro, TODAS las filas existen; así cada ausencia de
  // abajo es del filtro y no de un folio mal escrito.
  for (const f of ['VLIM-59-591', 'VLEM-59-592', 'VLIA-59-593', 'BOL 9016599']) {
    await expect(fila(page, f)).toBeVisible({ timeout: 15_000 });
  }
  await selTrafico(page).selectOption('impo');
  await page.waitForTimeout(500);
  await expect(fila(page, 'VLIM-59-591')).toBeVisible();
  await expect(fila(page, 'VLIA-59-593')).toBeVisible();
  await expect(fila(page, 'VLEM-59-592')).toHaveCount(0);
  // El que no se pudo clasificar NO se cuenta como importación.
  await expect(fila(page, 'BOL 9016599')).toHaveCount(0);
  await page.screenshot({ path: `${IMG}/59-filtro-impo-desktop.png`, fullPage: true });

  // «Mis importaciones aéreas»: los dos filtros juntos.
  await selModalidad(page).selectOption('aereo');
  await page.waitForTimeout(500);
  await expect(fila(page, 'VLIA-59-593')).toBeVisible();
  await expect(fila(page, 'VLIM-59-591')).toHaveCount(0);
  await page.screenshot({ path: `${IMG}/59-filtro-impo-aereo-desktop.png`, fullPage: true });

  // Y la exportación, sola.
  await selModalidad(page).selectOption('');
  await selTrafico(page).selectOption('expo');
  await page.waitForTimeout(500);
  await expect(fila(page, 'VLEM-59-592')).toBeVisible();
  await expect(fila(page, 'VLIM-59-591')).toHaveCount(0);

  await ctx.close();
});

// ─── 3 · El mes de cierre: arribo en impo, salida en expo ───────────────────

test('el mes de cierre usa el arribo en impo y la salida en expo', async ({ browser }) => {
  await sembrarCasos();
  const { page, ctx } = await entrar(browser, 'operaciones@vermur.com');
  await abrirEmbarques(page);

  for (const f of ['VLIM-59-591', 'VLEM-59-592', 'VLIA-59-593', 'VLET-59-594', 'BOL 9016599']) {
    await expect(fila(page, f)).toBeVisible({ timeout: 15_000 });
  }
  // Septiembre: la impo que arribó el 18-sep y el desconocido que arribó el
  // 30-sep. La expo zarpó en AGOSTO, así que no cierra en septiembre aunque
  // su ETA sea del 25-sep.
  await selMes(page).selectOption('2026-09');
  await page.waitForTimeout(500);
  await expect(fila(page, 'VLIM-59-591')).toBeVisible();
  await expect(fila(page, 'BOL 9016599')).toBeVisible();
  await expect(fila(page, 'VLEM-59-592')).toHaveCount(0);
  await expect(fila(page, 'VLIA-59-593')).toHaveCount(0);
  // La exportación sin ETD no cae en ningún mes, y se dice.
  await expect(fila(page, 'VLET-59-594')).toHaveCount(0);
  await expect(page.getByText(/sin fecha de cierre/)).toBeVisible();
  await page.screenshot({ path: `${IMG}/59-mes-cierre-septiembre-desktop.png`, fullPage: true });

  // Agosto: solo la exportación que zarpó el 11-ago.
  await selMes(page).selectOption('2026-08');
  await page.waitForTimeout(500);
  await expect(fila(page, 'VLEM-59-592')).toBeVisible();
  await expect(fila(page, 'VLIM-59-591')).toHaveCount(0);
  await page.screenshot({ path: `${IMG}/59-mes-cierre-agosto-desktop.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${IMG}/59-mes-cierre-movil.png`, fullPage: false });

  await ctx.close();
});

// ─── 4 · La vista guardada se lleva la columna y los dos filtros ────────────

test('una vista guardada conserva el tráfico y el mes de cierre', async ({ browser }) => {
  await sembrarCasos();
  const { page, ctx } = await entrar(browser, 'operaciones@vermur.com');
  await abrirEmbarques(page);
  await expect(fila(page, 'VLEM-59-592')).toBeVisible({ timeout: 15_000 });

  await selTrafico(page).selectOption('impo');
  await selMes(page).selectOption('2026-09');
  await page.waitForTimeout(500);
  await expect(fila(page, 'VLIM-59-591')).toBeVisible();

  // El nombre lleva el reloj: las vistas se guardan en Firestore y el emulador
  // sobrevive entre corridas, así que un nombre fijo deja tres homónimas.
  const nombreVista = `Impo septiembre ${Date.now()}`;
  await page.getByTitle('Guardar vista actual').click();
  await page.getByPlaceholder('Nombre de la vista...').fill(nombreVista);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('button', { name: nombreVista, exact: true })).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: `${IMG}/59-vista-guardada-desktop.png`, fullPage: true });

  // Volver a la vista por defecto limpia los filtros…
  await page.getByRole('button', { name: nombreVista, exact: true }).first().click();
  await page.getByRole('button', { name: 'Vista por defecto', exact: true }).click();
  await page.waitForTimeout(500);
  await expect(fila(page, 'VLEM-59-592')).toBeVisible();
  await expect(selTrafico(page)).toHaveValue('');

  // …y volver a la vista guardada los trae de regreso, los dos.
  await page.getByRole('button', { name: 'Vista por defecto', exact: true }).click();
  await page.getByRole('button', { name: nombreVista, exact: true }).last().click();
  await page.waitForTimeout(700);
  await expect(selTrafico(page)).toHaveValue('impo');
  await expect(selMes(page)).toHaveValue('2026-09');
  await expect(fila(page, 'VLIM-59-591')).toBeVisible();
  await expect(fila(page, 'VLEM-59-592')).toHaveCount(0);

  await ctx.close();
});
