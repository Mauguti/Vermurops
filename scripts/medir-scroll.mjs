/**
 * Mide el área con scroll en FichaCotizacion y FichaProspecto
 * a 1440×900 y 1440×700.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:3100';
const IMG_DIR = path.resolve('sprint/reportes/img');
fs.mkdirSync(IMG_DIR, { recursive: true });

async function login(page, email) {
  await page.goto(BASE);
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Iniciar sesión' }).first().click({ timeout: 5000 });
  await page.waitForTimeout(1000);
  await page.getByPlaceholder('usuario@vermur.com').fill(email);
  await page.getByPlaceholder('••••••••').fill('123456');
  await page.locator('#login-submit').click();
  await page.waitForTimeout(5000);
}

async function measureLayout(page, label) {
  const info = await page.evaluate(() => {
    const candidates = document.querySelectorAll('.h-full');
    let fichaLayout = null;
    for (const el of candidates) {
      const cs = getComputedStyle(el);
      if (cs.display === 'flex' && cs.flexDirection === 'column' && el.children.length >= 3) {
        for (const child of el.children) {
          const ccs = getComputedStyle(child);
          if (ccs.overflowY === 'auto' && ccs.flexGrow !== '0') {
            fichaLayout = el;
            break;
          }
        }
      }
    }
    if (!fichaLayout) return { error: 'FichaLayout not found' };

    const viewportH = window.innerHeight;
    const children = Array.from(fichaLayout.children).map(c => {
      const rect = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      return {
        classes: c.className?.substring(0, 120) || c.tagName,
        height: Math.round(rect.height),
        isScrollArea: cs.overflowY === 'auto' && cs.flexGrow !== '0',
        scrollHeight: c.scrollHeight,
      };
    }).filter(c => c.height > 0);

    const scrollArea = children.find(c => c.isScrollArea);
    const fixedHeight = children.filter(c => !c.isScrollArea).reduce((sum, c) => sum + c.height, 0);

    return { viewportH, children, scrollArea: scrollArea ? {
      visibleHeight: scrollArea.height,
      contentHeight: scrollArea.scrollHeight,
      ratio: scrollArea.scrollHeight > 0 ? Math.round(scrollArea.height / scrollArea.scrollHeight * 100) : null,
    } : null, fixedHeight };
  });

  console.log(`\n  ${label}:`);
  if (info.error) { console.log(`    ${info.error}`); return info; }
  console.log(`    Viewport: ${info.viewportH}px`);
  console.log(`    Fixed: ${info.fixedHeight}px`);
  if (info.scrollArea) {
    console.log(`    Scroll: visible=${info.scrollArea.visibleHeight}px content=${info.scrollArea.contentHeight}px (${info.scrollArea.ratio}%)`);
    console.log(`    ${info.scrollArea.visibleHeight < 150 ? '🔴 PROBLEM' : '✅ OK'}`);
  } else {
    console.log(`    ⚠️ No scroll area found`);
  }
  for (const c of info.children) {
    const mark = c.isScrollArea ? ` ← SCROLL (content=${c.scrollHeight}px)` : '';
    console.log(`      h=${c.height}px "${c.classes.substring(0, 90)}"${mark}`);
  }
  return info;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const results = {};

  for (const [w, h] of [[1440, 900], [1440, 700]]) {
    console.log(`\n========== ${w}×${h} ==========`);

    // ── COTIZACIÓN ──
    {
      console.log('\n--- Cotización ---');
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      await login(page, 'pricing@vermur.com');
      await page.getByRole('button', { name: 'CRM' }).first().click();
      await page.waitForTimeout(2000);
      await page.getByText('Cotizaciones', { exact: true }).first().click();
      await page.waitForTimeout(2000);
      let rows = await page.$$('table tbody tr');
      if (rows.length > 0) {
        await rows[0].click();
      } else {
        await page.getByText('Bandeja Pricing').first().click();
        await page.waitForTimeout(1000);
        await page.getByRole('button', { name: 'Abrir' }).first().click({ timeout: 3000 });
      }
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(IMG_DIR, `32-cot-${w}x${h}.png`) });
      results[`cot-${w}x${h}`] = await measureLayout(page, `Cotización ${w}×${h}`);
      await ctx.close();
    }

    // ── PROSPECTO ──
    {
      console.log('\n--- Prospecto ---');
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      await login(page, 'ventas@vermur.com');
      await page.getByRole('button', { name: 'CRM' }).first().click();
      await page.waitForTimeout(2000);

      // Create prospecto
      await page.getByRole('button', { name: 'Nuevo prospecto' }).first().click();
      await page.waitForTimeout(1000);
      await page.getByPlaceholder('Alfa Corporativo S.A.').fill('Empresa Test Scroll');
      await page.getByPlaceholder('Roberto Jiménez').fill('Juan Test');
      await page.getByRole('button', { name: 'Guardar prospecto' }).click();
      await page.waitForTimeout(2000);

      // Click the new prospecto in the table
      const rows = await page.$$('table tbody tr');
      console.log(`  Found ${rows.length} prospecto rows`);
      if (rows.length > 0) {
        await rows[0].click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(IMG_DIR, `32-prosp-${w}x${h}.png`) });
        results[`prosp-${w}x${h}`] = await measureLayout(page, `Prospecto ${w}×${h}`);
      } else {
        console.log('  No rows after creation');
        await page.screenshot({ path: path.join(IMG_DIR, `32-prosp-debug-${w}x${h}.png`) });
      }
      await ctx.close();
    }
  }

  console.log('\n\n========== SUMMARY ==========');
  for (const [key, data] of Object.entries(results)) {
    if (data?.scrollArea) {
      console.log(`${key}: scroll=${data.scrollArea.visibleHeight}px / content=${data.scrollArea.contentHeight}px (${data.scrollArea.ratio}%), fixed=${data.fixedHeight}px`);
    } else {
      console.log(`${key}: ${data?.error || 'no data'}`);
    }
  }

  await browser.close();
}

run().catch(e => { console.error(e); process.exit(1); });
