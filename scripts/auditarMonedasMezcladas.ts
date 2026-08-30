/**
 * auditarMonedasMezcladas.ts
 *
 * SOLO LECTURA. No escribe nada en Firestore.
 *
 * Mide el alcance del segundo hallazgo de E-3: `getCostoOficial` suma los
 * montos de las tarifas oficiales SIN mirar la moneda. Un concepto con una
 * tarifa de 1,000 USD y otra de 5,000 MXN da un costo de 6,000 «de algo», y
 * sobre esa suma sin sentido se calculó la venta y el margen.
 *
 * Viola §4.3 («los totales nunca se mezclan; un total revuelto se ve creíble y
 * es basura»). E-3 lo detecta y avisa, pero no corrige el dato ya cotizado.
 *
 * Uso:
 *   SERVICE_ACCOUNT=/ruta/serviceAccountKey.json \
 *     npx vite-node scripts/auditarMonedasMezcladas.ts
 */

import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { KanbanQuote, getTarifasOficiales } from '../src/components/quotes/QuotesData';

const fmt = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

  console.log(`\nCotizaciones en producción: ${quotes.length}\n`);

  type Hallazgo = {
    folio: string; etapa: string; empresa: string;
    servicioId: string; concepto: string;
    monedas: string[]; desglose: string; sumaCiega: number;
  };

  const hallazgos: Hallazgo[] = [];
  let conceptosRevisados = 0;
  let conMultiTarifa = 0;

  quotes.forEach(q => {
    (q.servicios ?? []).forEach(srv => {
      // Ruta B tiene precedencia y no pasa por getCostoOficial.
      if ((srv.cotizacionesProveedor ?? []).some(cp => cp.seleccionada)) return;

      (srv.conceptos ?? []).forEach(c => {
        conceptosRevisados++;
        const oficiales = getTarifasOficiales(c);
        if (oficiales.length < 2) return;
        conMultiTarifa++;

        const monedas = [...new Set(oficiales.map(t => t.moneda))];
        if (monedas.length < 2) return;

        hallazgos.push({
          folio: q.id,
          etapa: String(q.etapa),
          empresa: q.prospecto?.empresa ?? '—',
          servicioId: srv.id,
          concepto: c.nombre,
          monedas,
          desglose: oficiales.map(t => `${fmt(t.monto)} ${t.moneda}`).join(' + '),
          sumaCiega: oficiales.reduce((a, t) => a + t.monto, 0),
        });
      });
    });
  });

  console.log(`Conceptos revisados: ${conceptosRevisados}`);
  console.log(`Con más de una tarifa oficial: ${conMultiTarifa}`);
  console.log(`Con tarifas en MONEDAS DISTINTAS: ${hallazgos.length}\n`);

  if (hallazgos.length === 0) {
    console.log('Ninguna cotización afectada. El aviso de E-3 entra antes que el caso.\n');
  } else {
    console.log('FOLIO                ETAPA                CONCEPTO                  DESGLOSE                  SUMA CIEGA');
    console.log('─'.repeat(110));
    hallazgos.forEach(h => {
      console.log(
        `${h.folio.padEnd(20)} ${h.etapa.padEnd(20)} ${h.concepto.slice(0, 24).padEnd(25)} ` +
        `${h.desglose.padEnd(25)} ${fmt(h.sumaCiega).padStart(12)}`,
      );
    });
    console.log('\n«Suma ciega» es el costo que la cotización usó: montos de monedas distintas');
    console.log('sumados como si fueran la misma. La venta y el margen se calcularon sobre eso.\n');

    const cerradas = hallazgos.filter(h => ['ganada', 'enviada_cliente', 'negociacion'].includes(h.etapa));
    if (cerradas.length > 0) {
      console.log(`⚠️  ${cerradas.length} están en etapas que el cliente ya vio (ganada / enviada / negociación).`);
      console.log('   Esas no se recalculan solas: son documentos comerciales.\n');
    }
  }

  process.exit(0);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
