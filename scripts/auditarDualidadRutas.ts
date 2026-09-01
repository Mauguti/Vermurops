/**
 * auditarDualidadRutas.ts
 *
 * SOLO LECTURA. No escribe nada en Firestore.
 *
 * Paso 0 de la unificación de la dualidad de §6: medir cuántas cotizaciones
 * VIVAS dependen de la ruta B (`servicio.cotizacionesProveedor`) antes de
 * decidir cómo migrarlas a la ruta A (`concepto.tarifas`).
 *
 * Clasifica cada cotización:
 *
 *   A_pura   — todos sus costos viven en concepto.tarifas. La unificación no
 *              la toca: ya está en el formato destino.
 *   B_pura   — todos sus costos viven en servicio.cotizacionesProveedor.
 *              Migración completa.
 *   mixta    — costos en los dos niveles. El caso delicado: la precedencia de
 *              calcularTotalConsolidado (B cortocircuita conceptos) decide qué
 *              cuenta hoy, y la migración tiene que reproducir EXACTAMENTE ese
 *              resultado o el total cambia.
 *   sin_costos — nada en ninguna ruta.
 *
 * Para cada una imprime además si el total ACTUAL coincidiría tras aplanar,
 * que es la invariante de la migración: mismo total antes y después, centavo
 * por centavo.
 *
 * Uso:
 *   SERVICE_ACCOUNT=/ruta/serviceAccountKey.json \
 *     npx vite-node scripts/auditarDualidadRutas.ts
 */

import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  KanbanQuote, ServicioSolicitado, calcularTotalConsolidado,
} from '../src/components/quotes/QuotesData';
import { aplanarCotizacion, totalVenta, estaCongelada } from '../src/lib/lineasCotizacion';

type Clase = 'A_pura' | 'B_pura' | 'mixta' | 'sin_costos';

function claseDe(servicios: ServicioSolicitado[]): Clase {
  const tieneB = servicios.some(s => (s.cotizacionesProveedor ?? []).length > 0);
  const tieneA = servicios.some(s =>
    (s.conceptos ?? []).some(c => (c.tarifas ?? []).length > 0 || (c.subconceptos ?? []).length > 0
      || c.costoCapturado || (c.costo ?? 0) > 0));
  if (tieneA && tieneB) return 'mixta';
  if (tieneB) return 'B_pura';
  if (tieneA) return 'A_pura';
  return 'sin_costos';
}

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

  const conteo: Record<Clase, number> = { A_pura: 0, B_pura: 0, mixta: 0, sin_costos: 0 };
  const detalle: { clase: Clase; linea: string }[] = [];

  const ETAPAS_VIVAS = new Set([
    'solicitud_cliente', 'solicitado_pricing', 'pricing_solicitando',
    'cotizaciones_recibidas', 'consolidada', 'enviada_cliente', 'negociacion',
  ]);

  let vivas = 0;

  quotes.forEach(q => {
    const clase = claseDe(q.servicios ?? []);
    conteo[clase]++;

    const viva = ETAPAS_VIVAS.has(q.etapa);
    if (viva) vivas++;

    if (clase === 'B_pura' || clase === 'mixta') {
      // La invariante de la migración: el total no puede moverse ni un centavo.
      const totalActual = calcularTotalConsolidado(q.servicios ?? []);
      const totalPlano = totalVenta(aplanarCotizacion(q));
      const cuadra = Math.abs(totalActual - totalPlano) < 0.01;

      detalle.push({
        clase,
        linea: [
          `  ${q.id}`,
          `etapa=${q.etapa}${viva ? ' ⚡VIVA' : ''}${estaCongelada(q) ? ' 🧊congelada' : ''}`,
          `clase=${clase}`,
          `total=${totalActual.toLocaleString('es-MX')}`,
          cuadra ? 'plano=✓cuadra' : `plano=✗DIFIERE (${totalPlano.toLocaleString('es-MX')})`,
        ].join(' · '),
      });
    }
  });

  console.log(`\n§6 · Dualidad de CotizacionProveedor — alcance real\n`);
  console.log(`Cotizaciones en producción: ${quotes.length} (${vivas} en etapa viva)\n`);
  (Object.keys(conteo) as Clase[]).forEach(c =>
    console.log(`  ${c.padEnd(10)} ${conteo[c]}`));

  if (detalle.length > 0) {
    console.log(`\nLas que la migración toca (${detalle.length}):\n`);
    detalle.forEach(d => console.log(d.linea));
    console.log(`
Leyenda:
  ⚡VIVA      en una etapa activa del pipeline: migrarla afecta trabajo en curso
  🧊congelada ya generó embarque: sus totales alimentaron cargos reales
  plano=✗    el total consolidado NO coincide con la vista plana — revisar a
             mano ANTES de migrar, la precedencia hace algo inesperado ahí
`);
  } else {
    console.log('\nNinguna cotización usa la ruta B: la migración es solo borrar código.\n');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
