/**
 * calentar.spec.ts — el paso que faltaba antes del recorrido.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * Los emuladores arrancan VACÍOS y los catálogos NO los siembra ningún
 * script: los siembra la APP al detectar la base vacía. `sembrarEmuladores.sh`
 * solo crea las cinco cuentas de Auth.
 *
 * `e2e.sh` iba de las cuentas directo al paso 1, que en su primera pantalla ya
 * necesita el cliente CLI-SEED-003, los puertos Shanghai y Manzanillo y los
 * conceptos «Ocean Freight» y «Documentation». Si la siembra no había
 * terminado, esas opciones no existían: el paso fallaba y al reintento —con
 * los catálogos ya escritos— pasaba. Esa intermitencia se veía igual que una
 * regresión y nos quitaba la red de seguridad de cada publicación.
 *
 * ── Lo que hace ────────────────────────────────────────────────────────────
 * Abre la app, pasa por los módulos que montan cada hook, y NO cierra el
 * navegador hasta que las seis colecciones están completas en Firestore.
 *
 * Cerrar antes es justo lo que rompía el primer intento de este arreglo: la
 * siembra de proveedores son 544 escrituras en vuelo, y al cerrar el contexto
 * se quedaron 150. El navegador tiene que seguir vivo hasta que el SERVIDOR
 * las tenga: que el `await` del hook haya vuelto no prueba nada.
 */

import { test, expect } from '@playwright/test';

const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';

/** Lo que cada catálogo debe tener antes de que el recorrido pueda empezar. */
const CATALOGOS: [string, number][] = [
  ['conceptos', 105],
  ['puertos', 47],
  ['clientes', 3],
  ['proveedores', 544],
  ['terminosPago', 25],
  ['cotizaciones', 8],
];

/**
 * Cuenta los documentos de una colección SIGUIENDO la paginación.
 *
 * El REST del emulador pagina aunque se pida un `pageSize` grande, y quedarse
 * con la primera página hace creer que la siembra se quedó a medias: la de
 * proveedores «se detenía» siempre en el mismo número, que no era un tope de
 * escritura sino el tamaño de la página.
 */
async function cuantos(coleccion: string): Promise<number> {
  let total = 0;
  let token: string | undefined;
  try {
    do {
      const url = `${FS}/${coleccion}?pageSize=300`
        + (token ? `&pageToken=${encodeURIComponent(token)}` : '');
      const r = await fetch(url, { headers: { Authorization: 'Bearer owner' } });
      const j = await r.json() as { documents?: unknown[]; nextPageToken?: string };
      total += j.documents?.length ?? 0;
      token = j.nextPageToken;
    } while (token);
  } catch {
    return total;
  }
  return total;
}

test('calentamiento · la app siembra los catálogos', async ({ browser }) => {
  test.setTimeout(240_000);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());

  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill('admin@vermur.com');
  await page.getByPlaceholder('••••••••').fill('123456');
  await page.locator('#login-submit').click();
  await expect(page.getByText('Emuladores · producción intacta')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible({ timeout: 30_000 });

  /*
   * AppShell ya monta useProveedores, usePuertos y useTerminosPago en
   * cualquier vista; Dashboard monta useCotizaciones. Faltan useClientes y
   * useConceptos, que viven en CRM (Quotes) y en Tarifas (RatesManagement).
   */
  for (const modulo of ['CRM', 'Tarifas', 'Altas', 'Puertos']) {
    const boton = page.getByRole('button', { name: modulo, exact: true }).first();
    if (await boton.count() === 0) continue;
    await boton.click();
    await page.waitForTimeout(1_000);
  }

  // Con el navegador ABIERTO, esperar a que el servidor tenga todo.
  for (const [coleccion, minimo] of CATALOGOS) {
    await expect
      .poll(() => cuantos(coleccion), {
        timeout: 120_000,
        intervals: [1_000],
        message: `«${coleccion}» no llegó a ${minimo} documentos: la siembra no terminó`,
      })
      .toBeGreaterThanOrEqual(minimo);
    console.log(`[calentar] ${coleccion}: listo`);
  }

  await ctx.close();
});
