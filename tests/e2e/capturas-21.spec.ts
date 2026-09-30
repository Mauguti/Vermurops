/**
 * capturas-21.spec.ts — capturas de la pantalla de Usuarios para el reporte.
 *
 * Requiere: CON_FUNCTIONS=1 ./scripts/dev-emuladores.sh
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(60_000);

const AUTH_API = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const FUNCTIONS = 'http://127.0.0.1:5001/vermur-logistics-app/us-central1';
const PW = '123456';
const IMG = 'sprint/reportes/img';

async function tokenDe(email: string): Promise<string> {
  const r = await fetch(`${AUTH_API}/accounts:signInWithPassword?key=emulador`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW, returnSecureToken: true }),
  });
  const data = await r.json();
  return data.idToken;
}

async function llamarGU(token: string, body: Record<string, unknown>) {
  const r = await fetch(`${FUNCTIONS}/gestionarUsuarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function entrar(browser: Browser, email: string): Promise<{ page: Page; ctx: BrowserContext }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.route('**/clasificarDocumento', async route => {
    await route.fulfill({ status: 400, body: '{"ok":false}' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(PW);
  await page.locator('#login-submit').click();
  await expect(page.getByText('Emuladores · producción intacta')).toBeVisible({ timeout: 15_000 });
  return { page, ctx };
}

test('captura: sembrar usuarios y tomar capturas', async ({ browser }) => {
  // Sembrar usuarios vía la Function
  const token = await tokenDe('admin@vermur.com');
  await llamarGU(token, { accion: 'invitar', email: 'itzel.laurean@vermur.com', nombre: 'Itzel Laurean', rol: 'ventas' });
  await llamarGU(token, { accion: 'invitar', email: 'nohema.sosa@vermur.com', nombre: 'Nohema Sosa', rol: 'pricing' });
  await llamarGU(token, { accion: 'invitar', email: 'angel.luna@vermur.com', nombre: 'Angel Luna', rol: 'operaciones' });
  await llamarGU(token, { accion: 'invitar', email: 'julio.gutierrez@vermur.com', nombre: 'Julio Gutierrez', rol: 'administracion' });

  // Entrar como admin
  const { page, ctx } = await entrar(browser, 'admin@vermur.com');

  // Ir a Configuración → Usuarios
  await page.getByRole('button', { name: 'Configuración' }).click();
  await page.getByRole('button', { name: 'Usuarios y roles' }).click();
  await page.waitForTimeout(2000);

  // Captura en escritorio
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${IMG}/21-usuarios-desktop.png`, fullPage: false });

  // Captura en angosto (móvil)
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${IMG}/21-usuarios-movil.png`, fullPage: true });

  // Captura del modal de invitación
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  const invitarBtn = page.getByRole('button', { name: 'Invitar usuario' });
  if (await invitarBtn.isVisible()) {
    await invitarBtn.click();
    await page.waitForTimeout(500);
    // Escribir un correo fuera de reglas para ver la advertencia
    await page.getByPlaceholder('nombre@vermur.com').fill('chema@vermur.com');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${IMG}/21-modal-invitar.png`, fullPage: false });
  }

  await ctx.close();
});
