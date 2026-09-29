/**
 * Capturas de la tarea 11 — Tipos de proveedor y patentes de agentes aduanales
 *
 * - Lista de proveedores con la pestaña «Agentes aduanales»
 * - Modal de nuevo proveedor con selector de tipos
 * - Modal de nuevo proveedor con tipos agente_aduanal y sección de patentes
 */
import { test, expect, type Page } from '@playwright/test';

test.setTimeout(60_000);

const PW = '123456';
const IMG = 'sprint/reportes/img';

async function entrar(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill('administracion@vermur.com');
  await page.getByPlaceholder('••••••••').fill(PW);
  await page.locator('#login-submit').click();
  await expect(page.getByText('Emuladores · producción intacta')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
}

test('capturas de tipos y patentes', async ({ page }) => {
  await entrar(page);

  // Ir a Altas
  await page.getByRole('button', { name: 'Altas', exact: true }).first().click();
  await page.waitForTimeout(500);

  // Click en pestaña de Proveedores (el segundo tab del módulo)
  const provTab = page.locator('button').filter({ hasText: /^Proveedores/ });
  await provTab.first().click();
  await page.waitForTimeout(1000);

  // Captura 1: lista de proveedores con las pestañas (desktop)
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${IMG}/11-proveedores-pestanas-desktop.png`, fullPage: false });

  // Captura angosto
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${IMG}/11-proveedores-pestanas-angosto.png`, fullPage: false });

  // Volver a desktop
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);

  // Abrir modal de nuevo proveedor
  const nuevoBtn = page.locator('button').filter({ hasText: /nuevo proveedor/i });
  await nuevoBtn.first().click();
  await page.waitForTimeout(500);

  // Captura 2: modal con selector de tipos visible
  await page.screenshot({ path: `${IMG}/11-modal-tipos-desktop.png`, fullPage: false });

  // Marcar agente_aduanal
  const aduanalLabel = page.locator('label').filter({ hasText: /^Agente aduanal$/ });
  await aduanalLabel.locator('input[type="checkbox"]').check();
  await page.waitForTimeout(300);

  // Agregar una patente
  const addPatenteBtn = page.locator('button').filter({ hasText: /agregar patente/i });
  await addPatenteBtn.first().click();
  await page.waitForTimeout(300);

  // Llenar patente
  await page.locator('input[placeholder="Nombre del agente aduanal"]').first().fill('Lic. Juan Pérez García');
  await page.locator('input[placeholder*="1234"]').first().fill('3847');
  await page.waitForTimeout(300);

  // Captura 3: modal con agente_aduanal seleccionado y patentes
  await page.screenshot({ path: `${IMG}/11-modal-patentes-desktop.png`, fullPage: false });

  // Captura angosta del modal
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${IMG}/11-modal-patentes-angosto.png`, fullPage: false });
});
