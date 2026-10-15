/** Capturas de la tarea 119: «¿Olvidaste tu contraseña?», escritorio y angosto. */
import { test, expect } from '@playwright/test';
import http from 'node:http';

test.setTimeout(60_000);

test('capturas de la solicitud y del mensaje neutro', async ({ browser }) => {
  // El mismo n8n simulado del spec 119; si otro proceso ya lo tiene, se sigue sin él.
  const srv = http.createServer((q, r) => { q.resume(); q.on('end', () => r.writeHead(200).end('{"ok":true}')); });
  await new Promise<void>(res => { srv.once('error', () => res()); srv.listen(9797, '127.0.0.1', () => res()); });

  for (const [nombre, ancho, alto] of [['escritorio', 1280, 800], ['angosto', 390, 800]] as const) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
    const page = await ctx.newPage();
    const errores: string[] = [];
    page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
    await page.goto('/');
    await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
    await page.getByText('¿Olvidaste tu contraseña?').click();
    await page.locator('#rec-email').fill('ventas@vermur.com');
    await page.screenshot({ path: `sprint/reportes/img/119-solicitar-${nombre}.png` });
    await page.locator('#rec-submit').click();
    await expect(page.getByText(/Si tu correo está registrado/)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `sprint/reportes/img/119-enviado-${nombre}.png` });
    expect(errores, errores.join('\n')).toEqual([]);
    await ctx.close();
  }
  await new Promise(r => srv.close(r));
});
