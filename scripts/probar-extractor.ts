/**
 * probar-extractor.ts
 *
 * Pasa los fixtures sintéticos (txt, xlsx, png) por el extractor de tarifarios
 * a través del emulador de Functions, y guarda cada respuesta en
 * docs/fixtures/respuestas-extractor/.
 *
 * Prerrequisito: CON_FUNCTIONS=1 ./scripts/dev-emuladores.sh corriendo.
 *
 * Uso: npx tsx scripts/probar-extractor.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES = path.resolve(__dirname, '../docs/fixtures/tarifas-sinteticas');
const OUT = path.resolve(__dirname, '../docs/fixtures/respuestas-extractor');

const AUTH_URL = 'http://127.0.0.1:9099';
const FUNCTIONS_URL = 'http://127.0.0.1:5001/vermur-logistics-app/us-central1/extraerTarifas';
const PROJECT = 'vermur-logistics-app';
const API_KEY = 'fake-api-key'; // emulador acepta cualquier key

interface AuthResponse {
  idToken: string;
  localId: string;
  email: string;
}

async function obtenerToken(): Promise<string> {
  // Autenticarse con pricing@vermur.com (tiene tarifario.cargar)
  const res = await fetch(
    `${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'pricing@vermur.com',
        password: '123456',
        returnSecureToken: true,
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Auth falló: ${res.status} — ${err}`);
  }
  const data = (await res.json()) as AuthResponse;
  console.log(`✓ Autenticado como ${data.email} (uid: ${data.localId})`);
  return data.idToken;
}

const MIME: Record<string, string> = {
  '.txt': 'text/plain',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
};

async function enviarArchivo(
  filePath: string,
  token: string
): Promise<{ status: number; body: unknown; tiempoMs: number }> {
  const nombre = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';

  const blob = new Blob([fs.readFileSync(filePath)], { type: mime });

  const form = new FormData();
  form.append('archivo', blob, nombre);

  const inicio = Date.now();
  const res = await fetch(FUNCTIONS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const tiempoMs = Date.now() - inicio;

  let body: unknown;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }

  return { status: res.status, body, tiempoMs };
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  // Verificar que los emuladores están corriendo
  try {
    await fetch(`${AUTH_URL}`, { signal: AbortSignal.timeout(3000) });
  } catch {
    console.error('✗ El emulador de Auth no responde en :9099. ¿Corre CON_FUNCTIONS=1 ./scripts/dev-emuladores.sh?');
    process.exit(1);
  }
  try {
    await fetch('http://127.0.0.1:5001', { signal: AbortSignal.timeout(3000) });
  } catch {
    console.error('✗ El emulador de Functions no responde en :5001. ¿Corre CON_FUNCTIONS=1 ./scripts/dev-emuladores.sh?');
    process.exit(1);
  }

  const token = await obtenerToken();

  const archivos = ['one-rates.txt', 'one-rates.xlsx', 'one-rates.png'];
  const resultados: Array<{
    archivo: string;
    formato: string;
    status: number;
    tiempoMs: number;
    ok: boolean;
    tarifas: number;
    campos: string[];
    respuesta: unknown;
  }> = [];

  for (const nombre of archivos) {
    const ruta = path.join(FIXTURES, nombre);
    if (!fs.existsSync(ruta)) {
      console.log(`⚠ ${nombre} no existe, saltando`);
      continue;
    }

    console.log(`\n── ${nombre} ──`);
    const { status, body, tiempoMs } = await enviarArchivo(ruta, token);
    console.log(`  status: ${status} (${tiempoMs}ms)`);

    const respBody = body as Record<string, unknown> | null;
    const ok = respBody && typeof respBody === 'object' && (respBody as { ok?: boolean }).ok === true;
    const tarifas = (respBody as { tarifas?: unknown[] })?.tarifas;
    const cuantas = Array.isArray(tarifas) ? tarifas.length : 0;
    const campos = cuantas > 0 && Array.isArray(tarifas) ? Object.keys(tarifas[0] as object) : [];

    console.log(`  ok: ${ok}`);
    console.log(`  tarifas: ${cuantas}`);
    if (cuantas > 0 && Array.isArray(tarifas)) {
      console.log(`  campos: ${campos.join(', ')}`);
      console.log(`  primera:`, JSON.stringify(tarifas[0], null, 2).slice(0, 300));
    }

    // Guardar la respuesta completa — con el formato en el nombre
    const outPath = path.join(OUT, `${path.parse(nombre).name}-${path.extname(nombre).slice(1)}.json`);
    fs.writeFileSync(outPath, JSON.stringify({ status, tiempoMs, body }, null, 2));
    console.log(`  → ${outPath}`);

    resultados.push({
      archivo: nombre,
      formato: path.extname(nombre).slice(1),
      status,
      tiempoMs,
      ok: !!ok,
      tarifas: cuantas,
      campos,
      respuesta: body,
    });
  }

  // Resumen
  console.log('\n\n═══ RESUMEN ═══');
  console.log('Archivo          | Formato | Status | OK    | Tarifas | Tiempo');
  console.log('─────────────────┼─────────┼────────┼───────┼─────────┼───────');
  for (const r of resultados) {
    console.log(
      `${r.archivo.padEnd(17)}| ${r.formato.padEnd(8)}| ${String(r.status).padEnd(7)}| ${String(r.ok).padEnd(6)}| ${String(r.tarifas).padEnd(8)}| ${r.tiempoMs}ms`
    );
  }

  // Guardar resumen
  fs.writeFileSync(path.join(OUT, '_resumen.json'), JSON.stringify(resultados, null, 2));
  console.log(`\nResultados en ${OUT}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
