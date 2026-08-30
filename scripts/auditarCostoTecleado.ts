/**
 * auditarCostoTecleado.ts
 *
 * SOLO LECTURA. No escribe absolutamente nada en Firestore.
 *
 * Mide el alcance del bug que destaparon los tests de FC-1:
 * `calcularTotalConsolidado` ignoraba el campo `costo` capturado a mano, así
 * que un concepto tecleado sin tarifas aportaba su profit al total de la
 * cotización pero NO su costo. Total de menos y margen inflado.
 *
 * Importa las funciones REALES del código en vez de reimplementar las
 * fórmulas: si el script y la app calcularan distinto, la medición no serviría.
 *
 * Uso:
 *   1. Firebase Console → Configuración del proyecto → Cuentas de servicio
 *      → «Generar nueva clave privada». Guardar como serviceAccountKey.json
 *      en la raíz del repo (ya está en .gitignore).
 *   2. npx vite-node scripts/auditarCostoTecleado.ts
 */

import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  KanbanQuote,
  ConceptoCotizacion,
  getCostoOficial,
  calcularTotalConsolidado,
} from '../src/components/quotes/QuotesData';
import { calcLinea } from '../src/lib/cotizacionCalculator';

// ─── Cálculo VIEJO, tal como estaba antes del arreglo ────────────────────────
// Se conserva aquí para poder comparar contra el nuevo. No usar en la app.
function totalConsolidadoViejo(servicios: KanbanQuote['servicios']): number {
  let total = 0;
  for (const srv of servicios ?? []) {
    const flat = (srv.cotizacionesProveedor ?? []).find(cp => cp.seleccionada);
    if (flat) {
      total += calcLinea(flat.monto, srv.profit).venta;
      continue;
    }
    for (const c of srv.conceptos ?? []) {
      const oficial = getCostoOficial(c);
      const subs = c.subconceptos?.reduce((a, s) => a + s.costo, 0) ?? 0;
      total += calcLinea(oficial + subs, c.profit).venta; // ← ignoraba c.costo
    }
  }
  return Math.round(total * 100) / 100;
}

/** ¿El concepto depende del costo tecleado, o sea que el bug lo afectaba? */
function esConceptoTecleado(c: ConceptoCotizacion): boolean {
  const oficial = getCostoOficial(c);
  const subs = c.subconceptos?.reduce((a, s) => a + s.costo, 0) ?? 0;
  return oficial === 0 && subs === 0 && (c.costo ?? 0) > 0;
}

const fmt = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const cred = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url), 'utf8'));
  initializeApp({ credential: cert(cred) });
  const db = getFirestore();

  const snap = await db.collection('cotizaciones').get();
  const quotes: KanbanQuote[] = [];
  snap.forEach(d => quotes.push({ id: d.id, ...d.data() } as KanbanQuote));

  console.log(`\nCotizaciones en producción: ${quotes.length}\n`);

  const afectadas = quotes
    .map(q => {
      const tecleados = (q.servicios ?? []).flatMap(srv => {
        // Ruta B tiene precedencia: sus conceptos ni se miran.
        if ((srv.cotizacionesProveedor ?? []).some(cp => cp.seleccionada)) return [];
        return (srv.conceptos ?? []).filter(esConceptoTecleado);
      });
      if (tecleados.length === 0) return null;

      const viejo = totalConsolidadoViejo(q.servicios);
      const nuevo = calcularTotalConsolidado(q.servicios);
      const guardado = q.valorTotalConsolidado ?? 0;

      // El campo guardado tiene precedencia cuando es > 0; solo cuando es 0 o
      // falta, la pantalla depende de la función y por tanto del bug.
      const dependeDeLaFuncion = !(guardado > 0);

      const costoOculto = tecleados.reduce((a, c) => a + (c.costo ?? 0), 0);
      const profitTecleado = tecleados.reduce((a, c) => a + (c.profit ?? 0), 0);
      const margenViejo = viejo > 0 ? profitTecleado / viejo : 0;
      const margenNuevo = nuevo > 0 ? profitTecleado / nuevo : 0;

      return {
        id: q.id, etapa: q.etapa, empresa: q.prospecto?.empresa ?? '—',
        conceptos: tecleados.length, costoOculto,
        viejo, nuevo, guardado, dependeDeLaFuncion,
        margenViejo, margenNuevo,
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  // ── 1 ──
  console.log('1 · Cotizaciones con conceptos de costo tecleado y sin tarifas');
  console.log(`   ${afectadas.length} de ${quotes.length}\n`);

  // ── 2 ──
  const dependientes = afectadas.filter(a => a.dependeDeLaFuncion);
  console.log('2 · De esas, cuántas dependen de la función (valorTotalConsolidado en 0 o ausente)');
  console.log(`   ${dependientes.length} de ${afectadas.length}\n`);

  // ── 3 ──
  console.log('3 · Total mostrado vs. total correcto\n');
  if (afectadas.length === 0) {
    console.log('   Ninguna cotización afectada.\n');
  } else {
    console.log('   FOLIO                ETAPA                MOSTRABA        CORRECTO      DIFERENCIA   MARGEN');
    console.log('   ' + '─'.repeat(96));
    afectadas
      .sort((a, b) => (b.nuevo - b.viejo) - (a.nuevo - a.viejo))
      .forEach(a => {
        const mostraba = a.dependeDeLaFuncion ? a.viejo : a.guardado;
        const dif = a.nuevo - mostraba;
        const marca = a.dependeDeLaFuncion ? ' ←' : '  ';
        console.log(
          `   ${a.id.padEnd(20)} ${String(a.etapa).padEnd(20)} ` +
          `${fmt(mostraba).padStart(12)} ${fmt(a.nuevo).padStart(13)} ` +
          `${fmt(dif).padStart(13)}   ${(a.margenViejo * 100).toFixed(1)}% → ${(a.margenNuevo * 100).toFixed(1)}%${marca}`,
        );
      });
    console.log('\n   ← = la pantalla dependía de la función, así que mostraba el número equivocado.');

    const totalOculto = dependientes.reduce((s, a) => s + (a.nuevo - a.viejo), 0);
    console.log(`\n   Costo que no se estaba contando en las dependientes: ${fmt(totalOculto)}`);
  }

  // ── Contexto ──
  const sinGuardado = quotes.filter(q => !(q.valorTotalConsolidado > 0)).length;
  console.log(`\nContexto: ${sinGuardado} de ${quotes.length} cotizaciones tienen`);
  console.log('valorTotalConsolidado en 0 o ausente y dependen de la función.\n');

  process.exit(0);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
