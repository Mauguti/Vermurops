/**
 * Tarea 104 — la importación con IA entiende «por kg cobrable».
 *
 *   Pricing sube un tarifario (el extractor se simula por ruta: n8n no acepta
 *   el token del emulador). Las líneas aéreas con escalas llegan como
 *   KG_COBRABLE con su editor de factor, mínimo y escalas; la línea de un
 *   documento sin contexto que dice «kg» queda SIN unidad, con el aviso, y
 *   una de «ton» sigue siendo TON.
 */
import { test, expect, type Page } from '@playwright/test';
import { fijarPreferencias } from './preferencias';

test.beforeAll(async () => { await fijarPreferencias(); });
test.setTimeout(120_000);

const IMG = 'sprint/reportes/img';

const RESPUESTA = {
  ok: true, proveedor: 'Aerolínea Demo 104', confianza: 'alta',
  observaciones: 'Tarifa de flete aéreo, AWB',
  vigenciaTexto: 'Prueba 104', fechaInicio: '2026-10-01', fechaFin: '2026-12-31',
  tarifas: [
    { lineaId: 'a1', concepto: 'Flete aéreo', unidad: 'kg', monto: 5.1, montoMinimo: 85, moneda: 'USD', condiciones: 'Hasta 45 kg' },
    { lineaId: 'a2', concepto: 'Flete aéreo', unidad: 'kg', monto: 4.2, moneda: 'USD', condiciones: '+45 kg' },
    { lineaId: 'm1', concepto: 'Flete marítimo', unidad: 'ton', monto: 38, moneda: 'USD' },
  ],
};

// Sin contexto aéreo: «kg» queda sin unidad.
const RESPUESTA_AMBIGUA = {
  ok: true, proveedor: 'Transportes Demo 104', confianza: 'alta', vigenciaTexto: 'Prueba 104b',
  tarifas: [{ lineaId: 'x1', concepto: 'Flete', unidad: 'kg', monto: 0.8, moneda: 'USD' }],
};

async function abrirRevision(page: Page, respuesta: unknown) {
  await page.route('**/extraerTarifas**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(respuesta) }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill('pricing@vermur.com');
  await page.getByPlaceholder('••••••••').fill('123456');
  await page.locator('#login-submit').click();
  await expect(page.getByText('Emuladores · producción intacta')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Tarifas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cargar tarifario' }).first().click();
  // El proveedor se pide antes de subir.
  await page.getByRole('button', { name: 'Seleccionar proveedor' }).click();
  await page.getByPlaceholder('Buscar proveedor…').fill('a');
  await page.locator('button:has(svg) span.truncate').locator('visible=true').first().click();
  await page.locator('input[type=file]').setInputFiles({
    name: `tarifario-104-${Date.now()}.csv`, mimeType: 'text/csv',
    buffer: Buffer.from(`concepto,unidad,monto\nFlete,kg,${Date.now()}\n`),
  });
  await expect(page.getByTestId('editor-cobrable').or(page.getByTestId('unidad-ambigua')).first())
    .toBeVisible({ timeout: 30_000 });
}

test('Aéreo con escalas: kg → KG_COBRABLE con su editor; ton sigue siendo TON', async ({ page }) => {
  await abrirRevision(page, RESPUESTA);
  const editores = page.getByTestId('editor-cobrable');
  await expect(editores).toHaveCount(2);                       // las dos líneas «kg»
  // La línea marítima por tonelada NO trae editor de kg cobrable.
  await expect(page.locator('select').filter({ has: page.locator('option[value="TON"]:checked') })).toHaveCount(1);
  await expect(page.getByTestId('unidad-ambigua')).toHaveCount(0);
  // Sin factor: el aéreo no lo necesita (rige el 167), pero la escala vacía sí marca.
  await editores.first().getByTestId('cobrable-agregar-escala').click();
  await expect(editores.first().getByText(/escala necesita|«desde» mayor/i)).toBeVisible();
  await editores.first().getByTestId('cobrable-escala').locator('input').nth(0).fill('45');
  await editores.first().getByTestId('cobrable-escala').locator('input').nth(1).fill('4.2');
  await expect(editores.first().getByText(/escala necesita|«desde» mayor/i)).toHaveCount(0);
  await page.screenshot({ path: `${IMG}/104-revision-aereo-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${IMG}/104-revision-aereo-angosto.png`, fullPage: true });
});

test('Ambiguo: «kg» sin contexto queda sin unidad y avisa', async ({ page }) => {
  await abrirRevision(page, RESPUESTA_AMBIGUA);
  await expect(page.getByTestId('unidad-ambigua')).toBeVisible();
  await expect(page.getByTestId('editor-cobrable')).toHaveCount(0);
  await expect(page.getByText('Falta la unidad')).toBeVisible();
  await page.screenshot({ path: `${IMG}/104-revision-ambiguo-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${IMG}/104-revision-ambiguo-angosto.png`, fullPage: true });
});
