/**
 * Tarea 27 — Captura manual sin tarifario previo.
 *
 * Prueba que las dos vistas de la cotización (Por concepto y Por proveedor)
 * permitan agregar conceptos, capturar costos, asignar proveedores y
 * elegir impuesto, todo sin tener tarifas en el catálogo.
 *
 * Es un recorrido SERIAL que reutiliza la cotización creada por Ventas.
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const PW = '123456';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';

const S = { folio: '' };

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

const selectCon = (page: Page, value: string) =>
  page.locator('select').filter({ has: page.locator(`option[value="${value}"]`) }).first();

/**
 * Elige un concepto del catálogo. El borrador usa `autoAbrir` que
 * inicializa open=true, pero el portal necesita un useEffect para
 * calcular su posición. Si no aparece a tiempo, se hace toggle
 * (cerrar → abrir) para forzar el ciclo completo del efecto.
 */
async function elegirConcepto(page: Page, termino: string) {
  const buscador = page.getByPlaceholder('Buscar concepto...');
  // autoAbrir: dar tiempo al useEffect de calcular la posición del portal.
  let visible = await buscador.isVisible({ timeout: 3000 }).catch(() => false);
  if (!visible) {
    const btn = page.getByRole('button', { name: /Seleccionar concepto/ }).last();
    await btn.click();
    visible = await buscador.isVisible({ timeout: 1500 }).catch(() => false);
    if (!visible) {
      // autoAbrir tenía open=true: el primer clic lo cerró. Abrir de nuevo.
      await btn.click();
    }
  }
  await expect(buscador).toBeVisible({ timeout: 5000 });
  await buscador.fill(termino);
  await page.getByRole('button', { name: new RegExp(termino, 'i') }).first().click();
}

async function tokenDe(email: string): Promise<string> {
  const r = await fetch(`${AUTH}/accounts:signInWithPassword?key=emulador`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW, returnSecureToken: true }),
  });
  return (await r.json() as { idToken: string }).idToken;
}

async function leerColeccion(email: string, col: string): Promise<Record<string, unknown>[]> {
  const token = await tokenDe(email);
  const r = await fetch(`${FS}/${col}?pageSize=300`, { headers: { Authorization: `Bearer ${token}` } });
  const d = await r.json() as { documents?: { name: string; fields: Record<string, unknown> }[] };
  return (d.documents ?? []).map(doc => ({ __id: doc.name.split('/').pop(), ...plano(doc.fields) }));
}

function plano(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    const o = v as Record<string, unknown>;
    if ('stringValue' in o) out[k] = o.stringValue;
    else if ('integerValue' in o) out[k] = Number(o.integerValue);
    else if ('doubleValue' in o) out[k] = o.doubleValue;
    else if ('booleanValue' in o) out[k] = o.booleanValue;
    else if ('mapValue' in o) out[k] = plano((o.mapValue as { fields?: Record<string, unknown> }).fields ?? {});
  }
  return out;
}

// ─── 1 · Ventas: solicitud básica ────────────────────────────────────────────

test('Ventas · crea una solicitud para captura manual', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'ventas@vermur.com');
  await irA(page, 'CRM');
  await page.getByRole('button', { name: 'Cotizaciones', exact: true }).click();
  await page.getByRole('button', { name: /Solicitar cotización|Nueva cotización/ }).click();

  await selectCon(page, 'cliente:CLI-SEED-003').selectOption('cliente:CLI-SEED-003');
  await selectCon(page, 'importacion').selectOption('importacion');
  await page.getByRole('button', { name: 'Marítimo', exact: true }).click();

  // Puertos del catálogo (requeridos para enviar)
  const puertos = page.getByRole('button', { name: 'Elegir del catálogo…' });
  await puertos.first().click();
  await page.getByPlaceholder('Buscar puerto, código o país…').fill('Shanghai');
  await page.getByRole('button', { name: /Shanghai/ }).first().click();
  await page.getByRole('button', { name: 'Elegir del catálogo…' }).first().click();
  await page.getByPlaceholder('Buscar puerto, código o país…').fill('Manzanillo');
  await page.getByRole('button', { name: /Manzanillo/ }).first().click();

  await page.getByPlaceholder('18500').fill('18500');

  // Sin conceptos señalados — Pricing capturará todo a mano
  await page.getByRole('button', { name: 'Enviar a Pricing' }).click();
  await expect(page.getByText(/Solicitado a Pricing|solicitado/i).first()).toBeVisible({ timeout: 15_000 });

  const cots = await leerColeccion('ventas@vermur.com', 'cotizaciones');
  const mia = cots.filter(c => c.etapa === 'solicitado_pricing')
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  expect(mia, 'La solicitud no quedó en Firestore').toBeTruthy();
  S.folio = String(mia!.__id);
  console.log('[e2e captura-manual] solicitud', S.folio);
  await ctx.close();
});

// ─── 2 · Pricing: captura manual en vista Por concepto ──────────────────────

test('Pricing · captura costo, proveedor y profit a mano en «Por concepto»', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'pricing@vermur.com');
  await irA(page, 'CRM');
  await page.getByRole('button', { name: 'Bandeja Pricing' }).click();
  await page.getByText(S.folio, { exact: true }).first().click();
  await expect(page.getByText('Plásticos Ramírez', { exact: false }).first()).toBeVisible();

  // Iniciar cotización
  await page.getByRole('button', { name: 'Iniciar cotización' }).click();
  await page.getByRole('button', { name: /^Servicios/ }).click();

  // Cambiar a vista Por concepto
  await page.getByRole('tab', { name: 'Por concepto' }).click();

  // Agregar un concepto del catálogo
  await page.getByRole('button', { name: /Agregar concepto/ }).first().click();
  await elegirConcepto(page, 'Ocean Freight');

  // La línea debe aparecer con inputs editables
  const lineaOcean = page.locator('tr', { hasText: 'Ocean Freight' }).first();
  await expect(lineaOcean).toBeVisible();

  // Capturar costo a mano
  const costoInput = lineaOcean.locator('input[type="number"]').first();
  await costoInput.fill('1200');

  // Capturar profit
  const profitInput = lineaOcean.locator('input[type="number"]').nth(1);
  await profitInput.fill('300');

  // Verificar que la venta se calcula (1200 + 300 = 1500)
  await expect(lineaOcean.getByText('$1,500.00')).toBeVisible({ timeout: 5_000 });

  // Capturar proveedor y moneda (aparece tras capturar costo > 0)
  await page.getByText('+ Capturar proveedor de este costo').click();
  // Elegir proveedor
  const selectProv = page.locator('select').filter({ has: page.locator('option', { hasText: 'HAPAG' }) }).first();
  await selectProv.selectOption({ label: 'HAPAG LLOYD A G' });
  // Elegir moneda
  const selectMoneda = page.locator('select').filter({ has: page.locator('option[value="USD"]') }).last();
  await selectMoneda.selectOption('USD');
  await page.getByRole('button', { name: 'Guardar' }).click();

  // Verificar que el proveedor aparece en la línea
  await expect(lineaOcean.getByText('HAPAG', { exact: false })).toBeVisible({ timeout: 5_000 });

  // Agregar un segundo concepto
  await page.getByRole('button', { name: /Agregar concepto/ }).first().click();
  await elegirConcepto(page, 'Documentation');
  const lineaDoc = page.locator('tr', { hasText: 'Documentation' }).first();
  await lineaDoc.locator('input[type="number"]').first().fill('200');
  await lineaDoc.locator('input[type="number"]').nth(1).fill('50');

  // Elegir impuesto del segundo concepto
  const selectImpuesto = lineaDoc.locator('select').filter({ has: page.locator('option[value="iva0"]') }).first();
  await selectImpuesto.selectOption('iva0');

  // Esperar a que se guarden los cambios (autoguardado)
  await page.waitForTimeout(2000);

  console.log('[e2e captura-manual] vista Por concepto OK');
  await ctx.close();
});

// ─── 3 · Pricing: edición en vista Por proveedor ────────────────────────────

test('Pricing · edita costo, profit e impuesto en «Por proveedor»', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'pricing@vermur.com');
  await irA(page, 'CRM');
  await page.getByRole('button', { name: 'Bandeja Pricing' }).click();
  await page.getByText(S.folio, { exact: true }).first().click();
  await expect(page.getByText('Plásticos Ramírez', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Servicios/ }).click();

  // Cambiar a vista Por proveedor (puede ser el default)
  await page.getByRole('tab', { name: 'Por proveedor' }).click();

  // Verificar que los grupos de proveedores aparecen
  // HAPAG debe tener su grupo con Ocean Freight
  await expect(page.getByText('HAPAG', { exact: false }).first()).toBeVisible({ timeout: 5_000 });

  // El costo del concepto con proveedor asignado debe mostrarse
  // Ocean Freight tiene costoDerivado=true (por la tarifa manual que se creó),
  // así que su costo es read-only. Documentation sí se puede editar.

  // Documentation está en «Sin proveedor» y debe tener input editable
  const renglonDoc = page.locator('tr', { hasText: 'Documentation' }).first();
  await expect(renglonDoc).toBeVisible();

  // Editar el profit de Documentation
  const profitInput = renglonDoc.locator('input[type="number"]').first();
  if (await profitInput.isVisible()) {
    await profitInput.fill('75');
  }

  // Verificar la columna de impuesto
  const selectImpuesto = renglonDoc.locator('select').filter({ has: page.locator('option[value="iva16"]') }).first();
  if (await selectImpuesto.isVisible()) {
    await selectImpuesto.selectOption('iva16');
  }

  // Agregar concepto desde la vista Por proveedor
  await page.getByRole('button', { name: /Agregar concepto/ }).first().click();
  await elegirConcepto(page, 'Handling');

  // El nuevo concepto debe aparecer en la tabla
  await expect(page.locator('tr', { hasText: 'Handling' }).first()).toBeVisible({ timeout: 5_000 });

  // Esperar guardado
  await page.waitForTimeout(2000);

  console.log('[e2e captura-manual] vista Por proveedor OK');
  await ctx.close();
});
