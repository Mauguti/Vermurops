/**
 * 70-aplicar-pago.spec.ts — P4 · «Aplicar pago» con varias facturas.
 *
 * Lo que recorre, en el orden de los cinco puntos de la tarea:
 *
 *   1. el reparto en cascada de UN pago entre TRES facturas, y el sobrante
 *   2. el sobrepago, que no se puede guardar
 *   3. la factura en otra moneda, que no aparece en la lista
 *   4. «qué pagos cubrieron esta factura», incluido un cobro viejo
 *   5. el guardado
 *
 * El paso del guardado corre EN VERDE desde el 6-oct, con la regla de
 * `pagos/` publicada: comprueba lo que quedó en Firestore, no el aviso del
 * bloqueo. Hasta el 5-oct fijaba lo contrario, porque el sprint no podía
 * editar `firestore.rules` (límite 4 del contrato).
 *
 * Requiere emuladores + app en :3100 arriba: `KEEP=1 ./scripts/e2e.sh`.
 * Se siembra con `Bearer owner` (el emulador trata ese token como Admin SDK).
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { fijarPreferencias } from './preferencias';

// Tarea 90: las vistas de Cuentas por cobrar/pagar se guardan por usuario; cada spec parte del default.
test.beforeAll(async () => { await fijarPreferencias(); });

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const PW = '123456';
const IMG = 'sprint/reportes/img';

const CLIENTE_ID = 'CLI-70';
const CLIENTE = 'APLICA PAGOS 70 SA DE CV';
const EMB = 'EMB-70';
const EMB_2 = 'EMB-70B';

async function escribir(ruta: string, fields: Record<string, unknown>) {
  const r = await fetch(`${FS}/${ruta}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields }),
  });
  expect(r.ok).toBe(true);
}

const S = (stringValue: string) => ({ stringValue });
const D = (doubleValue: number) => ({ doubleValue });
const B = (booleanValue: boolean) => ({ booleanValue });
const NULO = { nullValue: null };

interface Semilla {
  id: string; numero: string; total: number; moneda: 'MXN' | 'USD';
  vence: string; embarqueId: string; embarqueFolio: string;
}

/**
 * Cuatro facturas del MISMO cliente: tres en pesos con distinto atraso y una
 * en dólares, que es la que no debe aparecer. La tercera va en OTRO embarque
 * a propósito: un pago que cruza embarques es justo el caso que
 * `CobroCliente.embarqueId` no podía representar.
 */
const FACTURAS: Semilla[] = [
  { id: 'FAC-70-A', numero: 'A-7001', total: 45_000, moneda: 'MXN', vence: '2026-09-12', embarqueId: EMB, embarqueFolio: 'VLIM-26-070' },
  { id: 'FAC-70-B', numero: 'A-7002', total: 60_000, moneda: 'MXN', vence: '2026-09-28', embarqueId: EMB, embarqueFolio: 'VLIM-26-070' },
  { id: 'FAC-70-C', numero: 'A-7003', total: 38_000, moneda: 'MXN', vence: '2026-11-10', embarqueId: EMB_2, embarqueFolio: 'VLIM-26-071' },
  { id: 'FAC-70-D', numero: 'A-7004', total: 3_000, moneda: 'USD', vence: '2026-10-20', embarqueId: EMB, embarqueFolio: 'VLIM-26-070' },
];

/*
 * Borra los pagos que dejó una corrida anterior DE ESTE CLIENTE.
 *
 * Hace falta desde que el caso 9 corre en verde: antes el guardado estaba
 * bloqueado por la regla, nada mutaba y re-correr la suite era inofensivo.
 * Ahora escribe, y `aplicado` se DERIVA de las aplicaciones vivas (§4.32),
 * así que un pago sobreviviente deja las facturas cobradas y el paso 2 ve
 * una lista vacía. Sembrar `estado: 'emitida'` no alcanza: el estado se
 * recalcula desde los pagos.
 *
 * Solo toca a CLI-70 — lo del recorrido del jueves se queda donde está.
 */
async function limpiarPagosDe(clienteId: string) {
  const r = await fetch(`${FS}/pagos?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  if (!r.ok) return;                       // la colección puede no existir aún
  const d = await r.json() as { documents?: { name: string; fields: Record<string, any> }[] };
  for (const doc of d.documents ?? []) {
    if (doc.fields?.terceroId?.stringValue !== clienteId) continue;
    await fetch(`${FS}/pagos/${doc.name.split('/').pop()}`, {
      method: 'DELETE', headers: { Authorization: 'Bearer owner' },
    });
  }
}

async function sembrar() {
  await limpiarPagosDe(CLIENTE_ID);

  await escribir(`clientes/${CLIENTE_ID}`, {
    id: S(CLIENTE_ID), nombre: S(CLIENTE), activo: B(true),
    rfc: S('APS260101AA7'), origenDatos: S('magaya'),
    statusOperativo: S('ACTIVO'), correo: S('pagos70@ejemplo.com'),
    numeroEntidadMagaya: S('70001'), dias: { integerValue: '45' },
    createdAt: S('2026-10-01T09:00:00.000Z'), updatedAt: S('2026-10-01T09:00:00.000Z'),
  });

  for (const f of FACTURAS) {
    await escribir(`facturas/${f.id}`, {
      id: S(f.id), numero: S(f.numero),
      fechaEmision: S('2026-08-20'), fechaVencimiento: S(f.vence),
      diasCredito: { integerValue: '30' },
      embarqueId: S(f.embarqueId), embarqueFolio: S(f.embarqueFolio),
      clienteId: S(CLIENTE_ID), clienteNombre: S(CLIENTE),
      grupoFacturacion: NULO, moneda: S(f.moneda),
      subtotal: D(f.total), iva: D(0), retencion: D(0), total: D(f.total),
      estado: S('emitida'), lineas: { arrayValue: { values: [] } },
      activo: B(true),
      createdAt: S('2026-08-20T09:00:00.000Z'), updatedAt: S('2026-08-20T09:00:00.000Z'),
    });
  }

  /*
   * Un cobro VIEJO de `cobros/` contra la tercera: deja su saldo en 30,000 y
   * es lo que «qué pagos la cubrieron» tiene que pintar como registro
   * anterior. Nada se migra: se lee con el adaptador de la tarea 67.
   */
  await escribir('cobros/COB-70-VIEJO', {
    id: S('COB-70-VIEJO'),
    facturaId: S('FAC-70-C'), facturaNumero: S('A-7003'),
    embarqueId: S(EMB_2), embarqueFolio: S('VLIM-26-071'),
    clienteId: S(CLIENTE_ID), clienteNombre: S(CLIENTE),
    monto: D(8_000), moneda: S('MXN'), fechaCobro: S('2026-09-15'),
    banco: S('BBVA'), referencia: S('SPEI-VIEJO-70'), activo: B(true),
    createdAt: S('2026-09-15T09:00:00.000Z'), updatedAt: S('2026-09-15T09:00:00.000Z'),
  });
}

/*
 * Lectura por la REST del emulador CON la sesión de una persona, no con
 * `Bearer owner`: la siembra usa owner porque simula al Admin SDK, pero
 * comprobar lo que quedó tiene que pasar por las reglas. Si el bloque de
 * `pagos/` desapareciera, esto falla — que es justo lo que se quiere saber.
 * Mismo helper que `recorrido-jueves.spec.ts`.
 */
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

/** Aplana el JSON de la REST de Firestore a valores simples. */
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

const ANCHO = { width: 390, height: 900 };

async function foto(page: Page, nombre: string) {
  await page.screenshot({ path: `${IMG}/70-${nombre}.png`, fullPage: true });
}

/** Cuentas por cobrar, filtrado a este cliente para que su grupo quede solo. */
async function abrirPorCobrar(page: Page) {
  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cuentas por cobrar', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Por cliente' })).toBeVisible({ timeout: 15_000 });
  await page.locator('select').filter({ hasText: 'Cliente: todos' }).selectOption(CLIENTE_ID);
  await expect(page.getByText('A-7001').first()).toBeVisible({ timeout: 15_000 });
}

/** Abre «Aplicar pago» desde el renglón de la factura más vencida. */
async function abrirModal(page: Page) {
  await page.getByRole('button', { name: 'Aplicar pago' }).first().click();
  await expect(page.getByRole('heading', { name: `Aplicar pago · ${CLIENTE}` })).toBeVisible({ timeout: 15_000 });
}

/**
 * El renglón de una factura DENTRO del modal.
 *
 * Se localiza por su casilla y no por el número: la tabla de la cartera sigue
 * detrás del modal con los mismos folios, y buscar por texto encuentra las
 * dos. Es la misma trampa que el modo estricto de Playwright existe para
 * atrapar.
 */
function renglon(page: Page, numero: string) {
  return page.getByRole('row').filter({ has: page.getByRole('checkbox', { name: `Aplicar a ${numero}` }) });
}

test('siembra el cliente con cuatro facturas y un cobro viejo', async () => {
  await sembrar();
});

test('la lista ofrece las tres facturas en pesos y NO la de dólares', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPorCobrar(page);
  await abrirModal(page);

  // Punto 2 de la tarea: una factura en otra moneda no aparece en la lista.
  for (const n of ['A-7001', 'A-7002', 'A-7003']) {
    await expect(page.getByRole('checkbox', { name: `Aplicar a ${n}` })).toBeVisible();
  }
  await expect(page.getByRole('checkbox', { name: 'Aplicar a A-7004' })).toHaveCount(0);

  // El saldo de la tercera ya trae descontado el cobro viejo: 38,000 − 8,000.
  await expect(renglon(page, 'A-7003')).toContainText('30,000.00');

  await foto(page, 'modal-abierto');
  await ctx.close();
});

test('el reparto en cascada aplica un pago a tres facturas y cuadra', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPorCobrar(page);
  await abrirModal(page);

  await page.getByLabel('Monto del pago').fill('120000');
  await page.getByRole('button', { name: 'Aplicar lo más vencido primero' }).click();

  // 45,000 + 60,000 completos, y 15,000 a la tercera: queda parcial.
  await expect(page.getByLabel('Monto aplicado a A-7001')).toHaveValue('45000');
  await expect(page.getByLabel('Monto aplicado a A-7002')).toHaveValue('60000');
  await expect(page.getByLabel('Monto aplicado a A-7003')).toHaveValue('15000');

  // Punto 3: el restante de cada factura, a la vista.
  await expect(renglon(page, 'A-7003')).toContainText('15,000.00');
  await expect(page.getByText('✓ cuadra')).toBeVisible();
  await expect(page.getByText(/Aplicado MXN 120,000.00/)).toBeVisible();
  await expect(page.getByText(/3 facturas, 2 quedan cobradas, 1 parcial/)).toBeVisible();

  await foto(page, 'cascada-tres-facturas');
  await page.setViewportSize(ANCHO);
  await foto(page, 'cascada-tres-facturas-angosto');
  await ctx.close();
});

test('lo que sobra queda a favor del cliente, a la vista', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPorCobrar(page);
  await abrirModal(page);

  // Punto 1: el excedente NO se mete a la fuerza en la última factura.
  await page.getByLabel('Monto del pago').fill('200000');
  await page.getByRole('button', { name: 'Aplicar lo más vencido primero' }).click();
  await expect(page.getByText(/quedan MXN 65,000.00 a favor del cliente/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar pago' })).toBeEnabled();

  await foto(page, 'sobrante-a-favor');
  await ctx.close();
});

test('aplicar más de lo que entró no se puede guardar', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPorCobrar(page);
  await abrirModal(page);

  await page.getByLabel('Monto del pago').fill('50000');
  await page.getByLabel('Monto aplicado a A-7002').fill('60000');
  await expect(page.getByText(/Estás aplicando 105,000.00 de un pago de 50,000.00/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar pago' })).toBeDisabled();

  await foto(page, 'sobrepago-bloqueado');
  await ctx.close();
});

test('aplicarle a una factura más de lo que debe tampoco', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPorCobrar(page);
  await abrirModal(page);

  await page.getByLabel('Monto del pago').fill('200000');
  await page.getByLabel('Monto aplicado a A-7001').fill('90000');
  await expect(page.getByText(/A-7001 debe 45,000.00: aplicarle 90,000.00 la dejaría sobrecobrada/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar pago' })).toBeDisabled();
  await ctx.close();
});

test('un pago en dólares lo DICE en vez de dejar la lista vacía', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPorCobrar(page);
  await abrirModal(page);

  // El cliente tiene una factura en USD, pero el pago se abrió en MXN. Al
  // cambiar la moneda, la lista pasa a ofrecer SOLO la de dólares (§4).
  await page.getByLabel('Moneda del pago').selectOption('USD');
  await expect(page.getByRole('checkbox', { name: 'Aplicar a A-7004' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Aplicar a A-7001' })).toHaveCount(0);

  await foto(page, 'moneda-usd');
  await ctx.close();
});

test('desde la factura se ve qué pagos la cubrieron (punto 4)', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPorCobrar(page);

  // La tercera factura trae el cobro viejo: el cobrado es el enlace.
  await page.getByRole('button', { name: /8,000.00/ }).first().click();
  await expect(page.getByText('Pagos que cubrieron A-7003')).toBeVisible();
  await expect(page.getByText('COB-70-VIEJO')).toBeVisible();
  await expect(page.getByText('registro anterior')).toBeVisible();
  await expect(page.getByText('SPEI-VIEJO-70')).toBeVisible();
  // Y el renglón dice que está parcialmente cobrada.
  await expect(page.getByText('Parcial').first()).toBeVisible();

  await foto(page, 'cobertura-de-factura');
  await ctx.close();
});

/**
 * Caso 9 · el guardado, con la regla de `pagos/` ya publicada (6-oct-2026).
 *
 * Hasta el 5-oct este test fijaba el BLOQUEO: `pagos/` no tenía su bloque en
 * `firestore.rules`, el catch-all negaba la escritura y el aviso de la
 * pantalla era lo único comprobable. Publicada la regla, lo que se comprueba
 * es el resultado: UN documento en `pagos/` con TRES aplicaciones, los dos
 * embarques en `embarqueIds` —un pago que cruza embarques es justo lo que
 * `CobroCliente.embarqueId` no podía representar— y las tres facturas con su
 * estado nuevo.
 *
 * La lectura va con la sesión de Administración: así la comprobación pasa por
 * las reglas. Si alguien quita el bloque de `pagos/`, este test se cae aquí y
 * no en un aviso de interfaz.
 */
test('el guardado reparte el pago entre las tres facturas y queda en pagos/', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPorCobrar(page);
  await abrirModal(page);

  await page.getByLabel('Monto del pago').fill('120000');
  await page.getByRole('button', { name: 'Aplicar lo más vencido primero' }).click();
  await page.getByRole('button', { name: 'Registrar pago' }).click();

  // El modal cierra al guardar: mientras siga abierto, no guardó.
  await expect(page.getByRole('button', { name: 'Registrar pago' })).toHaveCount(0, { timeout: 15_000 });
  // Y el aviso del bloqueo no debe volver a aparecer.
  await expect(page.getByText(/no tiene su regla publicada/)).toHaveCount(0);
  await foto(page, 'guardado-con-regla');

  /*
   * Filtrado por ESTE cliente, no por «el primer PAG-». El recorrido del
   * jueves ya deja un pago en la colección —registrar un cobro escribe en
   * `pagos/` desde la tarea 68— así que tomar el primero encontraba el
   * ajeno. Y si el mismo cliente tuviera varios, el que importa es el único
   * que reparte a tres facturas.
   */
  const pagos = await leerColeccion('administracion@vermur.com', 'pagos');
  const suyos = pagos.filter(x => x.terceroId === CLIENTE_ID
                                  && String(x.folio ?? '').startsWith('PAG-'));
  expect(suyos, `no quedó ningún pago de ${CLIENTE_ID} en pagos/`).toHaveLength(1);
  const p = suyos[0] as Record<string, any>;
  expect(p.monto).toBe(120000);
  expect(p.aplicaciones).toHaveLength(3);
  expect((p.destinoIds as string[]).sort()).toEqual(['FAC-70-A', 'FAC-70-B', 'FAC-70-C']);
  expect((p.embarqueIds as string[]).sort()).toEqual([EMB, EMB_2].sort());

  /*
   * Cuánto le toca a cada factura. Es el contenido del reparto: A y B
   * completas, C a la mitad de lo que le quedaba.
   */
  const porFactura = Object.fromEntries(
    (p.aplicaciones as Record<string, any>[]).map(a => [a.destinoId, a.monto]),
  );
  // Los mismos números que el paso 3 fija en pantalla, ahora en Firestore:
  // 45,000 + 60,000 completas y 15,000 a la tercera, que queda parcial.
  expect(porFactura['FAC-70-A']).toBe(45_000);
  expect(porFactura['FAC-70-B']).toBe(60_000);
  expect(porFactura['FAC-70-C']).toBe(15_000);

  /*
   * El `estado` GUARDADO de las facturas NO se mueve, y está bien: §4.32 dice
   * que `aplicado`, `sinAplicar` y `avanceDeDestino` se DERIVAN y ninguna se
   * guarda. El bloque que la noche dejó comentado esperaba
   * `estado === 'cobrada'` en Firestore; eso contradice la arquitectura de la
   * propia tarea 67 y por eso no se usó. Lo que se comprueba es la
   * derivación, donde la gente la ve: la factura liquidada deja de ofrecerse
   * y la parcial sigue, con su saldo nuevo.
   */
  const facturas = await leerColeccion('administracion@vermur.com', 'facturas');
  const f = (id: string) => facturas.find(x => x.__id === id) as Record<string, any>;
  expect(f('FAC-70-A').estado).toBe('emitida');

  /*
   * En la cartera, con su filtro «Abiertas» de omisión: las dos liquidadas
   * DESAPARECEN y la parcial se queda. No se reusa `abrirPorCobrar` aquí a
   * propósito — ese helper espera ver A-7001, y que ya no esté es justo el
   * resultado. Esto es la derivación donde Julio la ve.
   */
  const { page: p2, ctx: ctx2 } = await entrar(browser, 'administracion@vermur.com');
  await p2.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await p2.getByRole('button', { name: 'Cuentas por cobrar', exact: true }).first().click();
  await expect(p2.getByRole('button', { name: 'Por cliente' })).toBeVisible({ timeout: 15_000 });
  await p2.locator('select').filter({ hasText: 'Cliente: todos' }).selectOption(CLIENTE_ID);
  await expect(p2.getByText('A-7003').first()).toBeVisible({ timeout: 15_000 });
  await expect(p2.getByText('A-7001')).toHaveCount(0);
  await expect(p2.getByText('A-7002')).toHaveCount(0);
  await foto(p2, 'tras-guardar-quedan-las-no-liquidadas');
  await ctx2.close();

  await ctx.close();
});
