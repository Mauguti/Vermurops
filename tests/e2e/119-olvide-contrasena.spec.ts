/**
 * 119 — «¿Olvidaste tu contraseña?» por el correo de n8n, contra emuladores.
 *
 * Requiere el emulador de Functions: se corre con `CON_FUNCTIONS=1 ./scripts/e2e.sh`
 * (lo hace e2e-completo.sh), que apunta VERMUR_N8N_CORREO_SIMULADO a este
 * simulador en 127.0.0.1:9797. Ningún correo sale de verdad.
 */
import { test, expect } from '@playwright/test';
import http from 'node:http';

test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

const AUTH_API = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const FUNCION = 'http://127.0.0.1:5001/vermur-logistics-app/us-central1/solicitarRestablecimiento';
const NEUTRO = /Si tu correo está registrado, te llegará un enlace/;

interface Recibido { token: string | undefined; cuerpo: { para: string; asunto: string; html: string; texto: string } }
const recibidos: Recibido[] = [];
let servidor: http.Server;

test.beforeAll(async () => {
  servidor = http.createServer((req, res) => {
    let raw = '';
    req.on('data', d => { raw += d; });
    req.on('end', () => {
      recibidos.push({ token: req.headers['x-vermur-token'] as string | undefined, cuerpo: JSON.parse(raw) });
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>(r => servidor.listen(9797, '127.0.0.1', r));
});
test.afterAll(async () => { await new Promise(r => servidor.close(r)); });

async function pedir(email: string) {
  const r = await fetch(FUNCION, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
  });
  return { status: r.status, cuerpo: await r.json() as { ok: boolean; mensaje?: string; error?: string } };
}

async function abrirRecuperacion(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByText('¿Olvidaste tu contraseña?').click();
}

test('1. Desde la pantalla: cuenta real → mensaje neutro, correo por n8n y enlace que sirve', async ({ page }) => {
  await abrirRecuperacion(page);
  await page.locator('#rec-email').fill('ventas@vermur.com');
  await page.locator('#rec-submit').click();
  await expect(page.getByText(NEUTRO)).toBeVisible({ timeout: 30_000 });

  expect(recibidos).toHaveLength(1);
  const { token, cuerpo } = recibidos[0];
  // Que viaje presente; su valor no se compara (lo pone el emulador).
  expect(token?.length).toBeGreaterThan(0);
  expect(cuerpo.para).toBe('ventas@vermur.com');
  expect(cuerpo.asunto).toMatch(/Restablecer contraseña/);
  expect(cuerpo.html).toContain('Restablecer contraseña');

  // El enlace del correo trae un código que la app acepta.
  const enlace = cuerpo.texto.split('\n').find(l => l.startsWith('http'))!;
  const oobCode = new URL(enlace).searchParams.get('oobCode')!;
  expect(oobCode).toBeTruthy();
  await page.goto(`/?mode=resetPassword&oobCode=${encodeURIComponent(oobCode)}`);
  await expect(page.getByText('ventas@vermur.com').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#rec-p1')).toBeVisible();
});

test('2. Correo sin cuenta: la MISMA respuesta y no sale nada', async ({ page }) => {
  const antes = recibidos.length;
  await abrirRecuperacion(page);
  await page.locator('#rec-email').fill('nadie.existe@vermur.com');
  await page.locator('#rec-submit').click();
  await expect(page.getByText(NEUTRO)).toBeVisible({ timeout: 30_000 });
  expect(recibidos.length).toBe(antes);

  const real = await pedir('pricing@vermur.com');
  const falso = await pedir('otro.inexistente@vermur.com');
  expect(falso).toEqual(real);
  expect(real.status).toBe(200);
});

test('3. Máximo 3 por correo por hora: el 4º responde igual y no envía', async () => {
  const antes = recibidos.filter(r => r.cuerpo.para === 'operaciones@vermur.com').length;
  const respuestas = [];
  for (let i = 0; i < 4; i++) respuestas.push(await pedir('Operaciones@vermur.com'));
  expect(new Set(respuestas.map(r => JSON.stringify(r))).size).toBe(1);
  const despues = recibidos.filter(r => r.cuerpo.para === 'operaciones@vermur.com').length;
  expect(despues - antes).toBe(3);
});

test('4. Cuenta deshabilitada: la misma respuesta y no recibe enlace', async () => {
  const alta = await (await fetch(`${AUTH_API}/accounts:signUp?key=emulador`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'baja.test@vermur.com', password: process.env.PASSWORD_CUENTAS_PRUEBA ?? '', returnSecureToken: true }),
  })).json() as { localId: string };
  const des = await fetch(`${AUTH_API}/projects/vermur-logistics-app/accounts:update`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: alta.localId, disableUser: true }),
  });
  expect(des.ok).toBe(true);

  const r = await pedir('baja.test@vermur.com');
  expect(r.status).toBe(200);
  expect(r.cuerpo.mensaje).toMatch(NEUTRO);
  expect(recibidos.some(x => x.cuerpo.para === 'baja.test@vermur.com')).toBe(false);
  // Positivo: la misma Function sí manda a una cuenta activa (caso 1).
  expect(recibidos.some(x => x.cuerpo.para === 'ventas@vermur.com')).toBe(true);
});

test('5. Un correo mal escrito es 400, no la respuesta neutra', async () => {
  const r = await pedir('esto-no-es-un-correo');
  expect(r.status).toBe(400);
});
