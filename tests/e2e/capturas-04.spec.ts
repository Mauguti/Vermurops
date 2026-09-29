/**
 * capturas-04.spec.ts — capturas de la tarea 04: renombrar «consolidada»
 */
import { test, expect, type Browser, type Page, type BrowserContext } from '@playwright/test';

const IMG = 'sprint/reportes/img';
const PW = '123456';

async function entrar(browser: Browser, email: string, width = 1440): Promise<{ page: Page; ctx: BrowserContext }> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click();
  await page.getByPlaceholder('usuario@vermur.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(PW);
  await page.locator('#login-submit').click();
  await expect(page.getByText('Emuladores · producción intacta')).toBeVisible({ timeout: 15_000 });
  return { page, ctx };
}

test('04 · capturas', async ({ browser }) => {
  // ── Pricing: bandeja ──
  const { page: pp, ctx: pc } = await entrar(browser, 'pricing@vermur.com');
  // Use the desktop sidebar button (inside the first nav, inside a ul > li > button)
  await pp.locator('ul button:has-text("CRM")').first().click();
  await pp.waitForTimeout(3000);
  await pp.screenshot({ path: `${IMG}/04-bandeja-pricing.png`, fullPage: false });

  // Abrir una cotización
  const card = pp.locator('[class*="cursor-pointer"]').first();
  if (await card.isVisible({ timeout: 3000 }).catch(() => false)) {
    await card.click();
    await pp.waitForTimeout(2000);
    await pp.screenshot({ path: `${IMG}/04-franja-pricing.png`, fullPage: false });
  }
  await pc.close();

  // ── Ventas: Kanban ──
  const { page: vp, ctx: vc } = await entrar(browser, 'ventas@vermur.com');
  await vp.locator('ul button:has-text("CRM")').first().click();
  await vp.waitForTimeout(3000);
  await vp.screenshot({ path: `${IMG}/04-kanban-ventas.png`, fullPage: false });

  // Angosto
  await vp.setViewportSize({ width: 375, height: 812 });
  await vp.waitForTimeout(500);
  await vp.screenshot({ path: `${IMG}/04-kanban-ventas-movil.png`, fullPage: false });
  await vc.close();
});
