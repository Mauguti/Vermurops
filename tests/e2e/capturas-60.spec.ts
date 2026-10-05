/**
 * capturas-60.spec.ts — contactos múltiples del cliente, con tipo.
 *
 * Siembra un cliente con el contacto tal como viene de Magaya (id 'cnt-1',
 * `tipo: 'general'`, sin `puesto` ni `activo`) y comprueba las cuatro cosas
 * que pidió la tarea: que el de Magaya se vea tal como está, que se agreguen
 * varios con tipo, que se DESACTIVEN en vez de borrarse, y que solo edite
 * quien hoy puede editar al cliente.
 *
 * Requiere emuladores + app en :3100 arriba: `KEEP=1 ./scripts/e2e.sh`.
 * Se siembra con `Bearer owner` (el emulador trata ese token como Admin SDK),
 * igual que en capturas-57, 58 y 59.
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const PW = '123456';
const IMG = 'sprint/reportes/img';
const CLI = 'CLI-CONTACTOS-60';
const NOMBRE = 'CONTACTOS SA DE CV (caso 60)';

const s = (stringValue: string) => ({ stringValue });
const b = (booleanValue: boolean) => ({ booleanValue });

/**
 * El cliente con DOS contactos de Magaya: los dos con `tipo: 'general'` y
 * ninguno con `activo`, que es exactamente la forma de los 169 reales.
 */
async function sembrarCliente() {
  const contacto = (id: string, nombre: string, email: string, principal: boolean) => ({
    mapValue: { fields: { id: s(id), nombre: s(nombre), email: s(email), tipo: s('general'), principal: b(principal) } },
  });
  const r = await fetch(`${FS}/clientes/${CLI}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({
      fields: {
        id: s(CLI), nombre: s(NOMBRE), fechaAlta: s('2026-10-05'),
        dias: { integerValue: '30' }, statusOperativo: s('ACTIVO'),
        rfc: s('CON260101AB1'), origenDatos: s('magaya'),
        numeroEntidadMagaya: s('60'),
        contactos: { arrayValue: { values: [
          contacto('cnt-1', 'ANA MARCIAL', 'amarcial@caso60.com', true),
          contacto('cnt-2', 'LUIS QUIROGA', 'lquiroga@caso60.com', false),
        ] } },
      },
    }),
  });
  expect(r.ok).toBe(true);
}

/** Lo que quedó guardado en Firestore, no lo que se ve en pantalla. */
async function contactosGuardados(): Promise<Record<string, unknown>[]> {
  const r = await fetch(`${FS}/clientes/${CLI}`, { headers: { Authorization: 'Bearer owner' } });
  const doc = await r.json();
  const vals = doc.fields?.contactos?.arrayValue?.values ?? [];
  return vals.map((v: { mapValue: { fields: Record<string, Record<string, unknown>> } }) => {
    const out: Record<string, unknown> = {};
    for (const [k, campo] of Object.entries(v.mapValue.fields ?? {})) {
      out[k] = campo.stringValue ?? campo.booleanValue ?? campo.nullValue ?? null;
    }
    return out;
  });
}

async function entrar(browser: Browser, email: string): Promise<{ page: Page; ctx: BrowserContext }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(PW);
  await page.locator('#login-submit').click();
  await expect(page.getByText('Emuladores · producción intacta')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
  return { page, ctx };
}

/** Altas → busca el cliente del caso → abre su ficha → pestaña Contactos. */
async function abrirContactos(page: Page) {
  await page.getByRole('button', { name: 'Altas', exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.locator('input[placeholder*="Buscar"]').first().fill('caso 60');
  await page.waitForTimeout(600);
  await page.getByRole('row').filter({ hasText: 'caso 60' }).first().click();
  await expect(page.getByRole('heading', { name: NOMBRE })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /^Contactos/ }).first().click();
  await page.waitForTimeout(400);
}

const filas = (page: Page) => page.getByTestId('contacto-fila');

// ─── 1 · Lo de Magaya se ve tal como está ───────────────────────────────────

test('los contactos de Magaya se ven tal como están, sin tipo y sin perderse', async ({ browser }) => {
  await sembrarCliente();
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirContactos(page);

  // Los dos, y el conteo en la pestaña.
  await expect(filas(page)).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Contactos (2)' })).toBeVisible();
  await expect(filas(page).first().locator('input').nth(1)).toHaveValue('ANA MARCIAL');

  // Su 'general' no es ninguno de los cinco de Vermur: se enseña como lo que
  // es, y el selector queda en «Sin tipo» sin reescribir el dato.
  await expect(filas(page).first().getByText('Magaya: general')).toBeVisible();
  await expect(filas(page).first().locator('select')).toHaveValue('');

  await page.screenshot({ path: `${IMG}/60-contactos-magaya-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${IMG}/60-contactos-magaya-movil.png`, fullPage: true });

  await ctx.close();
});

// ─── 2 · Agregar uno con tipo, y que se guarde ──────────────────────────────

test('se agrega un contacto con puesto y tipo, y queda guardado', async ({ browser }) => {
  await sembrarCliente();
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirContactos(page);

  await page.getByRole('button', { name: 'Agregar contacto' }).click();
  const nuevo = filas(page).nth(2);
  await nuevo.locator('input').nth(1).fill('GABRIELA PONCE');
  await nuevo.locator('input').nth(2).fill('Cuentas por pagar');
  await nuevo.locator('input').nth(3).fill('gponce@caso60.com');
  await nuevo.locator('input').nth(4).fill('55 1234 5678');
  await nuevo.locator('select').selectOption('factura');

  await page.screenshot({ path: `${IMG}/60-contacto-nuevo-desktop.png`, fullPage: true });
  await page.getByRole('button', { name: /Guardar cambios/ }).click();
  await page.waitForTimeout(1500);

  const guardados = await contactosGuardados();
  expect(guardados).toHaveLength(3);
  const gaby = guardados.find(c => c.nombre === 'GABRIELA PONCE');
  expect(gaby).toMatchObject({ tipo: 'factura', puesto: 'Cuentas por pagar', email: 'gponce@caso60.com' });
  // Y el 'general' de Magaya salió igual que entró.
  expect(guardados.find(c => c.nombre === 'ANA MARCIAL')?.tipo).toBe('general');

  // Sobrevive a la recarga: es Firestore, no estado de React.
  await page.reload();
  await abrirContactos(page);
  await expect(page.getByRole('button', { name: 'Contactos (3)' })).toBeVisible({ timeout: 15_000 });
  await expect(filas(page).nth(2).locator('select')).toHaveValue('factura');

  await ctx.close();
});

// ─── 3 · Desactivar, no borrar ──────────────────────────────────────────────

test('desactivar conserva el contacto y traspasa el principal', async ({ browser }) => {
  await sembrarCliente();
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirContactos(page);

  // ANA es la principal. Al desactivarla, el principal pasa a LUIS: si no, el
  // PDF de la cotización saldría dirigido a quien ya no está.
  await filas(page).first().getByTitle('Desactivar contacto (no se borra)').click();
  await expect(filas(page).first().getByText('Inactivo')).toBeVisible();
  await expect(filas(page)).toHaveCount(2); // sigue ahí, no se borró
  await expect(filas(page).nth(1).getByText('Principal')).toBeVisible();

  await page.screenshot({ path: `${IMG}/60-contacto-desactivado-desktop.png`, fullPage: true });
  await page.getByRole('button', { name: /Guardar cambios/ }).click();
  await page.waitForTimeout(1500);

  const guardados = await contactosGuardados();
  expect(guardados).toHaveLength(2);
  expect(guardados.find(c => c.nombre === 'ANA MARCIAL')).toMatchObject({ activo: false, principal: false });
  expect(guardados.find(c => c.nombre === 'LUIS QUIROGA')).toMatchObject({ principal: true });

  // El conteo de la pestaña solo cuenta a los activos.
  await page.reload();
  await abrirContactos(page);
  await expect(page.getByRole('button', { name: 'Contactos (1)' })).toBeVisible({ timeout: 15_000 });

  await ctx.close();
});

// ─── 4 · Edita quien hoy puede editar al cliente ────────────────────────────

test('Ventas consulta los contactos pero no los edita', async ({ browser }) => {
  await sembrarCliente();
  const { page, ctx } = await entrar(browser, 'ventas@vermur.com');
  await abrirContactos(page);

  await expect(filas(page)).toHaveCount(2);
  await expect(page.getByText('Solo consulta')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agregar contacto' })).toHaveCount(0);
  await expect(filas(page).first().locator('input').nth(1)).toBeDisabled();

  await page.screenshot({ path: `${IMG}/60-contactos-ventas-lectura-desktop.png`, fullPage: true });
  await ctx.close();
});

// ─── 5 · El proveedor sigue igual, con el mismo editor ──────────────────────

test('el modal del proveedor sigue editando contactos, con borrado', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await page.getByRole('button', { name: 'Altas', exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Proveedores/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Nuevo Proveedor|Agregar proveedor|Nuevo/ }).first().click();
  await page.waitForTimeout(600);

  const prov = page.getByTestId('contacto-fila');
  await expect(prov).toHaveCount(1);
  // Sin selector de tipo: el proveedor no clasifica a sus contactos.
  await expect(prov.first().locator('select')).toHaveCount(0);
  // Y conserva el borrado que ya tenía, no el desactivar del cliente.
  await expect(prov.first().getByTitle(/Desactivar contacto/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Agregar contacto' }).click();
  await expect(page.getByTestId('contacto-fila')).toHaveCount(2);
  await expect(page.getByTestId('contacto-fila').nth(1).getByTitle('Eliminar contacto')).toBeVisible();
  await page.screenshot({ path: `${IMG}/60-proveedor-contactos-desktop.png`, fullPage: true });

  await page.getByTestId('contacto-fila').nth(1).getByTitle('Eliminar contacto').click();
  await expect(page.getByTestId('contacto-fila')).toHaveCount(1);

  await ctx.close();
});
