/**
 * Genera los fixtures sintéticos para pruebas del extractor de tarifarios.
 *
 * - one-rates.xlsx: tabla con las tarifas de ONE
 * - one-rates.png: captura de la tabla renderizada en HTML con Playwright
 *
 * Uso: npx tsx scripts/generar-fixtures-tarifas.ts
 */

import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT = path.resolve(__dirname, '../docs/fixtures/tarifas-sinteticas');
const require = createRequire(import.meta.url);

// ── XLSX con tabla ──────────────────────────────────────────────────────
async function generarXlsx() {
  const XLSX = require('xlsx');

  const data = [
    ['Carrier', 'POL', 'POD', "20'GP (USD)", "40'GP (USD)", "40'HQ (USD)", 'Free Time', 'Validity'],
    ['ONE', 'Shenzhen', 'Manzanillo', 4300, 4400, 4400, '21 days', 'Till July 31'],
    ['ONE', 'Ningbo', 'Manzanillo', 4300, 4400, 4400, '21 days', 'Till July 31'],
    ['ONE', 'Shanghai', 'Manzanillo', 4300, 4400, 4400, '21 days', 'Till July 31'],
    ['ONE', 'Qingdao', 'Manzanillo', 4300, 4400, 4400, '21 days', 'Till July 31'],
    ['ONE', 'Xiamen', 'Manzanillo', 4300, 4400, 4400, '21 days', 'Till July 31'],
    ['ONE', 'Dalian', 'Manzanillo', 4300, 4400, 4400, '21 days', 'Till July 31'],
    ['ONE', 'Shenzhen', 'Lazaro Cardenas', 4300, 4400, 4400, '21 days', 'Till July 31'],
    ['ONE', 'Ningbo', 'Lazaro Cardenas', 4300, 4400, 4400, '21 days', 'Till July 31'],
    ['ONE', 'Shanghai', 'Lazaro Cardenas', 4300, 4400, 4400, '21 days', 'Till July 31'],
    ['ONE', 'Qingdao', 'Lazaro Cardenas', 4300, 4400, 4400, '21 days', 'Till July 31'],
    ['ONE', 'Xiamen', 'Lazaro Cardenas', 4300, 4400, 4400, '21 days', 'Till July 31'],
    ['ONE', 'Dalian', 'Lazaro Cardenas', 4300, 4400, 4400, '21 days', 'Till July 31'],
    [],
    ['Subject to:'],
    ['AMS', 'USD 30/bill'],
    ['Telex Release', 'USD 50/bill'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rates');
  const outPath = path.join(OUT, 'one-rates.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`✓ xlsx: ${outPath}`);
}

// ── PNG con Playwright ──────────────────────────────────────────────────
async function generarPng() {
  const html = `<!DOCTYPE html>
<html><head><style>
  body { font-family: Arial, sans-serif; padding: 20px; background: #fff; }
  h2 { margin-bottom: 8px; }
  table { border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #999; padding: 6px 10px; text-align: center; }
  th { background: #2b579a; color: white; }
  .notes { margin-top: 12px; font-size: 12px; color: #333; }
</style></head><body>
<h2>ONE — Ocean Rates to Mexico</h2>
<p>Rates valid till July 31 &nbsp;|&nbsp; Free time: 21 days</p>
<table>
  <tr><th>POL</th><th>POD</th><th>20'GP</th><th>40'GP</th><th>40'HQ</th></tr>
  <tr><td>Shenzhen</td><td>Manzanillo</td><td>USD 4,300</td><td>USD 4,400</td><td>USD 4,400</td></tr>
  <tr><td>Ningbo</td><td>Manzanillo</td><td>USD 4,300</td><td>USD 4,400</td><td>USD 4,400</td></tr>
  <tr><td>Shanghai</td><td>Manzanillo</td><td>USD 4,300</td><td>USD 4,400</td><td>USD 4,400</td></tr>
  <tr><td>Qingdao</td><td>Manzanillo</td><td>USD 4,300</td><td>USD 4,400</td><td>USD 4,400</td></tr>
  <tr><td>Xiamen</td><td>Manzanillo</td><td>USD 4,300</td><td>USD 4,400</td><td>USD 4,400</td></tr>
  <tr><td>Dalian</td><td>Manzanillo</td><td>USD 4,300</td><td>USD 4,400</td><td>USD 4,400</td></tr>
  <tr><td>Shenzhen</td><td>Lazaro Cardenas</td><td>USD 4,300</td><td>USD 4,400</td><td>USD 4,400</td></tr>
  <tr><td>Ningbo</td><td>Lazaro Cardenas</td><td>USD 4,300</td><td>USD 4,400</td><td>USD 4,400</td></tr>
  <tr><td>Shanghai</td><td>Lazaro Cardenas</td><td>USD 4,300</td><td>USD 4,400</td><td>USD 4,400</td></tr>
  <tr><td>Qingdao</td><td>Lazaro Cardenas</td><td>USD 4,300</td><td>USD 4,400</td><td>USD 4,400</td></tr>
  <tr><td>Xiamen</td><td>Lazaro Cardenas</td><td>USD 4,300</td><td>USD 4,400</td><td>USD 4,400</td></tr>
  <tr><td>Dalian</td><td>Lazaro Cardenas</td><td>USD 4,300</td><td>USD 4,400</td><td>USD 4,400</td></tr>
</table>
<div class="notes">
  <p>Subject to: AMS USD 30/bill, Telex release USD 50/bill</p>
  <p>Carrier: ONE (Ocean Network Express)</p>
</div>
</body></html>`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.setContent(html);
  const outPath = path.join(OUT, 'one-rates.png');
  await page.screenshot({ path: outPath, fullPage: true });
  await browser.close();
  console.log(`✓ png: ${outPath}`);
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  // xlsx necesita la dependencia
  try {
    require.resolve('xlsx');
  } catch {
    console.log('Instalando xlsx temporalmente…');
    execSync('npm install --no-save xlsx', { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });
  }

  await generarXlsx();
  await generarPng();
  console.log('\nFixtures listos en', OUT);
}

main().catch(e => { console.error(e); process.exit(1); });
