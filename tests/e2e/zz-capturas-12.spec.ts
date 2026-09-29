/**
 * Capturas de la tarea 12: «Ver como cliente» y bitácora de documentos sensibles.
 */
import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const PW = '123456';
const IMG = 'sprint/reportes/img';

async function entrar(browser: Browser, email: string): Promise<{ page: Page; ctx: BrowserContext }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.route('**/clasificarDocumento**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      tipo: 'bl_maritimo', confianza: 'alta', avisos: [], datos: {},
      destinoSugerido: 'documentos',
    }) }));
  await page.route('**/extraerTarifas**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"tarifas":[]}' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(PW);
  await page.locator('#login-submit').click();
  await expect(page.getByText('Emuladores · producción intacta')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
  return { page, ctx };
}

test('Capturas de «Ver como cliente» en el embarque', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'operaciones@vermur.com');

  // Ir a Embarques → Todos los embarques
  await page.getByRole('button', { name: 'Embarques', exact: true }).first().click();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /Todos los embarques/i }).click();
  await page.waitForTimeout(2000);

  // Buscar el embarque VLIM en la tabla
  const fila = page.locator('tr').filter({ hasText: /VLIM/ }).first();
  await expect(fila).toBeVisible({ timeout: 10_000 });
  // Click en el folio
  await fila.locator('td').first().click();
  await page.waitForTimeout(2000);

  // Esperar a que la ficha cargue: buscar el botón
  const btn = page.getByRole('button', { name: /Ver como cliente/i });
  await expect(btn).toBeVisible({ timeout: 10_000 });

  // Captura desktop: botón visible en el encabezado
  await page.screenshot({ path: `${IMG}/12-boton-ver-como-cliente-desktop.png`, fullPage: false });

  // Abrir la vista previa
  await btn.click();
  await expect(page.getByText('Vista previa · Así lo vería el cliente')).toBeVisible({ timeout: 5_000 });
  await page.screenshot({ path: `${IMG}/12-vista-cliente-desktop.png`, fullPage: false });

  // Cerrar
  await page.getByTitle('Cerrar vista previa').click();
  await page.waitForTimeout(300);

  // Angosto
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);

  await page.screenshot({ path: `${IMG}/12-boton-ver-como-cliente-angosto.png`, fullPage: false });

  await btn.click();
  await expect(page.getByText('Vista previa · Así lo vería el cliente')).toBeVisible({ timeout: 5_000 });
  await page.screenshot({ path: `${IMG}/12-vista-cliente-angosto.png`, fullPage: false });

  await ctx.close();
});
