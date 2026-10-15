/**
 * Tarea 120 — Configuración no llama a `gestionarUsuarios` sin la capacidad.
 *
 * Antes, el estado inicial era «users» y el primer render de un no-admin
 * montaba GestionUsuarios, cuyo efecto pedía la lista: 403 en consola para
 * Ventas, Pricing, Operaciones y Administración. Admin sí debe llamarla.
 * Requiere el emulador de Functions solo para el caso de admin (CON_FUNCTIONS=1).
 */
import { test, expect, type Page } from '@playwright/test';

test.setTimeout(90_000);

async function entrar(page: Page, email: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(process.env.PASSWORD_CUENTAS_PRUEBA ?? '');
  await page.locator('#login-submit').click();
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
}

for (const [rol, email] of [
  ['ventas', 'ventas@vermur.com'],
  ['pricing', 'pricing@vermur.com'],
  ['operaciones', 'operaciones@vermur.com'],
  ['administracion', 'administracion@vermur.com'],
] as const) {
  test(`${rol}: Configuración no pide la lista de usuarios`, async ({ page }) => {
    const llamadas: string[] = [];
    const errores: string[] = [];
    page.on('request', r => { if (r.url().includes('gestionarUsuarios')) llamadas.push(r.url()); });
    page.on('response', r => { if (r.status() === 403) errores.push(r.url()); });
    await entrar(page, email);
    await page.getByRole('button', { name: 'Configuración', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Mi Perfil' })).toBeVisible();
    // La ausencia lleva su positivo: Mi Perfil visible y «Usuarios y roles» fuera del menú.
    await expect(page.getByRole('button', { name: 'Usuarios y roles' })).toHaveCount(0);
    await page.waitForTimeout(1500);
    expect(llamadas).toEqual([]);
    expect(errores).toEqual([]);
    await page.screenshot({ path: `sprint/reportes/img/120-${rol}-escritorio.png` });
    await page.setViewportSize({ width: 390, height: 800 });
    await page.screenshot({ path: `sprint/reportes/img/120-${rol}-angosto.png` });
  });
}

test('admin: Configuración sí lista usuarios', async ({ page }) => {
  const llamadas: string[] = [];
  page.on('request', r => { if (r.url().includes('gestionarUsuarios')) llamadas.push(r.url()); });
  await entrar(page, 'admin@vermur.com');
  await page.getByRole('button', { name: 'Configuración', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Usuarios y Roles' })).toBeVisible();
  await expect.poll(() => llamadas.length).toBeGreaterThan(0);
  await page.screenshot({ path: 'sprint/reportes/img/120-admin-escritorio.png' });
});
