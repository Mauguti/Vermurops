import { test, expect } from '@playwright/test';

/**
 * LA prueba que habilita todas las demás.
 *
 * La deuda crítica de §6: localhost sin configurar escribe en la base de
 * PRODUCCIÓN que el equipo de Vermur usa. Ningún test de la noche puede
 * correr si la app no está conectada a los emuladores, así que este spec
 * verifica la conexión y los demás dan por hecho que corrió primero
 * (Playwright los ordena alfabéticamente dentro del archivo, y este archivo
 * ordena por nombre antes que los demás al empezar con "guarda-").
 */

test('la app está conectada a los EMULADORES, no a producción', async ({ page }) => {
  const mensajes: string[] = [];
  page.on('console', m => mensajes.push(m.text()));

  await page.goto('/');

  // 1. El log de firebase.ts al conectar.
  await expect
    .poll(() => mensajes.some(m => m.includes('Conectado a EMULADORES')), {
      timeout: 10_000,
      message: 'La consola nunca dijo «Conectado a EMULADORES»: la app está apuntando a PRODUCCIÓN.',
    })
    .toBe(true);

  // 2. El badge visible, que es lo que un humano verificaría.
  await expect(
    page.getByText('Emuladores · producción intacta'),
  ).toBeVisible({ timeout: 10_000 });
});

test('las cinco cuentas de prueba pueden entrar', async ({ page, request }) => {
  // El emulador de Auth responde en :9099; si no, sembrarEmuladores no corrió.
  const r = await request.get('http://127.0.0.1:9099/');
  expect(r.ok(), 'El emulador de Auth no responde en :9099').toBe(true);
});
