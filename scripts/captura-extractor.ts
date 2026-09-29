/**
 * Captura de pantalla del diálogo de "Cargar tarifario" para el reporte.
 *
 * Uso: ./scripts/dev-emuladores.sh &
 *      npx tsx scripts/captura-extractor.ts
 */

import { chromium, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../sprint/reportes/img');

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // Login como pricing (mismo flujo que el recorrido e2e)
  await page.goto('http://localhost:3100');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill('pricing@vermur.com');
  await page.getByPlaceholder('••••••••').fill('123456');
  await page.locator('#login-submit').click();
  await expect(page.getByText('Emuladores · producción intacta')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });

  // Ir a Tarifas
  await page.getByRole('button', { name: 'Tarifas', exact: true }).first().click();
  await page.waitForTimeout(1500);

  // Buscar y abrir "Cargar tarifario"
  const botonCargar = page.locator('button:has-text("Cargar tarifario")').first();
  if (await botonCargar.isVisible({ timeout: 5000 }).catch(() => false)) {
    await botonCargar.click();
    await page.waitForTimeout(500);
  }

  // Captura desktop
  await page.screenshot({ path: path.join(OUT, '01-cargar-tarifario-desktop.png'), fullPage: false });
  console.log('✓ desktop');

  // Captura angosto
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '01-cargar-tarifario-angosto.png'), fullPage: false });
  console.log('✓ angosto');

  await browser.close();
  console.log('Capturas en', OUT);
}

main().catch(e => { console.error(e); process.exit(1); });
