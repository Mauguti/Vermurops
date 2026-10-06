/**
 * 72-pestana-pagos.spec.ts — P5 · Finanzas → Pagos: ficha del pago.
 *
 * Los tres movimientos de la tarea, y en cada uno que la factura vuelva a su
 * saldo correcto (que se lee en Cuentas por cobrar, donde Julio la mira):
 *
 *   A. aplicar el saldo a favor de un pago a otra factura
 *   B. quitar una aplicación
 *   C. anular un pago (y un anticipo, con `anularDeposito`)
 *
 * Y el permiso: Administración ve los botones; Operaciones lee y no los ve.
 *
 * Requiere emuladores + app en :3100: `KEEP=1 ./scripts/e2e.sh` y luego
 * `npx playwright test tests/e2e/72-pestana-pagos.spec.ts --workers=1`.
 * Se siembra con `Bearer owner` (el emulador lo trata como Admin SDK).
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const PW = '123456';
const IMG = 'sprint/reportes/img';

const CLIENTE_ID = 'CLI-72';
const CLIENTE = 'PESTANA PAGOS 72 SA DE CV';
const EMB = 'EMB-72';

const S = (stringValue: string) => ({ stringValue });
const D = (doubleValue: number) => ({ doubleValue });
const B = (booleanValue: boolean) => ({ booleanValue });
const NULO = { nullValue: null };
const ARR = (values: unknown[]) => ({ arrayValue: { values } });
const MAPA = (fields: Record<string, unknown>) => ({ mapValue: { fields } });

async function escribir(ruta: string, fields: Record<string, unknown>) {
  const r = await fetch(`${FS}/${ruta}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields }),
  });
  expect(r.ok).toBe(true);
}

async function borrar(ruta: string) {
  await fetch(`${FS}/${ruta}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
}

/** Tres facturas del mismo cliente, todas en pesos. */
const FACTURAS = [
  { id: 'FAC-72-A', numero: 'A-7201', total: 10_000, vence: '2026-09-10' },
  { id: 'FAC-72-B', numero: 'A-7202', total: 6_000, vence: '2026-09-20' },
  { id: 'FAC-72-C', numero: 'A-7203', total: 4_000, vence: '2026-10-30' },
];

const POR = { uid: 'seed', nombre: 'Siembra', fecha: S('2026-10-01') };
const aplicacion = (id: string, numero: string, monto: number) => MAPA({
  destinoTipo: S('factura'), destinoId: S(id), destinoNumero: S(numero),
  monto: D(monto), moneda: S('MXN'),
  aplicadaPor: MAPA({ uid: S('seed'), nombre: S('Siembra'), fecha: S('2026-10-01') }),
});

function pagoSemilla(
  id: string, folio: string, monto: number, aplicaciones: { id: string; numero: string; monto: number }[],
) {
  return {
    id: S(id), folio: S(folio), lado: S('cliente'), terceroTipo: S('cliente'),
    terceroId: S(CLIENTE_ID), terceroNombre: S(CLIENTE),
    monto: D(monto), moneda: S('MXN'), fecha: S('2026-10-01'),
    banco: S('BBVA'), referencia: NULO, comprobante: NULO,
    aplicaciones: ARR(aplicaciones.map(a => aplicacion(a.id, a.numero, a.monto))),
    destinoIds: ARR(aplicaciones.map(a => S(a.id))),
    embarqueIds: ARR([S(EMB)]),
    origen: S('app'),
    registradoPor: MAPA({ uid: S('seed'), nombre: S('Siembra') }),
    activo: B(true),
    createdAt: S('2026-10-01T09:00:00.000Z'), updatedAt: S('2026-10-01T09:00:00.000Z'),
  };
}

const PAGOS = {
  /** 12,000: 10,000 a A-7201 y 2,000 a favor. Es el de aplicar saldo y el de quitar. */
  X: { id: 'PAG-72-X', folio: 'PAG-2026-0720' },
  /** Anticipo de 5,000 sin aplicaciones: el de anularDeposito. */
  Y: { id: 'PAG-72-Y', folio: 'PAG-2026-0721' },
  /** 6,000 aplicados completos a A-7202: el de anular. */
  Z: { id: 'PAG-72-Z', folio: 'PAG-2026-0722' },
  /** Tarea 79 · Anticipo SIN embarque: la bitácora no tiene dónde guardar su motivo. */
  W: { id: 'PAG-72-W', folio: 'PAG-2026-0723' },
};

async function limpiar() {
  const r = await fetch(`${FS}/pagos?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  if (r.ok) {
    const d = await r.json() as { documents?: { name: string; fields: Record<string, any> }[] };
    for (const doc of d.documents ?? []) {
      if (doc.fields?.terceroId?.stringValue === CLIENTE_ID) await borrar(`pagos/${doc.name.split('/').pop()}`);
    }
  }
}

async function sembrar() {
  await limpiar();
  await escribir(`clientes/${CLIENTE_ID}`, {
    id: S(CLIENTE_ID), nombre: S(CLIENTE), activo: B(true), rfc: S('PPS260101AA7'),
    origenDatos: S('magaya'), statusOperativo: S('ACTIVO'), numeroEntidadMagaya: S('72001'),
    createdAt: S('2026-10-01T09:00:00.000Z'), updatedAt: S('2026-10-01T09:00:00.000Z'),
  });
  // El embarque existe para que la bitácora tenga dónde anotar (arrayUnion).
  await escribir(`embarques/${EMB}`, {
    id: S(EMB), folio: S('VLIM-26-072'), bitacora: ARR([]),
    createdAt: S('2026-10-01T09:00:00.000Z'),
  });
  for (const f of FACTURAS) {
    await escribir(`facturas/${f.id}`, {
      id: S(f.id), numero: S(f.numero), fechaEmision: S('2026-08-20'), fechaVencimiento: S(f.vence),
      diasCredito: { integerValue: '30' }, embarqueId: S(EMB), embarqueFolio: S('VLIM-26-072'),
      clienteId: S(CLIENTE_ID), clienteNombre: S(CLIENTE), grupoFacturacion: NULO, moneda: S('MXN'),
      subtotal: D(f.total), iva: D(0), retencion: D(0), total: D(f.total),
      estado: S('emitida'), lineas: ARR([]), activo: B(true),
      createdAt: S('2026-08-20T09:00:00.000Z'), updatedAt: S('2026-08-20T09:00:00.000Z'),
    });
  }
  await escribir(`pagos/${PAGOS.X.id}`, pagoSemilla(PAGOS.X.id, PAGOS.X.folio, 12_000, [{ id: 'FAC-72-A', numero: 'A-7201', monto: 10_000 }]));
  await escribir(`pagos/${PAGOS.Y.id}`, pagoSemilla(PAGOS.Y.id, PAGOS.Y.folio, 5_000, []));
  await escribir(`pagos/${PAGOS.Z.id}`, pagoSemilla(PAGOS.Z.id, PAGOS.Z.folio, 6_000, [{ id: 'FAC-72-B', numero: 'A-7202', monto: 6_000 }]));
  await escribir(`pagos/${PAGOS.W.id}`, { ...pagoSemilla(PAGOS.W.id, PAGOS.W.folio, 3_000, []), embarqueIds: ARR([]) });
}

async function tokenDe(email: string): Promise<string> {
  const r = await fetch(`${AUTH}/accounts:signInWithPassword?key=emulador`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW, returnSecureToken: true }),
  });
  return (await r.json() as { idToken: string }).idToken;
}

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

/** Lee UN documento con la sesión de Administración: pasa por las reglas. */
async function leer(ruta: string): Promise<Record<string, any>> {
  const token = await tokenDe('administracion@vermur.com');
  const r = await fetch(`${FS}/${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
  const d = await r.json() as { fields?: Record<string, unknown> };
  return plano(d.fields ?? {}) as Record<string, any>;
}

async function entrar(browser: Browser, email: string): Promise<{ page: Page; ctx: BrowserContext }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(PW);
  await page.locator('#login-submit').click();
  await expect(page.getByText('Emuladores · producción intacta')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
  return { page, ctx };
}

const foto = (page: Page, nombre: string) => page.screenshot({ path: `${IMG}/72-${nombre}.png`, fullPage: true });

async function abrirPagos(page: Page) {
  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Pagos', exact: true }).first().click();
  await page.getByPlaceholder('Folio, cliente, referencia o factura…').fill(CLIENTE_ID === 'CLI-72' ? 'PESTANA' : '');
  await expect(page.getByText(PAGOS.X.folio).first()).toBeVisible({ timeout: 15_000 });
}

async function abrirFicha(page: Page, folio: string) {
  await page.getByRole('row').filter({ hasText: folio }).getByRole('button', { name: 'Abrir' }).click();
  await expect(page.getByTestId('ficha-pago')).toContainText(folio);
}

/**
 * Cobrado y resta de una factura en Cuentas por cobrar, «Por factura», leídos
 * POR CELDA. Leer el texto del renglón completo no sirve: el total de la
 * factura aparece ahí y «4,000.00» pasaría aunque el saldo no se hubiera
 * restaurado.
 */
async function cobradoYResta(page: Page, numero: string): Promise<{ cobrado: string; resta: string }> {
  await page.getByRole('button', { name: 'Cuentas por cobrar', exact: true }).first().click();
  await page.getByRole('button', { name: 'Por factura' }).click();
  await page.locator('select').filter({ hasText: 'Cliente: todos' }).selectOption(CLIENTE_ID);
  await page.getByRole('button', { name: /^Todas/ }).click();
  const fila = page.getByRole('row').filter({ hasText: numero }).first();
  await expect(fila).toBeVisible({ timeout: 15_000 });
  const celdas = (await fila.getByRole('cell').allInnerTexts()).map(t => t.trim());
  // Columnas de la vista por defecto: numero, cliente, embarque, vence, total, moneda, cobrado, saldo, estado, accion.
  expect(celdas[0]).toContain(numero);
  // «Por factura» se guarda como preferencia del usuario: se devuelve a «Por
  // cliente» para no dejarle al spec que sigue (el 70) otra pantalla.
  await page.getByRole('button', { name: 'Por cliente' }).click();
  return { cobrado: celdas[6], resta: celdas[7] };
}

test('siembra: un cliente, tres facturas y tres pagos', async () => { await sembrar(); });

test('la lista muestra los pagos con su estado y los totales por moneda', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPagos(page);

  for (const f of Object.values(PAGOS)) await expect(page.getByText(f.folio).first()).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: PAGOS.X.folio })).toContainText('Parcial');
  await expect(page.getByRole('row').filter({ hasText: PAGOS.Y.folio })).toContainText('Sin aplicar');
  await expect(page.getByRole('row').filter({ hasText: PAGOS.Z.folio })).toContainText('Aplicado');
  // Totales por moneda, sin mezclar: 26,000 entrados y 10,000 a favor (2,000 + 5,000 + 3,000 del pago sin embarque, tarea 79).
  await expect(page.getByTestId('totales-pagos')).toContainText('MXN 26,000.00');
  await expect(page.getByTestId('totales-pagos')).toContainText('MXN 10,000.00');

  await foto(page, 'lista');
  await page.setViewportSize({ width: 390, height: 900 });
  await foto(page, 'lista-angosto');
  await ctx.close();
});

test('A · aplicar el saldo a favor a otra factura', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPagos(page);
  await abrirFicha(page, PAGOS.X.folio);

  const ficha = page.getByTestId('ficha-pago');
  await expect(ficha).toContainText('A-7201');
  await expect(ficha).toContainText('MXN 2,000.00');
  await foto(page, 'ficha');

  await ficha.getByRole('button', { name: 'Aplicar saldo a favor' }).click();
  await expect(page.getByRole('heading', { name: /Aplicar saldo a favor de PAG-2026-0720/ })).toBeVisible();
  // El dinero NO se edita: es el del pago que ya existe.
  await expect(page.getByLabel('Saldo a favor por aplicar')).toBeDisabled();
  await expect(page.getByLabel('Saldo a favor por aplicar')).toHaveValue('2000');
  // Mismas facturas del mismo cliente y moneda; A-7201 ya está cobrada y no se ofrece.
  await expect(page.getByRole('checkbox', { name: 'Aplicar a A-7203' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Aplicar a A-7201' })).toHaveCount(0);
  await foto(page, 'aplicar-saldo');

  // Más de lo que sobra no se puede guardar.
  await page.getByLabel('Monto aplicado a A-7203').fill('3000');
  await expect(page.getByRole('button', { name: 'Aplicar saldo' })).toBeDisabled();
  await page.getByLabel('Monto aplicado a A-7203').fill('2000');
  await expect(page.getByText('✓ cuadra')).toBeVisible();
  await page.getByRole('button', { name: 'Aplicar saldo' }).click();

  await expect(page.getByRole('heading', { name: /Aplicar saldo a favor de/ })).toHaveCount(0, { timeout: 15_000 });
  const p = await leer(`pagos/${PAGOS.X.id}`);
  expect(p.aplicaciones).toHaveLength(2);
  expect(p.destinoIds.sort()).toEqual(['FAC-72-A', 'FAC-72-C']);

  // La factura recibe lo suyo: 4,000 − 2,000.
  await page.keyboard.press('Escape');
  const { page: p2, ctx: ctx2 } = await entrar(browser, 'administracion@vermur.com');
  await p2.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  expect(await cobradoYResta(p2, 'A-7203')).toEqual({ cobrado: '2,000.00', resta: '2,000.00' });
  await ctx2.close();
  await ctx.close();
});

test('B · quitar una aplicación pide motivo y devuelve el saldo', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPagos(page);
  await abrirFicha(page, PAGOS.X.folio);
  const ficha = page.getByTestId('ficha-pago');

  // La ficha en angosto: sin desbordes a 390 px.
  await page.setViewportSize({ width: 390, height: 900 });
  await foto(page, 'ficha-angosto');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });

  await ficha.getByRole('row').filter({ hasText: 'A-7203' }).getByRole('button', { name: 'Quitar aplicación' }).click();
  // Sin motivo no se puede.
  const confirmar = page.getByTestId('motivo-pago').getByRole('button', { name: 'Quitar aplicación' });
  await expect(confirmar).toBeDisabled();
  await page.getByLabel('Motivo de la corrección').fill('x');
  await expect(confirmar).toBeDisabled();
  await foto(page, 'quitar-motivo');
  await page.getByLabel('Motivo de la corrección').fill('Se aplicó a la factura equivocada');
  await confirmar.click();

  // La ficha se refresca sola: queda una aplicación y el rastro dice quién y por qué.
  await expect(ficha.getByTestId('aplicacion-pago')).toHaveCount(1, { timeout: 15_000 });
  await expect(ficha.getByTestId('correcciones-pago')).toContainText('Se aplicó a la factura equivocada');
  await expect(ficha.getByTestId('correcciones-pago')).toContainText('A-7203');
  await foto(page, 'quitar-hecho');

  const p = await leer(`pagos/${PAGOS.X.id}`);
  expect(p.destinoIds).toEqual(['FAC-72-A']);
  // Tarea 79: lo quitado queda DENTRO del pago, con motivo, autor y fecha.
  expect(p.aplicacionesQuitadas).toHaveLength(1);
  expect(p.aplicacionesQuitadas[0]).toMatchObject({
    destinoNumero: 'A-7203', motivo: 'Se aplicó a la factura equivocada',
  });
  expect(p.aplicacionesQuitadas[0].por).toBeTruthy();
  await ctx.close();

  const { page: p2, ctx: ctx2 } = await entrar(browser, 'administracion@vermur.com');
  await p2.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  expect(await cobradoYResta(p2, 'A-7203')).toEqual({ cobrado: '—', resta: '4,000.00' });
  await ctx2.close();
});

test('C · anular un pago: motivo, sigue en la lista con filtro y la factura recupera su saldo', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPagos(page);
  await abrirFicha(page, PAGOS.Z.folio);
  const ficha = page.getByTestId('ficha-pago');

  await ficha.getByRole('button', { name: 'Anular pago' }).click();
  const confirmar = page.getByTestId('motivo-pago').getByRole('button', { name: 'Anular pago' });
  await expect(confirmar).toBeDisabled();
  await page.getByLabel('Motivo de la corrección').fill('El banco devolvió la transferencia');
  await confirmar.click();

  await expect(ficha).toContainText('Anulado', { timeout: 15_000 });
  await expect(ficha.getByTestId('correcciones-pago')).toContainText('El banco devolvió la transferencia');
  await foto(page, 'anulado');
  await page.keyboard.press('Escape');
  await ficha.getByRole('button', { name: 'Cerrar' }).click();

  // Nada se borra: sale de «Vigentes» y aparece con «Anulados».
  await expect(page.getByRole('row').filter({ hasText: PAGOS.Z.folio })).toHaveCount(0);
  await page.getByRole('button', { name: /^Anulados/ }).click();
  await expect(page.getByRole('row').filter({ hasText: PAGOS.Z.folio })).toContainText('Anulado');
  expect((await leer(`pagos/${PAGOS.Z.id}`)).activo).toBe(false);

  // Y la factura vuelve a deber lo suyo.
  expect(await cobradoYResta(page, 'A-7202')).toEqual({ cobrado: '—', resta: '6,000.00' });
  await ctx.close();
});

test('C2 · anular un anticipo (anularDeposito) y dejarlo en la bitácora del embarque', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPagos(page);
  await abrirFicha(page, PAGOS.Y.folio);
  const ficha = page.getByTestId('ficha-pago');

  await expect(ficha).toContainText('dinero a cuenta del cliente');
  await ficha.getByRole('button', { name: 'Anular pago' }).click();
  await page.getByLabel('Motivo de la corrección').fill('Anticipo capturado dos veces');
  await page.getByTestId('motivo-pago').getByRole('button', { name: 'Anular pago' }).click();
  await expect(ficha).toContainText('Anulado', { timeout: 15_000 });

  expect((await leer(`pagos/${PAGOS.Y.id}`)).activo).toBe(false);
  // La bitácora se escribe DESPUÉS del pago: la ficha ya dice «Anulado» y la
  // entrada puede tardar un instante, así que se espera en vez de leer una vez.
  await expect.poll(async () => {
    const emb = await leer(`embarques/${EMB}`);
    return (emb.bitacora as Record<string, any>[] ?? []).map(e => `${e.titulo} ${e.detalle ?? ''}`).join('\n');
  }, { timeout: 15_000 }).toContain('Anticipo capturado dos veces');
  const emb = await leer(`embarques/${EMB}`);
  expect((emb.bitacora as Record<string, any>[]).map(e => e.titulo).join('\n')).toContain(PAGOS.Y.folio);
  await ctx.close();
});

test('Operaciones lee la ficha pero no ve los botones; Administración sí', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'operaciones@vermur.com');
  await abrirPagos(page);
  await abrirFicha(page, PAGOS.X.folio);
  const ficha = page.getByTestId('ficha-pago');
  await expect(ficha).toContainText('Solo Administración corrige pagos');
  await expect(ficha.getByRole('button', { name: 'Anular pago' })).toHaveCount(0);
  await expect(ficha.getByRole('button', { name: 'Quitar aplicación' })).toHaveCount(0);
  await ctx.close();

  // El par positivo: el mismo pago, con Administración, SÍ trae los botones.
  const { page: pa, ctx: ca } = await entrar(browser, 'administracion@vermur.com');
  await abrirPagos(pa);
  await abrirFicha(pa, PAGOS.X.folio);
  await expect(pa.getByTestId('ficha-pago').getByRole('button', { name: 'Anular pago' })).toBeVisible();
  await expect(pa.getByTestId('ficha-pago').getByRole('button', { name: 'Quitar aplicación' })).toBeVisible();
  await ca.close();
});

test('C3 · tarea 79 · un pago SIN embarque anulado deja su motivo en el pago y la ficha lo muestra', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPagos(page);
  await abrirFicha(page, PAGOS.W.folio);
  const ficha = page.getByTestId('ficha-pago');

  await ficha.getByRole('button', { name: 'Anular pago' }).click();
  await page.getByLabel('Motivo de la corrección').fill('Depósito sin cliente identificado');
  await page.getByTestId('motivo-pago').getByRole('button', { name: 'Anular pago' }).click();
  await expect(ficha).toContainText('Anulado', { timeout: 15_000 });

  // El motivo vive en el Pago: no hay embarque donde la bitácora lo anote.
  await expect(ficha.getByTestId('motivo-anulacion')).toContainText('Depósito sin cliente identificado');
  await expect(ficha.getByTestId('correcciones-pago')).toContainText('Depósito sin cliente identificado');
  const doc = await leer(`pagos/${PAGOS.W.id}`);
  expect(doc.activo).toBe(false);
  expect(doc.anulacion.motivo).toBe('Depósito sin cliente identificado');
  expect(doc.anulacion.por).toBeTruthy();
  expect(doc.anulacion.en).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  await foto(page, 'anulado-sin-embarque');
  await page.screenshot({ path: `${IMG}/79-anulado-sin-embarque-escritorio.png` });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: `${IMG}/79-anulado-sin-embarque-angosto.png` });

  await ctx.close();
});

test('limpia lo sembrado', async () => {
  await limpiar();
  for (const f of FACTURAS) await borrar(`facturas/${f.id}`);
  await borrar(`embarques/${EMB}`);
  await borrar(`clientes/${CLIENTE_ID}`);
});
