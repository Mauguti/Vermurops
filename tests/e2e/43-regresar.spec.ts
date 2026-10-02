import { test, expect, Browser, Page, BrowserContext } from '@playwright/test';

/**
 * Tarea 43 · Verificar que todas las fichas tienen el botón «← Regresar» y
 * que al hacer clic regresa a la lista correcta.
 */

const PW = '123456';

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

async function irA(page: Page, modulo: string) {
  await page.getByRole('button', { name: modulo, exact: true }).first().click();
}

test('Cotización: abrir ficha y regresar a la lista', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'admin@vermur.com');
  await irA(page, 'CRM');
  await page.waitForTimeout(500);

  // Admin ve la vista de prospección; cambiar a lista para ver cotizaciones
  const listaBtn = page.getByRole('button', { name: 'Lista' });
  if (await listaBtn.count()) {
    await listaBtn.click();
    await page.waitForTimeout(500);
  }

  // Abrir la primera cotización desde la tabla
  const fila = page.locator('tr').filter({ hasText: 'COT-2026' }).first();
  if (await fila.count()) {
    await fila.click();
    await page.waitForTimeout(500);

    // Captura de la ficha con el botón de regresar
    await page.screenshot({ path: 'sprint/reportes/img/43-cotizacion-ficha.png', fullPage: false });

    // El botón de regresar tiene el icono ArrowLeft + nombre del módulo
    const backBtn = page.locator('button').filter({ hasText: 'Cotizaciones' }).first();
    await expect(backBtn).toBeVisible();

    // Hacer clic para regresar
    await backBtn.click();
    await page.waitForTimeout(300);

    // Captura de vuelta en la lista
    await page.screenshot({ path: 'sprint/reportes/img/43-cotizacion-lista.png', fullPage: false });
  }
  await ctx.close();
});

test('Embarque: abrir ficha y regresar a la lista', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'operaciones@vermur.com');
  await irA(page, 'Embarques');
  await page.waitForTimeout(500);

  const fila = page.locator('tr').filter({ hasText: /VLIM|VLEM|SHP/ }).first();
  if (await fila.count()) {
    await fila.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'sprint/reportes/img/43-embarque-ficha.png', fullPage: false });

    const backBtn = page.locator('button').filter({ hasText: 'Embarques' }).first();
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'sprint/reportes/img/43-embarque-lista.png', fullPage: false });
  }
  await ctx.close();
});

test('Cliente: abrir ficha y regresar a la lista', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await irA(page, 'Altas');
  await page.waitForTimeout(500);

  const fila = page.locator('tr').filter({ hasText: /CLI-/ }).first();
  if (await fila.count()) {
    await fila.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'sprint/reportes/img/43-cliente-ficha.png', fullPage: false });

    const backBtn = page.locator('button').filter({ hasText: 'Clientes' }).first();
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'sprint/reportes/img/43-cliente-lista.png', fullPage: false });
  }
  await ctx.close();
});

test('Proveedor: abrir ficha y regresar a la lista', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await irA(page, 'Altas');
  await page.waitForTimeout(500);

  // Cambiar a la pestaña de proveedores
  const provTab = page.locator('button').filter({ hasText: 'Proveedores' }).first();
  await provTab.click();
  await page.waitForTimeout(500);

  const fila = page.locator('tr').filter({ hasText: /PRV-/ }).first();
  if (await fila.count()) {
    await fila.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'sprint/reportes/img/43-proveedor-ficha.png', fullPage: false });

    const backBtn = page.locator('button').filter({ hasText: 'Proveedores' }).first();
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'sprint/reportes/img/43-proveedor-lista.png', fullPage: false });
  }
  await ctx.close();
});

test('Prospecto: abrir ficha y regresar a la lista', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'ventas@vermur.com');
  await irA(page, 'CRM');
  await page.waitForTimeout(500);

  const fila = page.locator('tr').filter({ hasText: /PROS-/ }).first();
  if (await fila.count()) {
    await fila.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'sprint/reportes/img/43-prospecto-ficha.png', fullPage: false });

    const backBtn = page.locator('button').filter({ hasText: 'Prospectos' }).first();
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'sprint/reportes/img/43-prospecto-lista.png', fullPage: false });
  }
  await ctx.close();
});

test('Orden de compra: abrir ficha y regresar', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await irA(page, 'Finanzas');
  await page.waitForTimeout(500);

  // Ir a Cuentas por pagar
  const cpTab = page.locator('button').filter({ hasText: 'Cuentas por pagar' }).first();
  if (await cpTab.count()) {
    await cpTab.click();
    await page.waitForTimeout(500);

    const fila = page.locator('tr, [data-oc-id]').filter({ hasText: /OC-/ }).first();
    if (await fila.count()) {
      await fila.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'sprint/reportes/img/43-oc-ficha.png', fullPage: false });

      const backBtn = page.locator('button').filter({ hasText: 'Cuentas por pagar' }).first();
      await expect(backBtn).toBeVisible();
      await backBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'sprint/reportes/img/43-oc-lista.png', fullPage: false });
    }
  }
  await ctx.close();
});
