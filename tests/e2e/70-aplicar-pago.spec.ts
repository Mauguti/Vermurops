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
 * ⚠️ El paso del guardado documenta el BLOQUEO de la noche: `pagos/` no
 * tiene su bloque publicado en `firestore.rules` y el sprint no puede
 * editarlo (límite 4 del contrato). El aviso que sale es el que la tarea 68
 * dejó cableado, y este test lo fija: si alguien publica la regla y el aviso
 * sigue saliendo, el problema es otro. Cuando la regla esté, este test se
 * cambia por su versión en verde —está escrita abajo, comentada, con lo que
 * tiene que quedar en Firestore.
 *
 * Requiere emuladores + app en :3100 arriba: `KEEP=1 ./scripts/e2e.sh`.
 * Se siembra con `Bearer owner` (el emulador trata ese token como Admin SDK).
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
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

async function sembrar() {
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
 * El guardado. **Hoy falla, y el aviso es el artefacto que importa.**
 *
 * `pagos/` no tiene su bloque en `firestore.rules`: el catch-all niega todo
 * lo que no esté nombrado, y el sprint no puede editar ese archivo (límite 4).
 * El bloque listo para pegar está en `docs/sprint-post-junta/REGLA-PAGOS.md`.
 *
 * Cuando la regla esté publicada, este test se reemplaza por lo que está
 * comentado abajo: UN documento en `pagos/` con TRES aplicaciones, los dos
 * embarques en `embarqueIds`, y las tres facturas con su estado nuevo.
 */
test('el guardado espera la regla de pagos/, y lo dice', async ({ browser }) => {
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirPorCobrar(page);
  await abrirModal(page);

  await page.getByLabel('Monto del pago').fill('120000');
  await page.getByRole('button', { name: 'Aplicar lo más vencido primero' }).click();
  await page.getByRole('button', { name: 'Registrar pago' }).click();

  /* Sale DOS veces y las dos están bien: el toast de arriba y el renglón de
     error dentro del modal, que es el que deja el reparto capturado en vez de
     tirarlo. */
  await expect(page.getByText(/no tiene su regla publicada/).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/no tiene su regla publicada/)).toHaveCount(2);
  await foto(page, 'guardado-sin-regla');
  await ctx.close();

  /* Con la regla publicada, esto es lo que tiene que quedar:
   *
   *   const pagos = await leerColeccion('administracion@vermur.com', 'pagos');
   *   const p = pagos.find(x => x.folio?.startsWith('PAG-'))!;
   *   expect(p.monto).toBe(120000);
   *   expect(p.aplicaciones).toHaveLength(3);
   *   expect(p.destinoIds.sort()).toEqual(['FAC-70-A', 'FAC-70-B', 'FAC-70-C']);
   *   expect(p.embarqueIds.sort()).toEqual([EMB, EMB_2]);   // cruza dos embarques
   *   const facturas = await leerColeccion('administracion@vermur.com', 'facturas');
   *   expect(facturas.find(f => f.__id === 'FAC-70-A')!.estado).toBe('cobrada');
   *   expect(facturas.find(f => f.__id === 'FAC-70-C')!.estado).toBe('cobrada_parcial');
   */
});
