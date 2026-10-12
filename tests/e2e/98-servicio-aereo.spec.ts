/**
 * Tarea 98 — aéreo expeditado y aéreo regular, de punta a punta.
 *
 *   Ventas solicita un aéreo EXPEDITADO → Pricing lo arma → Ventas lo gana →
 *   Operaciones abre el embarque (serie VLIA) y el servicio llega ahí, en la
 *   ficha, la lista y los productos. Después, Pricing ve el servicio en las
 *   tarifas (filtro) y en la ficha de la tarifa.
 *
 * Mismos helpers y emuladores que el recorrido; n8n se simula por ruta.
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { fijarPreferencias } from './preferencias';

// Tarea 90: las vistas de Cuentas por cobrar/pagar se guardan por usuario; cada spec parte del default.
test.beforeAll(async () => { await fijarPreferencias(); });

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const PW = '123456';

// Estado compartido entre roles.
const S = { folio: '', embarqueFolio: '' };

const PDF_FALSO = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function entrar(browser: Browser, email: string): Promise<{ page: Page; ctx: BrowserContext }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await simularAgentes(page);
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

/** n8n no se puede llamar con un token del emulador: se simula la Cloud Function. */
async function simularAgentes(page: Page) {
  await page.route('**/clasificarDocumento', async route => {
    const flujo = route.request().headers()['x-vermur-flujo'];
    if (flujo === 'pdf-cotizacion') {
      await route.fulfill({ status: 200, contentType: 'application/pdf', body: PDF_FALSO });
      return;
    }
    if (flujo === 'documento-embarque') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        ok: true, tipo: 'factura_proveedor', confianza: 'alta',
        nombreOriginal: 'factura-hapag.pdf', nombrePropuesto: 'Factura HAPAG HL-77001',
        destinoSugerido: 'facturas_proveedor',
        datos: {
          numeroDocumento: 'HL-77001', fecha: '2026-09-21', emisor: 'HAPAG LLOYD A G', total: 1700, moneda: 'USD',
          conceptos: [{ descripcion: 'Ocean Freight', monto: 1500, moneda: 'USD' }, { descripcion: 'Documentation fee', monto: 200, moneda: 'USD' }],
        },
        avisos: [], requiereRevision: false,
      }) });
      return;
    }
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: `flujo no simulado: ${flujo}` }) });
  });
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

/** Aplana el JSON de la REST de Firestore a valores simples (un nivel). */
function plano(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    const o = v as Record<string, unknown>;
    if ('stringValue' in o) out[k] = o.stringValue;
    else if ('integerValue' in o) out[k] = Number(o.integerValue);
    else if ('doubleValue' in o) out[k] = o.doubleValue;
    else if ('booleanValue' in o) out[k] = o.booleanValue;
    else if ('nullValue' in o) out[k] = null;
    else if ('mapValue' in o) out[k] = plano((o.mapValue as { fields?: Record<string, unknown> }).fields ?? {});
    else if ('arrayValue' in o) out[k] = ((o.arrayValue as { values?: unknown[] }).values ?? []).map(x => plano({ x } as never).x);
  }
  return out;
}

/** El selector que contiene una opción con ese value. Las etiquetas del formulario no están ligadas al input. */
const selectCon = (page: Page, value: string) => page.locator('select').filter({ has: page.locator(`option[value="${value}"]`) }).first();

const inputTras = (page: Page, label: string) => page.locator(`label:has-text("${label}")`).first().locator('xpath=following-sibling::*[1]');

async function elegirConcepto(page: Page, termino: string) {
  await page.getByRole('button', { name: 'Seleccionar concepto...' }).last().click();
  const buscador = page.getByPlaceholder('Buscar concepto...');
  await buscador.fill(termino);
  await page.locator('body').getByRole('button', { name: new RegExp(termino, 'i') }).first().click();
}


// ─── 1 · Ventas: solicita un aéreo expeditado ────────────────────────────────

test('Ventas · solicita un aéreo EXPEDITADO', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'ventas@vermur.com');
  await irA(page, 'CRM');
  await page.getByRole('button', { name: 'Cotizaciones', exact: true }).click();
  await page.getByRole('button', { name: /Solicitar cotización|Nueva cotización/ }).click();

  await selectCon(page, 'cliente:CLI-SEED-003').selectOption('cliente:CLI-SEED-003');
  await selectCon(page, 'importacion').selectOption('importacion');
  await page.getByRole('button', { name: 'Aéreo', exact: true }).click();

  // Sin elegir, el aéreo dice «Sin indicar»: no se asume ninguno.
  const bloque = page.getByTestId('servicio-aereo');
  await expect(bloque.getByText('Sin indicar')).toBeVisible();
  await bloque.getByRole('button', { name: 'Expeditado' }).click();
  await expect(bloque.getByRole('button', { name: 'Expeditado' })).toHaveAttribute('aria-pressed', 'true');
  await expect(bloque.getByRole('button', { name: 'Regular' })).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Elegir aeropuerto…' }).first().click();
  await page.getByPlaceholder('Buscar puerto, código o país…').fill('Ciudad de México');
  await page.getByRole('button', { name: /Ciudad de México/ }).first().click();
  await page.getByRole('button', { name: 'Elegir aeropuerto…' }).first().click();
  await page.getByPlaceholder('Buscar puerto, código o país…').fill('Guadalajara');
  await page.getByRole('button', { name: /Guadalajara/ }).first().click();

  await page.getByPlaceholder('350').fill('120');
  await page.getByPlaceholder('4', { exact: true }).fill('3');

  await page.getByRole('button', { name: 'Agregar concepto' }).click();
  await elegirConcepto(page, 'Air Freight');

  await page.getByRole('button', { name: 'Enviar a Pricing' }).click();
  await expect(page.getByText(/Solicitado a Pricing|solicitado/i).first()).toBeVisible({ timeout: 15_000 });

  const cots = await leerColeccion('ventas@vermur.com', 'cotizaciones');
  const mia = cots.filter(c => c.etapa === 'solicitado_pricing' && (c.prospecto as Record<string, unknown>)?.empresa === 'Plásticos Ramírez S.A. de C.V.'
      && JSON.stringify(c.servicios).includes('"aereo"'))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  expect(mia, 'La solicitud aérea no quedó en Firestore').toBeTruthy();
  const servicios = mia!.servicios as unknown as Record<string, unknown>[];
  expect((servicios[0].carga as Record<string, unknown>).servicioAereo, 'servicioAereo no se guardó en la carga').toBe('expeditado');
  S.folio = String(mia!.__id);
  console.log('[e2e] solicitud aérea', S.folio);

  // Pricing lo ve en el resumen de la solicitud.
  await ctx.close();
  const pr = await entrar(browser, 'pricing@vermur.com');
  await irA(pr.page, 'CRM');
  await pr.page.getByRole('button', { name: 'Bandeja Pricing' }).click();
  await pr.page.getByText(S.folio, { exact: true }).first().click();
  await pr.page.getByRole('button', { name: 'Información' }).click();
  // La sección Operación de la ficha trae el mismo selector, ya con lo que pidió Ventas.
  await expect(pr.page.getByTestId('servicio-aereo').getByRole('button', { name: 'Expeditado' }))
    .toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  await pr.ctx.close();
});

// ─── 2 · Pricing arma, Administración valida, Ventas gana ────────────────────

test('Pricing · arma el paquete del aéreo expeditado', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'pricing@vermur.com');
  await irA(page, 'CRM');
  await page.getByRole('button', { name: 'Bandeja Pricing' }).click();
  await page.getByText(S.folio, { exact: true }).first().click();
  await page.getByRole('button', { name: 'Iniciar cotización' }).click();
  await page.getByRole('button', { name: /^Servicios/ }).click();

  await page.getByRole('button', { name: 'Agregar proveedor' }).click();
  await page.getByPlaceholder('Buscar por nombre o RFC…').fill('HAPAG LLOYD');
  await page.getByRole('button', { name: /HAPAG LLOYD A G/ }).first().click();
  const fila = page.locator('tr', { has: page.locator('input[value="Air Freight"]') });
  await fila.locator('input[type="number"]').first().fill('900');
  await page.getByTitle(/Elegir a HAPAG LLOYD A G para TODAS las filas/).click();

  await page.getByRole('tab', { name: 'Por concepto' }).click();
  const linea = page.locator('tr', { hasText: 'Air Freight' }).filter({ has: page.getByText('HAPAG') }).first();
  await linea.locator('input[type="number"]').last().fill('150');

  await page.getByRole('button', { name: 'Cotizaciones recibidas' }).click();
  await page.getByRole('button', { name: 'Armar cotización' }).click();
  await expect.poll(async () => {
    const cots = await leerColeccion('pricing@vermur.com', 'cotizaciones');
    return cots.find(c => c.__id === S.folio)?.etapa;
  }, { timeout: 15_000, message: 'La cotización no quedó consolidada' }).toBe('consolidada');
  await ctx.close();
});

test('Administración · valida el expediente del cliente', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await irA(page, 'Altas');
  await page.getByPlaceholder('Buscar por razón social, RFC, representante...').fill('Plásticos Ramírez S.A. de C.V.');
  await page.getByText('Plásticos Ramírez S.A. de C.V.').first().click();
  await page.getByRole('button', { name: 'Expediente' }).click();
  const yaValidado = page.getByText(/Validado por/);
  const notas = page.getByPlaceholder(/Notas|checklist/);
  await expect(yaValidado.or(notas).first()).toBeVisible({ timeout: 15_000 });
  if (await yaValidado.count() > 0 && !(await notas.isVisible().catch(() => false))) { await ctx.close(); return; }
  await notas.fill('Prueba: expediente físico completo en archivo de Administración.');
  await page.getByRole('button', { name: /Validar expediente|Validar formalmente/ }).click();
  await expect(page.getByText(/Validado por/)).toBeVisible({ timeout: 15_000 });
  await ctx.close();
});

test('Ventas · envía al cliente y marca ganada', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'ventas@vermur.com');
  await irA(page, 'CRM');
  await page.getByRole('button', { name: 'Cotizaciones', exact: true }).click();
  await page.getByText(S.folio, { exact: true }).first().click();
  await page.getByRole('button', { name: 'Enviar al cliente' }).click();
  await page.getByRole('button', { name: 'Marcar ganada' }).click();
  await page.getByTestId('dialogo').getByRole('button', { name: 'Marcar ganada' }).click();
  await expect.poll(async () => {
    const cots = await leerColeccion('ventas@vermur.com', 'cotizaciones');
    return cots.find(c => c.__id === S.folio)?.etapa;
  }, { timeout: 15_000, message: 'La cotización no quedó en «ganada»' }).toBe('ganada');
  await ctx.close();
});

// ─── 3 · Operaciones: el servicio llega al embarque ──────────────────────────

test('Operaciones · el embarque nace expeditado: ficha, productos y lista', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'operaciones@vermur.com');
  await irA(page, 'Embarques');
  await page.getByRole('button', { name: /^Por capturar/ }).click();
  const fila = page.locator('tr', { hasText: S.folio });
  await expect(fila).toBeVisible();
  await fila.getByRole('combobox').selectOption('VLIA');
  await fila.getByRole('button', { name: 'Abrir embarque' }).click();
  await expect(page.getByText(/^VLIA-\d{2}-\d{3}$/).first()).toBeVisible({ timeout: 15_000 });
  S.embarqueFolio = (await page.getByText(/^VLIA-\d{2}-\d{3}$/).first().textContent())!.trim();

  // En la ficha, junto a la modalidad.
  await expect(page.getByTestId('badge-servicio-aereo')).toContainText('Expeditado');

  // En Productos, el selector llega con Expeditado ya elegido.
  await page.getByRole('button', { name: /^Productos/ }).click();
  const sel = page.getByTestId('servicio-aereo-embarque');
  await expect(sel.getByRole('button', { name: 'Expeditado' })).toHaveAttribute('aria-pressed', 'true');

  // Operaciones lo corrige a Regular y persiste.
  await sel.getByRole('button', { name: 'Regular' }).click();
  await expect.poll(async () => {
    const embs = await leerColeccion('operaciones@vermur.com', 'embarques');
    const e = embs.find(x => x.folio === S.embarqueFolio);
    return JSON.stringify(((e?.productos as unknown as Record<string, unknown>[]) ?? []).map(p => p.servicioAereo));
  }, { timeout: 15_000 }).toMatch(/regular/);
  await sel.getByRole('button', { name: 'Expeditado' }).click();
  await expect.poll(async () => {
    const embs = await leerColeccion('operaciones@vermur.com', 'embarques');
    const e = embs.find(x => x.folio === S.embarqueFolio);
    return JSON.stringify(((e?.productos as unknown as Record<string, unknown>[]) ?? []).map(p => p.servicioAereo));
  }, { timeout: 15_000 }).toMatch(/expeditado/);

  // En la lista: la columna dice Expeditado para este embarque.
  await page.getByRole('button', { name: 'Embarques', exact: true }).last().click();
  await page.getByRole('button', { name: 'Todos los embarques' }).click();
  const filaLista = page.locator('tr', { hasText: S.embarqueFolio });
  await expect(filaLista).toBeVisible({ timeout: 15_000 });
  await expect(filaLista.getByText('Expeditado')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'sprint/reportes/img/98-embarque-lista-angosto.png', fullPage: true });
  await ctx.close();
});

// ─── 4 · Tarifas: campo, filtro y propuesta ──────────────────────────────────

async function sembrarTarifa(id: string, servicio: 'expeditado' | 'regular' | null) {
  const s = (stringValue: string) => ({ stringValue });
  const r = await fetch(`${FS}/tarifas/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: {
      id: s(id), tipo: s('tarifario'), conceptoId: s('CON-021'), proveedorId: s('PRV-98'),
      puertoOrigenId: { nullValue: null }, puertoDestinoId: { nullValue: null }, terminalId: { nullValue: null },
      rutaTexto: s('MEX → GDL'),
      precios: { mapValue: { fields: { monto: { doubleValue: id === 'TAR-98-EXP' ? 4.5 : 2.1 }, unidad: s('TON') } } },
      moneda: s('USD'), vigenciaTexto: s('Todo 2026'), fechaInicio: s('2026-01-01'), fechaFin: { nullValue: null },
      tiempoTransitoDias: { nullValue: null }, freeTimeDias: { nullValue: null }, condiciones: s(''),
      ...(servicio ? { servicioAereo: s(servicio) } : {}),
      activo: { booleanValue: true }, origenDatos: s('manual'), creadoPor: s('e2e'),
      fechaAlta: s('2026-10-01'), updatedAt: s('2026-10-01T00:00:00.000Z'),
    } }),
  });
  expect(r.ok).toBe(true);
}

test('Pricing · filtro de tarifas por servicio aéreo', async ({ browser }) => {
  await sembrarTarifa('TAR-98-EXP', 'expeditado');
  await sembrarTarifa('TAR-98-REG', 'regular');
  await sembrarTarifa('TAR-98-SIN', null);
  const { page, ctx } = await entrar(browser, 'pricing@vermur.com');
  await irA(page, 'Tarifas');
  const filtro = page.getByTestId('filtro-servicio-aereo');
  await expect(filtro).toBeVisible({ timeout: 15_000 });
  const filas = page.locator('tbody tr', { hasText: 'MEX → GDL' });
  await expect(filas).toHaveCount(3, { timeout: 15_000 });

  await filtro.selectOption('expeditado');
  await expect(filas).toHaveCount(1);
  await expect(filas.first()).toContainText('Expeditado');
  await filtro.selectOption('regular');
  await expect(filas).toHaveCount(1);
  await expect(filas.first()).toContainText('Regular');
  await filtro.selectOption('sin_indicar');
  await expect(filas).toHaveCount(1);
  await page.screenshot({ path: 'sprint/reportes/img/98-tarifas-filtro-desktop.png', fullPage: true });
  await ctx.close();
});
