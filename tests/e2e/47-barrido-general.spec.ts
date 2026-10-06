/**
 * Tarea 47 — Barrido general: errores de consola y pantallas rotas por rol.
 *
 * Para cada rol (admin, ventas, pricing, operaciones, administracion) abre
 * CADA pantalla y pestaña del menú. Registra:
 *   - Errores y warnings de consola
 *   - Peticiones de red fallidas (4xx, 5xx)
 *   - Textos «undefined», «NaN», «[object Object]» visibles
 *   - Pantallas que un rol VE pero NO debería (§4.1)
 *   - Desbordes en viewport angosto (390px)
 *
 * Los arreglos triviales van en commits aparte; lo demás va a
 * docs/sprint-post-junta/BARRIDO-GENERAL.md.
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { fijarPreferencias } from './preferencias';

// Tarea 90: las vistas de Cuentas por cobrar/pagar se guardan por usuario; cada spec parte del default.
test.beforeAll(async () => { await fijarPreferencias(); });

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const PW = '123456';

// ── Tipos ────────────────────────────────────────────────────────────────────

interface ConsolaEntry {
  type: string;
  text: string;
  url?: string;
}

interface RequestEntry {
  url: string;
  status: number;
  method: string;
}

interface Hallazgo {
  rol: string;
  modulo: string;
  subvista: string;
  tipo: 'consola' | 'red' | 'texto' | 'permiso' | 'desborde';
  detalle: string;
}

const hallazgos: Hallazgo[] = [];

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  await page.waitForTimeout(800);
}

/**
 * Registra errores de consola y peticiones fallidas mientras se navega.
 * Devuelve funciones para empezar/detener la escucha y recoger resultados.
 */
function escuchaConsola(page: Page) {
  const errores: ConsolaEntry[] = [];
  const requestsFallidas: RequestEntry[] = [];

  const onConsole = (msg: any) => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      const text = msg.text();
      // Ignorar warnings conocidos e inofensivos
      if (text.includes('DevTools') ||
          text.includes('React does not recognize') ||
          text.includes('Download the React DevTools') ||
          text.includes('Deprecated') ||
          text.includes('Third-party cookie') ||
          text.includes('ResizeObserver loop') ||
          text.includes('favicon.ico') ||
          text.includes('auth/emulator') ||
          text.includes('useEmulators') ||
          text.includes('FirebaseError: Firebase: Error') ||
          text.includes('Source map') ||
          text.includes('net::ERR') ||
          text.includes('Already connected to') ||
          text.includes('firebase-messaging') ||
          text.includes('Missing initializer')) {
        return;
      }
      errores.push({ type, text: text.substring(0, 500) });
    }
  };

  const onResponse = (response: any) => {
    const status = response.status();
    if (status >= 400) {
      const url = response.url();
      // Ignorar peticiones a emuladores / favicon / etc.
      if (url.includes('favicon') ||
          url.includes('__/') ||
          url.includes('hot-update') ||
          url.includes('emulator') ||
          url.includes('127.0.0.1:9099') ||
          url.includes('127.0.0.1:8080') ||
          url.includes('identitytoolkit')) {
        return;
      }
      requestsFallidas.push({ url: url.substring(0, 200), status, method: response.request().method() });
    }
  };

  page.on('console', onConsole);
  page.on('response', onResponse);

  return {
    detener: () => {
      page.removeListener('console', onConsole);
      page.removeListener('response', onResponse);
    },
    errores,
    requestsFallidas,
  };
}

/**
 * Busca textos rotos visibles en la página.
 *
 * Usa evaluate() para buscar texto exacto (case-sensitive) y evitar
 * falsos positivos del locator `text=` de Playwright, que es
 * case-insensitive y matchea substrings (ej: «NaN» en «Finanzas»).
 */
async function buscarTextosRotos(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const patrones = [
      // Regex con word boundary para evitar substrings (NaN dentro de Finanzas, etc.)
      { nombre: 'undefined', regex: /\bundefined\b/i },
      { nombre: 'NaN', regex: /\bNaN\b/ },  // case-sensitive: NaN es siempre así
      { nombre: '[object Object]', regex: /\[object Object\]/ },
    ];
    const resultados: string[] = [];
    const walker = document.createTreeWalker(
      document.body, NodeFilter.SHOW_TEXT, null,
    );
    let nodo: Text | null;
    while ((nodo = walker.nextNode() as Text | null)) {
      const texto = nodo.textContent ?? '';
      if (!texto.trim()) continue;
      // Saltar nodos dentro de <script>, <style>, o elementos ocultos
      const padre = nodo.parentElement;
      if (!padre) continue;
      const tag = padre.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue;
      // Verificar visibilidad
      const rect = padre.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = window.getComputedStyle(padre);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

      for (const p of patrones) {
        if (p.regex.test(texto)) {
          // Filtrar usos legítimos en código/docs
          if (texto.includes('typeof') || texto.includes('=== undefined') || texto.includes('!== undefined')) continue;
          const contexto = texto.trim().substring(0, 100);
          resultados.push(`«${p.nombre}» en: ${contexto}`);
        }
      }
    }
    return resultados.slice(0, 20); // limitar a 20 hallazgos por página
  });
}

/**
 * Vista a lo que un rol tiene acceso según ALLOWED_VIEWS_BY_ROLE (§4.1).
 */
const VISTAS_POR_ROL: Record<string, string[]> = {
  admin: ['Dashboard', 'CRM', 'Embarques', 'Finanzas', 'Tipo de cambio', 'Altas', 'Puertos', 'Tarifas', 'Reportes', 'Configuración'],
  ventas: ['Dashboard', 'CRM', 'Altas', 'Configuración'],
  pricing: ['Dashboard', 'CRM', 'Tarifas', 'Altas', 'Puertos', 'Tipo de cambio', 'Configuración'],
  operaciones: ['Dashboard', 'Embarques', 'Altas', 'Puertos', 'Tipo de cambio', 'Finanzas', 'Configuración'],
  administracion: ['Dashboard', 'Altas', 'Finanzas', 'Embarques', 'Tipo de cambio', 'Puertos', 'Reportes', 'Configuración'],
};

/** Módulos que NO deberían estar en el menú de este rol. */
const TODOS_LOS_MODULOS = ['Dashboard', 'CRM', 'Embarques', 'Finanzas', 'Tipo de cambio', 'Altas', 'Puertos', 'Tarifas', 'Reportes', 'Configuración'];

// ── Sub-vistas por módulo ────────────────────────────────────────────────────

interface SubVista {
  label: string;
  /** Selector para hacer click y abrir la sub-vista */
  selector: string;
  /** Solo disponible para estos roles (vacío = todos los que ven el módulo) */
  roles?: string[];
}

const SUBVISTAS: Record<string, SubVista[]> = {
  CRM: [
    { label: 'Cotizaciones', selector: 'button:has-text("Cotizaciones"):not(:has-text("Bandeja"))' },
    { label: 'Prospectos', selector: 'button:has-text("Prospectos")', roles: ['ventas', 'admin'] },
    { label: 'Bandeja Pricing', selector: 'button:has-text("Bandeja Pricing")', roles: ['pricing', 'admin'] },
  ],
  Embarques: [
    { label: 'Tablero', selector: 'button:has-text("Tablero")' },
    { label: 'Todos los embarques', selector: 'button:has-text("Todos los embarques")' },
  ],
  Finanzas: [
    { label: 'Cuentas por pagar', selector: 'button:has-text("Cuentas por pagar")' },
    { label: 'Cuentas por cobrar', selector: 'button:has-text("Cuentas por cobrar")' },
    { label: 'Programación de pagos', selector: 'button:has-text("Programación de pagos")' },
    { label: 'Facturas (CFDI)', selector: 'button:has-text("Facturas (CFDI)")' },
    { label: 'Estados de cuenta', selector: 'button:has-text("Estados de cuenta")' },
  ],
  Altas: [
    { label: 'Clientes', selector: 'button:has-text("Clientes"):not(:has-text("Portal"))' },
    { label: 'Proveedores', selector: 'button:has-text("Proveedores")' },
  ],
  Configuración: [
    { label: 'Mi Perfil', selector: 'button:has-text("Mi Perfil")' },
    { label: 'Catálogo de conceptos', selector: 'button:has-text("Catálogo de conceptos")' },
  ],
};

// ── Tests ────────────────────────────────────────────────────────────────────

const ROLES = [
  { nombre: 'admin', email: 'admin@vermur.com' },
  { nombre: 'ventas', email: 'ventas@vermur.com' },
  { nombre: 'pricing', email: 'pricing@vermur.com' },
  { nombre: 'operaciones', email: 'operaciones@vermur.com' },
  { nombre: 'administracion', email: 'administracion@vermur.com' },
];

for (const { nombre, email } of ROLES) {
  test.describe(`Rol: ${nombre}`, () => {
    let page: Page;
    let ctx: BrowserContext;
    let escucha: ReturnType<typeof escuchaConsola>;

    test.beforeAll(async ({ browser }) => {
      ({ page, ctx } = await entrar(browser, email));
      escucha = escuchaConsola(page);
    });

    test.afterAll(async () => {
      escucha.detener();
      await ctx.close();
    });

    // ── Verificar que el menú no muestre módulos que no corresponden ─────
    test(`[${nombre}] menú lateral solo muestra módulos permitidos`, async () => {
      const permitidos = VISTAS_POR_ROL[nombre];
      const noPermitidos = TODOS_LOS_MODULOS.filter(m => !permitidos.includes(m));

      for (const modulo of noPermitidos) {
        const btn = page.getByRole('button', { name: modulo, exact: true }).first();
        const visible = await btn.isVisible().catch(() => false);
        if (visible) {
          hallazgos.push({
            rol: nombre, modulo, subvista: '-',
            tipo: 'permiso',
            detalle: `${nombre} VE «${modulo}» en el menú pero NO debería (§4.1)`,
          });
        }
      }
    });

    // ── Recorrer cada módulo permitido y sus sub-vistas ──────────────────
    const modulosDeEsteRol = VISTAS_POR_ROL[nombre];

    for (const modulo of modulosDeEsteRol) {
      test(`[${nombre}] ${modulo} — carga sin errores`, async () => {
        // Limpiar errores previos
        escucha.errores.length = 0;
        escucha.requestsFallidas.length = 0;

        await irA(page, modulo);
        await page.waitForTimeout(1500); // esperar carga

        // Buscar textos rotos
        const textos = await buscarTextosRotos(page);
        for (const t of textos) {
          hallazgos.push({
            rol: nombre, modulo, subvista: '-',
            tipo: 'texto',
            detalle: t,
          });
        }

        // Registrar errores de consola
        for (const e of escucha.errores) {
          hallazgos.push({
            rol: nombre, modulo, subvista: '-',
            tipo: 'consola',
            detalle: `[${e.type}] ${e.text}`,
          });
        }

        // Registrar peticiones fallidas
        for (const r of escucha.requestsFallidas) {
          hallazgos.push({
            rol: nombre, modulo, subvista: '-',
            tipo: 'red',
            detalle: `${r.method} ${r.url} → ${r.status}`,
          });
        }

        // Captura
        await page.screenshot({
          path: `sprint/reportes/img/47-${nombre}-${modulo.replace(/\s/g, '_')}.png`,
          fullPage: false,
        });
      });

      // Sub-vistas si existen
      const subvistas = SUBVISTAS[modulo];
      if (subvistas) {
        for (const sv of subvistas) {
          // Saltar sub-vistas restringidas por rol
          if (sv.roles && !sv.roles.includes(nombre)) continue;

          test(`[${nombre}] ${modulo} → ${sv.label}`, async () => {
            escucha.errores.length = 0;
            escucha.requestsFallidas.length = 0;

            await irA(page, modulo);
            await page.waitForTimeout(500);

            // Hacer click en la sub-vista
            const btn = page.locator(sv.selector).first();
            if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await btn.click();
              await page.waitForTimeout(1200);

              const textos = await buscarTextosRotos(page);
              for (const t of textos) {
                hallazgos.push({
                  rol: nombre, modulo, subvista: sv.label,
                  tipo: 'texto',
                  detalle: t,
                });
              }

              for (const e of escucha.errores) {
                hallazgos.push({
                  rol: nombre, modulo, subvista: sv.label,
                  tipo: 'consola',
                  detalle: `[${e.type}] ${e.text}`,
                });
              }

              for (const r of escucha.requestsFallidas) {
                hallazgos.push({
                  rol: nombre, modulo, subvista: sv.label,
                  tipo: 'red',
                  detalle: `${r.method} ${r.url} → ${r.status}`,
                });
              }

              await page.screenshot({
                path: `sprint/reportes/img/47-${nombre}-${modulo.replace(/\s/g, '_')}-${sv.label.replace(/\s/g, '_')}.png`,
                fullPage: false,
              });
            }
          });
        }
      }
    }

    // ── Viewport angosto (390px) — solo pantalla principal de cada módulo ─
    test(`[${nombre}] viewport angosto sin desborde horizontal`, async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(500);

      for (const modulo of modulosDeEsteRol) {
        await irA(page, modulo);
        await page.waitForTimeout(800);

        // Verificar que no hay scroll horizontal
        const tieneDesborde = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });

        if (tieneDesborde) {
          hallazgos.push({
            rol: nombre, modulo, subvista: '-',
            tipo: 'desborde',
            detalle: `Desborde horizontal en ${modulo} a 390px`,
          });
        }

        await page.screenshot({
          path: `sprint/reportes/img/47-${nombre}-${modulo.replace(/\s/g, '_')}-angosto.png`,
          fullPage: false,
        });
      }

      // Restaurar viewport
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(500);
    });
  });
}

// ── Reporte final ────────────────────────────────────────────────────────────
test('Resumen de hallazgos', () => {
  if (hallazgos.length > 0) {
    console.log('\n═══ HALLAZGOS DEL BARRIDO GENERAL ═══\n');
    for (const h of hallazgos) {
      console.log(`[${h.tipo}] ${h.rol} · ${h.modulo}${h.subvista !== '-' ? ' → ' + h.subvista : ''}: ${h.detalle}`);
    }
    console.log(`\nTotal: ${hallazgos.length} hallazgos\n`);
  } else {
    console.log('\n✓ Sin hallazgos en el barrido general\n');
  }
  // No fallamos el test — los hallazgos se documentan en BARRIDO-GENERAL.md
});
