/**
 * capturas-71.spec.ts — el registro de la corrección en el expediente del
 * proveedor.
 *
 * La 63 dejó ese registro en el cliente y en la orden de compra; en el
 * proveedor se perdía porque `ArchivoExpediente` no tenía dónde. Lo que se
 * comprueba aquí es que, con el campo `clasificacion` guardado, la casilla lo
 * ENSEÑA: la confianza del clasificador y la nota de quién corrigió el tipo.
 *
 * La clasificación en sí no se prueba aquí (exige n8n real, igual que en la
 * 63): el documento se siembra por REST con lo que el clasificador habría
 * dejado. Lo que redacta la nota está cubierto por
 * `lib/loteDocumentos.test.ts` (clasificacionDeLinea).
 *
 * Requiere emuladores + app en :3100 arriba: `KEEP=1 ./scripts/e2e.sh`.
 */

import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const FS = 'http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents';
const PW = '123456';
const IMG = 'sprint/reportes/img';

/** Un proveedor nacional y activo del seed: su checklist es el de cuatro. */
const PRV = { id: 'PRV-0011', nombre: 'TRANSPORTES ROADLINE' };

const s = (stringValue: string) => ({ stringValue });
const b = (booleanValue: boolean) => ({ booleanValue });

/** Lo que `guardarLoteExpediente` escribe al confirmar un lote. */
function archivo(nombre: string, clasificacion: Record<string, unknown>) {
  return {
    mapValue: {
      fields: {
        storagePath: s(`expedientes/${PRV.id}/${nombre}`),
        url: s('https://example.com/doc.pdf'),
        nombre: s(nombre),
        subidoPor: s('administracion@vermur.com'),
        fecha: s('2026-10-05T18:30:00.000Z'),
        clasificacion: { mapValue: { fields: clasificacion } },
      },
    },
  };
}

/**
 * Siembra dos documentos en el expediente: uno con el tipo corregido a mano
 * (el caso de Gaby, «puse la constancia en el acta») y uno que el agente
 * acertó. Se escribe con updateMask para no pisar el resto del proveedor.
 */
async function sembrarExpediente() {
  const mask = ['docsAlta', 'archivosExpediente']
    .map(f => `updateMask.fieldPaths=${f}`)
    .join('&');
  const r = await fetch(`${FS}/proveedores/${PRV.id}?${mask}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({
      fields: {
        docsAlta: {
          mapValue: {
            fields: {
              acta: b(false), poder: b(false), identificacion: b(false),
              csf: b(true), comprobante: b(false), bancaria: b(true),
            },
          },
        },
        archivosExpediente: {
          mapValue: {
            fields: {
              // El agente la leyó como acta constitutiva y Administración la
              // corrigió: eso es lo que hasta hoy se perdía.
              csf: archivo('constancia-escaneada.pdf', {
                tipoCrudo: s('acta_constitutiva'),
                confianza: s('media'),
                observaciones: s(
                  'Sello del SAT parcialmente cortado · Tipo corregido a mano a '
                  + '«Constancia de Situación Fiscal» por administracion@vermur.com '
                  + 'el 2026-10-05: el clasificador lo leyó como «Acta constitutiva».',
                ),
              }),
              bancaria: archivo('caratula-bbva.pdf', { confianza: s('alta') }),
            },
          },
        },
      },
    }),
  });
  expect(r.ok).toBe(true);
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

/** Altas → Proveedores → buscar → abrir la ficha → pestaña Expediente. */
async function abrirExpediente(page: Page) {
  await page.getByRole('button', { name: 'Altas', exact: true }).first().click();
  await page.locator('button').filter({ hasText: 'Proveedores' }).first().click();
  await page.locator('input[placeholder*="Buscar"]').first().fill(PRV.nombre);
  await page.waitForTimeout(600);
  await page.getByText(PRV.nombre).first().click();
  await page.getByRole('button', { name: /Expediente/ }).first().click();
  // El checklist vive abajo de la validación: sin esto la captura sale del
  // encabezado de la ficha y no se ve lo que la tarea cambió.
  await page.getByText('Documentos de alta').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
}

test('proveedor · la casilla enseña quién corrigió el tipo y la confianza', async ({ browser }) => {
  await sembrarExpediente();
  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirExpediente(page);

  // El documento corregido dice las dos cosas: qué leyó el agente y qué
  // decidió la persona.
  await expect(page.getByText(/Tipo corregido a mano a «Constancia de Situación Fiscal»/))
    .toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/el clasificador lo leyó como «Acta constitutiva»/)).toBeVisible();
  // La observación del agente no se pierde al agregarse la corrección.
  await expect(page.getByText(/Sello del SAT parcialmente cortado/)).toBeVisible();
  // La confianza va junto a la fecha y el autor, en las dos casillas.
  await expect(page.getByText(/confianza media/)).toBeVisible();
  await expect(page.getByText(/confianza alta/)).toBeVisible();

  await page.screenshot({ path: `${IMG}/71-proveedor-expediente.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText('Documentos de alta').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await expect(page.getByText(/Tipo corregido a mano/)).toBeVisible();
  await page.screenshot({ path: `${IMG}/71-proveedor-expediente-390.png` });
  await ctx.close();
});

test('proveedor · un archivo sin clasificación se lee igual que siempre', async ({ browser }) => {
  // Legado: los archivos subidos antes de hoy no traen `clasificacion`. La
  // casilla no debe inventar nada ni romperse.
  const mask = 'updateMask.fieldPaths=archivosExpediente';
  const r = await fetch(`${FS}/proveedores/${PRV.id}?${mask}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({
      fields: {
        archivosExpediente: {
          mapValue: {
            fields: {
              csf: {
                mapValue: {
                  fields: {
                    storagePath: s(`expedientes/${PRV.id}/vieja.pdf`),
                    url: s('https://example.com/vieja.pdf'),
                    nombre: s('constancia-vieja.pdf'),
                    subidoPor: s('administracion@vermur.com'),
                    fecha: s('2026-09-20T10:00:00.000Z'),
                  },
                },
              },
            },
          },
        },
      },
    }),
  });
  expect(r.ok).toBe(true);

  const { page, ctx } = await entrar(browser, 'administracion@vermur.com');
  await abrirExpediente(page);

  await expect(page.getByText('constancia-vieja.pdf')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/confianza/)).toHaveCount(0);
  await expect(page.getByText(/Tipo corregido a mano/)).toHaveCount(0);

  await page.screenshot({ path: `${IMG}/71-proveedor-expediente-legado.png` });
  await ctx.close();
});
