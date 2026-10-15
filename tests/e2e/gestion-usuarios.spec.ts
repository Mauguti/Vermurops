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

// Único por corrida: invitar un correo que ya existe falla con 409, y REPETIR=2 corre sobre la misma base.
const NUEVO_EMAIL = `chema.test.${Date.now()}@vermur.com`;
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

test('1. Admin invita desde la PANTALLA, no por la Function', async ({ browser }) => {
  /*
   * La invitación va por la interfaz a propósito.
   *
   * ── Historia de este paso, que ya lleva dos arreglos ─────────────────────
   * 1. Llamaba a la Function directo, y el oobCode del paso 3 lo producía
   *    `generatePasswordResetLink`: ese método GENERA el enlace y no manda
   *    nada, así que la prueba pasaba mientras el correo no llegaba a nadie.
   * 2. Se pasó el envío a la app con `sendPasswordResetEmail`… y resultó que
   *    **el correo de Firebase no llega a vermur.com** (SPF `-all`, sin DKIM
   *    ni DMARC). Las siete invitaciones del 13-oct se perdieron ahí. Y este
   *    test seguía en verde, porque el SDK resuelve sin error aunque el
   *    mensaje muera después: el emulador registraba el oobCode igual.
   *
   * Desde el 15-oct el enlace lo genera el servidor y el mensaje sale por el
   * flujo «enviar-correo» de n8n. **En el emulador no hay n8n**, así que lo
   * que este test comprueba es el camino de FALLO, y lo comprueba de verdad:
   * la cuenta queda creada y la pantalla DICE que el correo no salió. El
   * camino bueno (n8n contesta 200) vive en
   * `functions/src/correo/correoPorN8n.test.ts`, con `fetch` simulado.
   */
  const { page, ctx } = await entrar(browser, 'admin@vermur.com');

  await page.getByRole('button', { name: 'Configuración', exact: true }).first().click();
  // Configuración abre en «Usuarios y roles»; si cambiara el default, el clic lo asegura.
  const seccion = page.getByRole('button', { name: /Usuarios y roles/ }).first();
  if (await seccion.count()) await seccion.click();

  await page.getByRole('button', { name: 'Invitar usuario' }).click();
  await page.getByPlaceholder('nombre@vermur.com').fill(NUEVO_EMAIL);
  await page.getByPlaceholder('Luis Rentería').fill(NUEVO_NOMBRE);
  await page.locator('select').first().selectOption(NUEVO_ROL);
  await page.getByRole('button', { name: 'Invitar', exact: true }).click();

  /*
   * El aviso, no el renglón de la tabla: los dos traen el correo.
   *
   * Sin n8n arriba, el aviso correcto es el de fallo — y tiene que decir las
   * DOS cosas, porque son dos: la cuenta quedó creada y el correo no salió.
   * Un «se invitó» a secas mandaría a esperar un correo que nunca llega, que
   * es exactamente el 13-oct.
   */
  await expect(page.getByText(/quedó creada, pero el correo NO salió/))
    .toBeVisible({ timeout: 30_000 });
  // Y el positivo junto a la ausencia (§4.42): NO debe afirmar que llegó.
  await expect(page.getByText(/Le llegó un correo para poner su contraseña/)).toHaveCount(0);
  await ctx.close();

  // El uid se toma de la lista, que es lo que la pantalla acaba de refrescar.
  const token = await tokenDe('admin@vermur.com');
  const res = await llamarGU(token, { accion: 'listar' });
  const nuevo = (res.datos as Array<{ uid: string; email: string; rol: string; activo: boolean }>)
    .find(u => u.email === NUEVO_EMAIL);
  expect(nuevo, 'la invitación desde la pantalla no creó la cuenta').toBeTruthy();
  expect(nuevo!.rol).toBe(NUEVO_ROL);
  expect(nuevo!.activo).toBe(true);
  S.nuevoUid = nuevo!.uid;
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

test('3. El enlace se generó, aunque el correo no haya salido', async () => {
  /*
   * ⚠️ Este oobCode YA NO prueba que el correo se mandó: lo produce
   * `generatePasswordResetLink` en el servidor, antes de hablarle a n8n.
   * Durante dos versiones de este archivo sí era la prueba del envío, y las
   * dos veces se equivocó —es la misma trampa, en el mismo test, dos veces—.
   *
   * Lo que prueba hoy: que el servidor llegó hasta el enlace. Es la mitad
   * del arreglo, y la mitad que el paso 4 necesita para poder entrar.
   * Que el mensaje salga lo prueba `correoPorN8n.test.ts`.
   */
  const codes = await obtenerOobCodes();
  const code = codes.find(c => c.email === NUEVO_EMAIL && c.requestType === 'PASSWORD_RESET');
  expect(code, 'sin oobCode: el servidor no generó el enlace de la invitación').toBeTruthy();
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

/*
 * ── «Reenviar invitación» (15-oct-2026) ───────────────────────────────────
 * La acción nueva. Las siete cuentas del 13-oct se reenvían con esto, así que
 * lo que importa es que NO toque la cuenta y que diga la verdad del envío.
 */
test('12. Reenviar a una cuenta que no existe: 404, y no crea nada', async () => {
  const token = await tokenDe('admin@vermur.com');
  const antes = (await llamarGU(token, { accion: 'listar' })).datos as unknown[];

  const res = await llamarGU(token, { accion: 'reenviar', email: 'no.existe@vermur.com' });
  expect(res.ok).toBe(false);
  expect(String(res.error)).toMatch(/No hay ninguna cuenta/);

  // El positivo: reenviar NO es un alta encubierta.
  const despues = (await llamarGU(token, { accion: 'listar' })).datos as unknown[];
  expect(despues.length).toBe(antes.length);
});

test('13. Reenviar a una cuenta DESACTIVADA se niega, en vez de mandar un enlace inútil', async () => {
  /*
   * El paso 9 desactivó a NUEVO_EMAIL. Mandarle el enlace lo dejaría poner
   * contraseña para una cuenta que no puede obtener token (paso 10): un
   * correo que promete acceso y no lo da.
   */
  const token = await tokenDe('admin@vermur.com');
  const res = await llamarGU(token, { accion: 'reenviar', email: NUEVO_EMAIL });
  expect(res.ok).toBe(false);
  expect(String(res.error)).toMatch(/desactivada/);
});

test('14. Reenviar a una cuenta viva: la cuenta no cambia, y el fallo de envío se dice', async () => {
  /*
   * Sin n8n arriba el envío falla, y eso es lo que se comprueba: que la
   * acción conteste `correoEnviado: false` con su motivo en vez de lanzar.
   * Se usa una cuenta del equipo que el recorrido no toca.
   */
  const token = await tokenDe('admin@vermur.com');
  const antes = (await llamarGU(token, { accion: 'listar' })).datos as Array<{ email: string; rol: string; activo: boolean }>;
  const victima = antes.find(u => u.email === 'ventas@vermur.com');
  expect(victima, 'no está la cuenta de ventas del emulador').toBeTruthy();

  const res = await llamarGU(token, { accion: 'reenviar', email: 'ventas@vermur.com' });
  expect(res.ok).toBe(true);
  const datos = res.datos as { correoEnviado: boolean; motivoCorreo?: string };
  expect(datos.correoEnviado).toBe(false);
  expect(datos.motivoCorreo, 'un envío que falla sin motivo no se puede accionar').toBeTruthy();

  // Y la cuenta quedó igual: reenviar no cambia rol ni estado.
  const despues = (await llamarGU(token, { accion: 'listar' })).datos as Array<{ email: string; rol: string; activo: boolean }>;
  const igual = despues.find(u => u.email === 'ventas@vermur.com');
  expect(igual!.rol).toBe(victima!.rol);
  expect(igual!.activo).toBe(victima!.activo);
});

test('15. La pantalla distingue a quien NUNCA entró de quien ya entró', async ({ browser }) => {
  /*
   * El renglón de una invitación pendiente tiene que verse distinto del de
   * alguien que ya opera, y traer su botón. Antes no: todos decían «Activo»
   * en verde y **el botón «Reenviar invitación» no existía en la tabla** —el
   * prop se pasaba de arriba a abajo y ningún renglón lo llamaba, mientras el
   * aviso de error mandaba a usarlo.
   *
   * Se invita a una cuenta nueva aquí mismo para no depender de los pasos
   * anteriores (el 9 desactivó a NUEVO_EMAIL).
   */
  /*
   * Correo ÚNICO por corrida: con uno fijo, el reintento de Playwright choca
   * con la cuenta que dejó el intento anterior (409) y el fallo se lee como
   * si la pantalla estuviera mal. Y el nombre NO lleva la palabra
   * «Pendiente»: el primer intento de este test se cayó porque
   * `getByText('Pendiente')` casaba también con el nombre de la persona.
   */
  const PENDIENTE = `sin.entrar.${Date.now()}@vermur.com`;
  const { page, ctx } = await entrar(browser, 'admin@vermur.com');

  await page.getByRole('button', { name: 'Configuración', exact: true }).first().click();
  const seccion = page.getByRole('button', { name: /Usuarios y roles/ }).first();
  if (await seccion.count()) await seccion.click();

  await page.getByRole('button', { name: 'Invitar usuario' }).click();
  await page.getByPlaceholder('nombre@vermur.com').fill(PENDIENTE);
  await page.getByPlaceholder('Luis Rentería').fill('Rocío Vega');
  await page.locator('select').first().selectOption('ventas');
  await page.getByRole('button', { name: 'Invitar', exact: true }).click();
  await expect(page.getByText(/quedó creada, pero el correo NO salió/)).toBeVisible({ timeout: 30_000 });

  const fila = (correo: string) => page.locator('tr', { hasText: correo });
  const estado = (correo: string) => fila(correo).getByTestId('estado-acceso');

  // El pendiente: con rol puesto, nunca entró → «Pendiente» y SÍ su botón.
  await expect(estado(PENDIENTE)).toHaveText('Pendiente', { timeout: 15_000 });
  await expect(fila(PENDIENTE).getByRole('button', { name: 'Reenviar invitación' })).toBeVisible();
  // Y tiene rol: tener rol no quita el botón (lo corrigió Mau el 15-oct).
  await expect(fila(PENDIENTE).getByRole('button', { name: /Ventas/i })).toBeVisible();

  /*
   * El positivo junto a la ausencia (§4.42): admin acaba de iniciar sesión en
   * este mismo test, así que su renglón dice «Entró» y NO trae el botón. Sin
   * este par, «no está el botón» pasaría aunque la tabla no se hubiera
   * pintado.
   */
  await expect(estado('admin@vermur.com')).toHaveText('Entró');
  await expect(fila('admin@vermur.com').getByRole('button', { name: 'Reenviar invitación' }))
    .toHaveCount(0);

  await ctx.close();
});

test('16. «Reenviar invitación» da señal: Enviando…, aviso, y bloqueo de 10 min', async ({ browser }) => {
  /*
   * Antes el botón no daba NINGUNA señal: se pulsaba y no se sabía si había
   * mandado. En el emulador n8n está bloqueado a propósito (§4.73), así que
   * lo que se comprueba aquí es el camino de FALLO — y es el que importa más:
   * el aviso tiene que decir lo que contestó n8n, y el botón NO debe quedar
   * bloqueado, porque el bloqueo es para un envío que salió.
   */
  const PEND = `reenvio.${Date.now()}@vermur.com`;
  const { page, ctx } = await entrar(browser, 'admin@vermur.com');

  await page.getByRole('button', { name: 'Configuración', exact: true }).first().click();
  const seccion = page.getByRole('button', { name: /Usuarios y roles/ }).first();
  if (await seccion.count()) await seccion.click();

  await page.getByRole('button', { name: 'Invitar usuario' }).click();
  await page.getByPlaceholder('nombre@vermur.com').fill(PEND);
  await page.getByPlaceholder('Luis Rentería').fill('Rocío Vega');
  await page.locator('select').first().selectOption('ventas');
  await page.getByRole('button', { name: 'Invitar', exact: true }).click();
  await expect(page.getByText(/quedó creada, pero el correo NO salió/)).toBeVisible({ timeout: 30_000 });

  const fila = page.locator('tr', { hasText: PEND });
  const boton = fila.getByTestId('reenviar-invitacion');

  // El positivo: el botón existe y se puede pulsar.
  await expect(boton).toBeEnabled();
  await expect(boton).toHaveText('Reenviar invitación');

  await boton.click();

  // El aviso dice a quién, y dice el motivo que vino del servidor.
  await expect(page.getByText(new RegExp(`No salió la invitación a ${PEND.replace('.', '\\.')}`)))
    .toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/En emulador no se manda correo de verdad/)).toBeVisible();

  /*
   * Y el botón sigue disponible: un envío que NO salió no gasta el bloqueo de
   * diez minutos. Si se bloqueara, la persona se quedaría sin poder
   * reintentar justo cuando hay que reintentar.
   */
  await expect(boton).toBeEnabled();
  await expect(boton).toHaveText('Reenviar invitación');

  await ctx.close();
});
