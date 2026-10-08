/**
 * 98-comprobante-por-rol.spec.ts — el comprobante es de quien paga.
 *
 * Las reglas por rol (martes 13) exigen `ordenCompra.autorizar` para tocar
 * `comprobantePago` y `pagadaPor`. Este spec fija el espejo en la PANTALLA,
 * que es lo que se publica antes: Operaciones ve el campo pero no lo edita, y
 * el botón «Registrar pago» de Programación de pagos deja de ofrecérsele.
 *
 * Sin esto, el martes Operaciones teclea el comprobante y recibe un rechazo
 * rojo después de escribir — la pantalla prometiendo lo que la base niega.
 *
 * Requiere `KEEP=1 ./scripts/e2e.sh` y luego
 * `npx playwright test tests/e2e/98-comprobante-por-rol.spec.ts --workers=1`.
 */
import { test, expect, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const PW = '123456';
const S = (stringValue: string) => ({ stringValue });
const D = (doubleValue: number) => ({ doubleValue });
const B = (booleanValue: boolean) => ({ booleanValue });
const NULO = { nullValue: null };
const ARR = (values: unknown[]) => ({ arrayValue: { values } });

const FOLIO = 'OC-2026-0981';

async function escribir(ruta: string, fields: Record<string, unknown>) {
  const r = await fetch(`${FS}/${ruta}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields }),
  });
  expect(r.ok).toBe(true);
}

/** Una orden AUTORIZADA y sin pagar: el estado en que el campo está vivo. */
async function sembrar() {
  await escribir('ordenesCompra/OC-98', {
    id: S('OC-98'), folio: S(FOLIO), activo: B(true), estado: S('autorizada'), origen: S('oficina'),
    proveedorId: S('PRV-9801'), proveedorNombre: S('PROVEEDOR 98'),
    conceptoId: S('CON-001'), conceptoNombre: S('Renta 98'), descripcion: S('Tarea 98'),
    monto: D(4000), moneda: S('MXN'), saldoPendiente: NULO, montoDisponible: NULO, esAnticipo: B(false),
    facturaAsociada: NULO, comprobantePago: NULO,
    bancoSalida: S('santander_gastos'), cuentaBancariaId: NULO, cuentaSalida: NULO,
    urgencia: S('normal'), fechaRequerida: S('2026-10-01'), fechaSugeridaPago: S('2026-10-01'),
    autorizadaPor: { mapValue: { fields: {
      uid: S('u-adm'), nombre: S('Admin 98'), fecha: S('2026-10-01T12:00:00.000Z'),
    } } },
    historialEstados: ARR([]), anticiposCruzados: ARR([]),
    createdAt: S('2026-10-01T09:00:00.000Z'), updatedAt: S('2026-10-01T09:00:00.000Z'),
  });
}

async function entrar(browser: any, email: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page: Page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(PW);
  await page.locator('#login-submit').click();
  await expect(page.getByText('Emuladores · producción intacta')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
  return page;
}

async function abrirLaOrden(page: Page) {
  await page.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cuentas por pagar' }).click();
  await page.getByText(FOLIO).first().click();
  await expect(page.getByText('Comprobante de pago').first()).toBeVisible({ timeout: 15_000 });
}

/** El input del campo. El `aria-label` lo liga a su rótulo. */
const campoComprobante = (page: Page) => page.getByLabel('Comprobante de pago');

test('siembra la orden autorizada', async () => {
  await sembrar();
});

test('Administración edita el comprobante y ve la ayuda de siempre', async ({ browser }) => {
  const page = await entrar(browser, 'administracion@vermur.com');
  await abrirLaOrden(page);

  await expect(campoComprobante(page)).toBeEditable();
  await expect(page.getByText(/el comprobante ES la prueba de que salió el dinero/)).toBeVisible();
  // Y NO le sale el texto del otro rol.
  await expect(page.getByText('Lo captura Administración al registrar el pago')).toHaveCount(0);

  await page.close();
});

test('Operaciones LO VE pero no lo edita, y la ayuda dice quién lo captura', async ({ browser }) => {
  const page = await entrar(browser, 'operaciones@vermur.com');
  await abrirLaOrden(page);

  /*
   * Visible y no editable: ver la referencia del pago es parte de entender la
   * orden; capturarla, no. Esconderlo mandaría a buscar un dato que sí existe.
   */
  await expect(campoComprobante(page)).toBeVisible();
  await expect(campoComprobante(page)).not.toBeEditable();
  await expect(page.getByText('Lo captura Administración al registrar el pago')).toBeVisible();
  await expect(page.getByText(/el comprobante ES la prueba de que salió el dinero/)).toHaveCount(0);

  await page.close();
});

test('«Registrar pago» de Programación de pagos: Administración sí, Operaciones no', async ({ browser }) => {
  /*
   * El botón se ofrecía a todo el que ve Finanzas y la escritura la detenía
   * la máquina de estados aguas abajo: un botón que no cumple su promesa.
   * El positivo va junto a la ausencia (§4.42): si la tarjeta no se pintara,
   * «no está el botón» pasaría sin probar nada.
   */
  const admin = await entrar(browser, 'administracion@vermur.com');
  await admin.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await admin.getByRole('button', { name: 'Programación de pagos' }).click();
  await expect(admin.getByText('PROVEEDOR 98').first()).toBeVisible({ timeout: 15_000 });
  await expect(admin.getByRole('button', { name: 'Registrar pago' }).first()).toBeVisible();
  await admin.close();

  const ops = await entrar(browser, 'operaciones@vermur.com');
  await ops.getByRole('button', { name: 'Finanzas', exact: true }).first().click();
  await ops.getByRole('button', { name: 'Programación de pagos' }).click();
  // El positivo: la misma tarjeta se pinta…
  await expect(ops.getByText('PROVEEDOR 98').first()).toBeVisible({ timeout: 15_000 });
  // …y «Copiar detalle», que sí es suyo, sigue ahí.
  await expect(ops.getByRole('button', { name: 'Copiar detalle' }).first()).toBeVisible();
  // Lo que no está es el de registrar.
  await expect(ops.getByRole('button', { name: 'Registrar pago' })).toHaveCount(0);
  await ops.close();
});
