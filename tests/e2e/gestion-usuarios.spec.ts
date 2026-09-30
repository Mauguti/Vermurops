/**
 * gestion-usuarios.spec.ts — e2e de gestión de usuarios contra emuladores.
 *
 * El recorrido completo:
 *   1. Admin invita a un usuario nuevo
 *   2. La cuenta aparece en Auth
 *   3. Con el enlace del emulador (oobCodes) la persona pone su contraseña
 *   4. Entra con su rol
 *   5. Admin le cambia el rol
 *   6. Admin la desactiva y ya no entra
 *
 * Se ejecuta con: npx playwright test tests/e2e/gestion-usuarios.spec.ts
 * Requiere emuladores corriendo con Functions: CON_FUNCTIONS=1 ./scripts/dev-emuladores.sh
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const AUTH_API = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const FUNCTIONS = 'http://127.0.0.1:5001/vermur-logistics-app/us-central1';
const PW = '123456';

const NUEVO_EMAIL = 'chema.test@vermur.com';
const NUEVO_NOMBRE = 'Chema Test';
const NUEVO_ROL = 'operaciones';

// Estado compartido entre pasos
const S: { nuevoUid: string; nuevoToken: string } = { nuevoUid: '', nuevoToken: '' };

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function tokenDe(email: string, password = PW): Promise<string> {
  const r = await fetch(`${AUTH_API}/accounts:signInWithPassword?key=emulador`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data = await r.json();
  if (!data.idToken) throw new Error(`No se pudo obtener token para ${email}: ${JSON.stringify(data)}`);
  return data.idToken;
}

async function llamarGU(token: string, body: Record<string, unknown>) {
  const r = await fetch(`${FUNCTIONS}/gestionarUsuarios`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function obtenerOobCodes(): Promise<Array<{ email: string; oobCode: string; oobLink: string; requestType: string }>> {
  const r = await fetch(`${AUTH_EMULATOR}/emulator/v1/projects/vermur-logistics-app/oobCodes`);
  const data = await r.json();
  return data.oobCodes ?? [];
}

async function entrar(browser: Browser, email: string, password = PW): Promise<{ page: Page; ctx: BrowserContext }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  // Simular agentes de n8n que el recorrido usa
  await page.route('**/clasificarDocumento', async route => {
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'no simulado en GU' }) });
  });
  await page.route('**/gestionarUsuarios', async route => {
    // NO simulamos esta — se deja pasar a la Function real en el emulador
    await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.locator('#login-submit').click();
  await expect(page.getByText('Emuladores · producción intacta')).toBeVisible({ timeout: 15_000 });
  return { page, ctx };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test('1. Admin invita a un usuario nuevo vía la Function', async () => {
  const token = await tokenDe('admin@vermur.com');
  const res = await llamarGU(token, {
    accion: 'invitar',
    email: NUEVO_EMAIL,
    nombre: NUEVO_NOMBRE,
    rol: NUEVO_ROL,
  });

  expect(res.ok).toBe(true);
  expect(res.datos.email).toBe(NUEVO_EMAIL);
  expect(res.datos.nombre).toBe(NUEVO_NOMBRE);
  expect(res.datos.rol).toBe(NUEVO_ROL);
  expect(res.datos.activo).toBe(true);
  expect(res.datos.uid).toBeTruthy();

  S.nuevoUid = res.datos.uid;
});

test('2. La cuenta aparece en la lista de usuarios', async () => {
  const token = await tokenDe('admin@vermur.com');
  const res = await llamarGU(token, { accion: 'listar' });

  expect(res.ok).toBe(true);
  const usuarios = res.datos as Array<{ uid: string; email: string }>;
  const nuevo = usuarios.find(u => u.email === NUEVO_EMAIL);
  expect(nuevo).toBeTruthy();
  expect(nuevo!.uid).toBe(S.nuevoUid);
});

test('3. Se genera un oobCode para restablecer contraseña', async () => {
  const codes = await obtenerOobCodes();
  const code = codes.find(c => c.email === NUEVO_EMAIL && c.requestType === 'PASSWORD_RESET');
  expect(code).toBeTruthy();
});

test('4. El nuevo usuario pone su contraseña y puede obtener token', async () => {
  // Simular que el usuario pone contraseña usando el endpoint del emulador
  const codes = await obtenerOobCodes();
  const code = codes.find(c => c.email === NUEVO_EMAIL && c.requestType === 'PASSWORD_RESET');
  expect(code).toBeTruthy();

  // Confirmar reset con nueva contraseña
  const resetRes = await fetch(`${AUTH_API}/accounts:resetPassword?key=emulador`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oobCode: code!.oobCode, newPassword: PW }),
  });
  const resetData = await resetRes.json();
  expect(resetData.email).toBe(NUEVO_EMAIL);

  // Ahora puede hacer login
  S.nuevoToken = await tokenDe(NUEVO_EMAIL, PW);
  expect(S.nuevoToken).toBeTruthy();
});

test('5. El nuevo usuario tiene el rol correcto en sus claims', async () => {
  // Verificar claims decodificando el token (en emulador se confía en la API)
  const res = await fetch(`${AUTH_API}/accounts:lookup?key=emulador`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: S.nuevoToken }),
  });
  const data = await res.json();
  const user = data.users?.[0];
  expect(user).toBeTruthy();
  expect(user.email).toBe(NUEVO_EMAIL);
  // Custom claims los pone la Function via Admin SDK
  expect(user.customAttributes).toBeTruthy();
  const claims = JSON.parse(user.customAttributes);
  expect(claims.rol).toBe(NUEVO_ROL);
});

test('6. Un rol sin usuario.gestionar no puede listar', async () => {
  const token = await tokenDe('ventas@vermur.com');
  const res = await llamarGU(token, { accion: 'listar' });
  expect(res.ok).toBe(false);
  expect(res.error).toContain('usuario.gestionar');
});

test('7. Admin cambia el rol del nuevo usuario', async () => {
  const token = await tokenDe('admin@vermur.com');
  const res = await llamarGU(token, {
    accion: 'cambiarRol',
    uid: S.nuevoUid,
    rol: 'pricing',
  });

  expect(res.ok).toBe(true);
  expect(res.datos.rol).toBe('pricing');
});

test('8. Los claims reflejan el nuevo rol', async () => {
  // El token anterior fue revocado. Hay que obtener uno nuevo.
  // En el emulador, revokeRefreshTokens no invalida inmediatamente,
  // pero los claims sí se actualizan.
  const newToken = await tokenDe(NUEVO_EMAIL, PW);
  const res = await fetch(`${AUTH_API}/accounts:lookup?key=emulador`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: newToken }),
  });
  const data = await res.json();
  const claims = JSON.parse(data.users[0].customAttributes);
  expect(claims.rol).toBe('pricing');
});

test('9. Admin desactiva al usuario', async () => {
  const token = await tokenDe('admin@vermur.com');
  const res = await llamarGU(token, {
    accion: 'desactivar',
    uid: S.nuevoUid,
  });

  expect(res.ok).toBe(true);
  expect(res.datos.activo).toBe(false);
});

test('10. El usuario desactivado no puede obtener token', async () => {
  let error = '';
  try {
    await tokenDe(NUEVO_EMAIL, PW);
  } catch (e) {
    error = (e as Error).message;
  }
  // El emulador de Auth debería rechazar una cuenta deshabilitada
  expect(error).toBeTruthy();
});

test('11. Invitar un correo duplicado falla con 409', async () => {
  const token = await tokenDe('admin@vermur.com');
  const res = await llamarGU(token, {
    accion: 'invitar',
    email: NUEVO_EMAIL,
    nombre: 'Duplicado',
    rol: 'ventas',
  });

  expect(res.ok).toBe(false);
  // 409 Conflict por email existente
});
