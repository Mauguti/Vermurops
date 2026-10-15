/**
 * Tarea 105 — la estiba de un producto de embarque ya creado se edita.
 *
 * Operaciones abre un embarque nuevo (marítimo, sin tope de niveles), agrega un
 * producto estibable ×3, lo edita a ×7 con el lápiz, y luego lo marca «No
 * estibable» (los niveles se borran). Se comprueba en Firestore, no solo en pantalla.
 */
import { test, expect, type Page } from '@playwright/test';

test.setTimeout(120_000);

const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const PW = process.env.PASSWORD_CUENTAS_PRUEBA ?? '';
const IMG = 'sprint/reportes/img';
const DESC = `TORNILLERIA 105 ${Date.now()}`;

async function leerEmbarqueConProducto(): Promise<Record<string, any> | undefined> {
  const r = await fetch(`${AUTH}/accounts:signInWithPassword?key=emulador`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'operaciones@vermur.com', password: PW, returnSecureToken: true }),
  });
  const { idToken } = await r.json() as { idToken: string };
  const d = await (await fetch(`${FS}/embarques?pageSize=300`, { headers: { Authorization: `Bearer ${idToken}` } })).json() as { documents?: { fields: Record<string, any> }[] };
  for (const doc of d.documents ?? []) {
    const prods: any[] = doc.fields?.productos?.arrayValue?.values ?? [];
    const p = prods.find(x => x.mapValue?.fields?.descripcion?.stringValue === DESC);
    if (p) return p.mapValue.fields;
  }
  return undefined;
}

async function entrar(browser: any): Promise<Page> {
  const ctx = await browser.newContext();
  const page: Page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill('operaciones@vermur.com');
  await page.getByPlaceholder('••••••••').fill(PW);
  await page.locator('#login-submit').click();
  await expect(page.getByText('Emuladores · producción intacta')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
  return page;
}

test('Operaciones edita la estiba de un producto ya creado', async ({ browser }) => {
  const page = await entrar(browser);
  await page.getByRole('button', { name: 'Embarques', exact: true }).first().click();
  await page.getByRole('button', { name: 'Todos los embarques' }).click();
  await page.getByRole('button', { name: /Nuevo Embarque/ }).click();
  await page.getByRole('button', { name: /^Productos/ }).click({ timeout: 20_000 });

  // Alta del producto con estiba ×3.
  await page.getByPlaceholder('Ej. BOLTS OR NUTS').fill(DESC);
  await page.getByPlaceholder('17').fill('10');
  await page.getByPlaceholder('14690').fill('500');
  const alta = page.getByTestId('campo-estiba');
  await alta.getByTestId('estibable-check').check();
  await alta.getByTestId('niveles-estiba').fill('3');
  await page.getByRole('button', { name: /Adicionar Producto al Embarque/ }).click();
  await expect(page.getByTestId('estiba-producto')).toHaveText(/estibable ×3/i, { timeout: 15_000 });
  await expect.poll(async () => (await leerEmbarqueConProducto())?.nivelesEstiba?.integerValue).toBe('3');

  // Editar el producto existente: ×3 → ×7.
  await page.getByTestId('editar-estiba-producto').click();
  const fila = page.getByTestId('fila-editar-estiba');
  await expect(fila.getByTestId('niveles-estiba')).toHaveValue('3');
  await fila.getByTestId('niveles-estiba').fill('7');
  await expect(page.getByTestId('estiba-producto')).toHaveText(/estibable ×7/i, { timeout: 15_000 });
  await expect.poll(async () => (await leerEmbarqueConProducto())?.nivelesEstiba?.integerValue).toBe('7');
  await page.screenshot({ path: `${IMG}/105-editar-estiba-escritorio.png`, fullPage: true });

  // No estibable: los niveles desaparecen del documento.
  await fila.getByTestId('estibable-check').click();
  await expect(page.getByTestId('estiba-producto')).toHaveText(/no estibable/i, { timeout: 15_000 });
  await expect.poll(async () => {
    const f = await leerEmbarqueConProducto();
    return JSON.stringify({ est: f?.estibable?.booleanValue, niv: f?.nivelesEstiba ?? null });
  }).toBe(JSON.stringify({ est: false, niv: null }));

  // Angosto.
  await page.setViewportSize({ width: 390, height: 844 });
  await fila.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${IMG}/105-editar-estiba-angosto.png` });
  await page.context().close();
});
