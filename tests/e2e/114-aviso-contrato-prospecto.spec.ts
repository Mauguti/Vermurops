/**
 * Tarea 114 — aviso de contrato en la ficha del prospecto convertido.
 *
 * Un prospecto convertido con una cotización ganada sin contrato firmado
 * muestra el mismo aviso ámbar de la 102 junto al folio de la cotización.
 * Los documentos se siembran por la REST del emulador y se borran al final.
 */
import { test, expect, type Page } from '@playwright/test';

test.setTimeout(120_000);

const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const IMG = 'sprint/reportes/img';
const PID = 'PRO-E2E-114';
const QID = 'COT-E2E-114';
const s = (stringValue: string) => ({ stringValue });
const arr = (values: unknown[] = []) => ({ arrayValue: { values } });

async function escribir(col: string, id: string, fields: Record<string, unknown>) {
  const r = await fetch(`${FS}/${col}/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields }),
  });
  expect(r.ok, await r.text()).toBe(true);
}
async function borrar(col: string, id: string) {
  await fetch(`${FS}/${col}/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
}

async function entrar(page: Page, email: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(process.env.PASSWORD_CUENTAS_PRUEBA ?? '');
  await page.locator('#login-submit').click();
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
}

test.afterAll(async () => { await borrar('prospectos', PID); await borrar('cotizaciones', QID); });

test('prospecto convertido: la ganada sin contrato trae el aviso', async ({ page }) => {
  await escribir('prospectos', PID, {
    id: s(PID), folio: s('PRO-2026-9114'), empresa: s('Empresa E2E 114'), contactoNombre: s('Contacto'),
    origenLead: s('web'), servicioPotencial: arr(), etapa: s('convertido'), responsable: s('ventas@vermur.com'),
    fechaCreacion: s('2026-10-12'), actividades: arr(),
  });
  await escribir('cotizaciones', QID, {
    id: s(QID), prospectoId: s(PID), etapa: s('ganada'), cliente: s('Empresa E2E 114'),
    servicios: arr(), actividades: arr(), createdAt: s('2026-10-12T10:00:00.000Z'),
  });
  await entrar(page, 'ventas@vermur.com');
  await page.getByRole('button', { name: 'CRM', exact: true }).first().click();
  await page.getByText('Empresa E2E 114').first().click();
  const bloque = page.getByTestId(`contrato-prospecto-${QID}`);
  await expect(bloque.getByTestId('aviso-sin-contrato')).toHaveText(/Sin contrato firmado/);
  await page.screenshot({ path: `${IMG}/114-prospecto-desktop.png` });
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(bloque).toBeVisible();
  await page.screenshot({ path: `${IMG}/114-prospecto-angosto.png` });
});
