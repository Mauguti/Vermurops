/**
 * auditarServiciosPorCotizacion.ts — SOLO LECTURA.
 *
 * Cuántas cotizaciones de producción tienen más de un «servicio» (el
 * contenedor por tipo de transporte que la Fase B va a retirar) y cuántas
 * mezclan tipos. Es el dato que decide si hace falta migración: si toda
 * cotización viva tiene un solo servicio, el modelo nuevo se lee con
 * fallback y no se reescribe nada.
 *
 * Uso:
 *   SERVICE_ACCOUNT=/ruta/serviceAccountKey.json \
 *     npx vite-node scripts/auditarServiciosPorCotizacion.ts
 */

import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { KanbanQuote } from '../src/components/quotes/QuotesData';

async function main() {
  const ruta = process.env.SERVICE_ACCOUNT ?? new URL('../serviceAccountKey.json', import.meta.url);
  let cred;
  try {
    cred = JSON.parse(readFileSync(ruta as string, 'utf8'));
  } catch {
    console.error(`\nNo se encontró la clave de servicio en: ${ruta}\n`);
    process.exit(1);
  }
  initializeApp({ credential: cert(cred) });
  const db = getFirestore();

  const snap = await db.collection('cotizaciones').get();
  const quotes: KanbanQuote[] = [];
  snap.forEach(d => quotes.push({ id: d.id, ...d.data() } as KanbanQuote));

  const porNumero = new Map<number, number>();
  const mezclan: string[] = [];
  const conCarga: number[] = [0, 0];       // [con carga tipada, sin]
  const conLegacy: number[] = [0, 0];      // [con campos E4 (fcl_*, ter_*…), sin]
  const vacias: string[] = [];
  const porEtapa = new Map<string, number>();

  for (const q of quotes) {
    const servicios = q.servicios ?? [];
    porNumero.set(servicios.length, (porNumero.get(servicios.length) ?? 0) + 1);
    porEtapa.set(q.etapa, (porEtapa.get(q.etapa) ?? 0) + 1);
    const tipos = new Set(servicios.map(s => s.tipo));
    if (tipos.size > 1) mezclan.push(`${q.id} (${q.etapa}): ${[...tipos].join(' + ')}`);
    for (const s of servicios) {
      conCarga[s.carga ? 0 : 1]++;
      const legacy = ['tipo_embarque', 'fcl_contenedor', 'fcl_peso', 'lcl_num_pallets', 'ter_unidad', 'ter_peso']
        .some(k => (s as unknown as Record<string, unknown>)[k] !== undefined);
      conLegacy[legacy ? 0 : 1]++;
      for (const c of s.conceptos ?? []) {
        if (!c.nombre?.trim() && !c.conceptoId) vacias.push(`${q.id} (${q.etapa}) · servicio ${s.tipo}`);
      }
    }
  }

  console.log(`\nCotizaciones en producción: ${quotes.length}`);
  console.log('\nPor etapa:');
  [...porEtapa.entries()].sort().forEach(([e, n]) => console.log(`  ${e.padEnd(24)} ${n}`));
  console.log('\nServicios por cotización:');
  [...porNumero.entries()].sort((a, b) => a[0] - b[0]).forEach(([n, c]) => console.log(`  ${n} servicio(s): ${c}`));
  console.log(`\nMezclan tipos de transporte: ${mezclan.length}`);
  mezclan.forEach(m => console.log(`  · ${m}`));
  console.log(`\nServicios con carga tipada: ${conCarga[0]} · sin: ${conCarga[1]}`);
  console.log(`Servicios con campos legacy (E4): ${conLegacy[0]} · sin: ${conLegacy[1]}`);
  console.log(`\nConceptos VACÍOS (sin nombre ni catálogo): ${vacias.length}`);
  vacias.forEach(v => console.log(`  · ${v}`));
  console.log();
}

main().catch(err => { console.error(err); process.exit(1); });
