/**
 * auditarCotizacionesVivas.ts — SOLO LECTURA
 *
 * Audita las cotizaciones vivas (ni ganadas ni perdidas) buscando cuatro
 * problemas que afectan la integridad de los costos:
 *
 *   1. `proveedoresOficialIds` desincronizado de `tarifas[].seleccionada`
 *   2. Líneas con costo capturado a mano sin moneda explícita (se rotulan
 *      USD por defecto en lineasCotizacion.ts:215/243)
 *   3. Líneas sin `conceptoId` (texto libre, sin catálogo)
 *   4. Tarifa oficial cuya modalidad no coincide con la del servicio
 *
 * NO hace set, update, delete, add ni batch. Solo get().
 *
 * Uso:
 *   SERVICE_ACCOUNT=/ruta/serviceAccountKey.json \
 *     npx tsx scripts/auditarCotizacionesVivas.ts
 *
 * Contra emuladores:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     npx tsx scripts/auditarCotizacionesVivas.ts
 */

import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  KanbanQuote,
  ConceptoCotizacion,
  CotizacionProveedor,
  ServicioSolicitado,
  getOficialIds,
  getTarifasOficiales,
} from '../src/components/quotes/QuotesData';

// ─── Tipos del reporte ────────────────────────────────────────────────────────

interface HallazgoDesinc {
  tipo: 'desincronizado';
  folio: string;
  empresa: string;
  servicioTipo: string;
  concepto: string;
  oficialIds: string[];
  seleccionadasIds: string[];
  detalle: string;
}

interface HallazgoSinMoneda {
  tipo: 'sin_moneda';
  folio: string;
  empresa: string;
  servicioTipo: string;
  concepto: string;
  costo: number;
}

interface HallazgoSinConcepto {
  tipo: 'sin_conceptoId';
  folio: string;
  empresa: string;
  servicioTipo: string;
  concepto: string;
}

interface HallazgoModalidad {
  tipo: 'modalidad_distinta';
  folio: string;
  empresa: string;
  servicioTipo: string;
  concepto: string;
  modalidadServicio: string;
  modalidadTarifa: string;
  proveedor: string;
}

type Hallazgo = HallazgoDesinc | HallazgoSinMoneda | HallazgoSinConcepto | HallazgoModalidad;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function empresa(q: KanbanQuote): string {
  return q.prospecto?.empresa ?? '(sin empresa)';
}

/**
 * Detecta desincronización entre proveedoresOficialIds y tarifas[].seleccionada.
 *
 * elegirCelda y elegirColumna (seleccionMatriz.ts) escriben los dos a la vez.
 * Pero elegirAgente (ComparativaPricing.tsx) y ConceptoSection.tsx pueden
 * escribir uno sin el otro. El resultado: la comparativa dice una cosa y la
 * tabla otra.
 */
function detectarDesinc(c: ConceptoCotizacion): string | null {
  const oficialIds = new Set(getOficialIds(c));
  const seleccionadasIds = new Set(
    (c.tarifas ?? []).filter(t => t.seleccionada).map(t => t.id),
  );

  // Mismo conjunto → sincronizado
  if (oficialIds.size === seleccionadasIds.size) {
    let iguales = true;
    oficialIds.forEach(id => { if (!seleccionadasIds.has(id)) iguales = false; });
    if (iguales) return null;
  }

  // Ambos vacíos → no hay selección, no es hallazgo
  if (oficialIds.size === 0 && seleccionadasIds.size === 0) return null;

  const soloEnOficial = [...oficialIds].filter(id => !seleccionadasIds.has(id));
  const soloEnSeleccionada = [...seleccionadasIds].filter(id => !oficialIds.has(id));

  const partes: string[] = [];
  if (soloEnOficial.length > 0) {
    partes.push(`en oficialIds pero no seleccionada: ${soloEnOficial.join(', ')}`);
  }
  if (soloEnSeleccionada.length > 0) {
    partes.push(`seleccionada pero no en oficialIds: ${soloEnSeleccionada.join(', ')}`);
  }
  return partes.join(' · ');
}

/**
 * ¿Este concepto tiene un costo capturado a mano sin moneda explícita?
 *
 * El fallback en lineasCotizacion.ts (líneas 215 y 243) asigna 'USD' cuando
 * no hay tarifas oficiales. Si el costo real era MXN, queda rotulado mal.
 */
function esCostoSinMoneda(c: ConceptoCotizacion): boolean {
  const oficiales = getTarifasOficiales(c);
  const subs = c.subconceptos ?? [];

  // Si tiene tarifas oficiales o subconceptos, la moneda viene de ellos
  if (oficiales.length > 0 || subs.length > 0) return false;

  // Costo manual > 0 sin fuente de moneda
  const costoManual = c.costo ?? 0;
  if (costoManual <= 0) return false;

  // El concepto no tiene ningún campo de moneda propio: el adaptador
  // plano le asigna 'USD' por defecto. Esto es hallazgo.
  return true;
}

/**
 * ¿La modalidad de la tarifa oficial coincide con la del servicio?
 *
 * La tarifa puede traer `modalidad` (desde que se captura en la comparativa o
 * se arrastra del catálogo). Si no la trae, no se puede comparar.
 */
function detectarModalidadDistinta(
  srv: ServicioSolicitado,
  c: ConceptoCotizacion,
): { tarifa: CotizacionProveedor; modalidadTarifa: string }[] {
  const tipoServicio = srv.tipo;
  if (!tipoServicio) return [];

  const oficiales = getTarifasOficiales(c);
  const resultado: { tarifa: CotizacionProveedor; modalidadTarifa: string }[] = [];

  oficiales.forEach(t => {
    if (!t.modalidad) return; // sin dato, no se puede comparar
    if (t.modalidad !== tipoServicio) {
      resultado.push({ tarifa: t, modalidadTarifa: t.modalidad });
    }
  });

  return resultado;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── Conexión ────────────────────────────────────────────────────────────────
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(`\n⚠️  Leyendo del EMULADOR (${process.env.FIRESTORE_EMULATOR_HOST}), no de producción.`);
    initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'vermur-logistics-app' });
  } else {
    const ruta = process.env.SERVICE_ACCOUNT ?? new URL('../serviceAccountKey.json', import.meta.url);
    let cred;
    try {
      cred = JSON.parse(readFileSync(ruta as string, 'utf8'));
    } catch {
      console.error(`\nNo se encontró la clave de servicio en: ${ruta}\n`);
      console.error('Uso: SERVICE_ACCOUNT=/ruta/serviceAccountKey.json npx tsx scripts/auditarCotizacionesVivas.ts\n');
      process.exit(1);
    }
    initializeApp({ credential: cert(cred) });
  }
  const db = getFirestore();

  // ── Lectura ─────────────────────────────────────────────────────────────────
  const snap = await db.collection('cotizaciones').get();
  const todas: KanbanQuote[] = [];
  snap.forEach(d => todas.push({ id: d.id, ...d.data() } as KanbanQuote));

  // Solo las vivas: ni ganadas ni perdidas
  const vivas = todas.filter(q => q.etapa !== 'ganada' && q.etapa !== 'perdida');

  console.log(`\nCotizaciones en la base: ${todas.length}`);
  console.log(`Cotizaciones vivas (ni ganadas ni perdidas): ${vivas.length}\n`);

  // ── Auditoría ───────────────────────────────────────────────────────────────
  const hallazgos: Hallazgo[] = [];
  let conceptosRevisados = 0;

  vivas.forEach(q => {
    (q.servicios ?? []).forEach(srv => {
      // Ruta B (BandejaPricing) tiene precedencia y no tiene conceptos
      // detallados con tarifas: se salta
      if ((srv.cotizacionesProveedor ?? []).some(cp => cp.seleccionada)) {
        // Aun así, revisar conceptos sin conceptoId en la ruta B
        (srv.conceptos ?? []).forEach(c => {
          conceptosRevisados++;
          if (c.nombre?.trim() && !c.conceptoId) {
            hallazgos.push({
              tipo: 'sin_conceptoId',
              folio: q.id,
              empresa: empresa(q),
              servicioTipo: srv.tipo ?? '—',
              concepto: c.nombre,
            });
          }
        });
        return;
      }

      (srv.conceptos ?? []).forEach(c => {
        conceptosRevisados++;

        // 1. Desincronización oficialIds vs seleccionada
        const desinc = detectarDesinc(c);
        if (desinc) {
          hallazgos.push({
            tipo: 'desincronizado',
            folio: q.id,
            empresa: empresa(q),
            servicioTipo: srv.tipo ?? '—',
            concepto: c.nombre,
            oficialIds: getOficialIds(c),
            seleccionadasIds: (c.tarifas ?? []).filter(t => t.seleccionada).map(t => t.id),
            detalle: desinc,
          });
        }

        // 2. Costo manual sin moneda explícita
        if (esCostoSinMoneda(c)) {
          hallazgos.push({
            tipo: 'sin_moneda',
            folio: q.id,
            empresa: empresa(q),
            servicioTipo: srv.tipo ?? '—',
            concepto: c.nombre,
            costo: c.costo ?? 0,
          });
        }

        // 3. Sin conceptoId
        if (c.nombre?.trim() && !c.conceptoId) {
          hallazgos.push({
            tipo: 'sin_conceptoId',
            folio: q.id,
            empresa: empresa(q),
            servicioTipo: srv.tipo ?? '—',
            concepto: c.nombre,
          });
        }

        // 4. Modalidad de tarifa oficial distinta a la del servicio
        const mismatch = detectarModalidadDistinta(srv, c);
        mismatch.forEach(({ tarifa, modalidadTarifa }) => {
          hallazgos.push({
            tipo: 'modalidad_distinta',
            folio: q.id,
            empresa: empresa(q),
            servicioTipo: srv.tipo ?? '—',
            concepto: c.nombre,
            modalidadServicio: srv.tipo ?? '—',
            modalidadTarifa,
            proveedor: tarifa.proveedor ?? '—',
          });
        });
      });
    });
  });

  // ── Reporte ─────────────────────────────────────────────────────────────────

  console.log(`Conceptos revisados: ${conceptosRevisados}`);
  console.log(`Hallazgos totales: ${hallazgos.length}\n`);

  // Agrupar por tipo
  const desincronizados = hallazgos.filter(h => h.tipo === 'desincronizado') as HallazgoDesinc[];
  const sinMoneda = hallazgos.filter(h => h.tipo === 'sin_moneda') as HallazgoSinMoneda[];
  const sinConcepto = hallazgos.filter(h => h.tipo === 'sin_conceptoId') as HallazgoSinConcepto[];
  const modalidadDistinta = hallazgos.filter(h => h.tipo === 'modalidad_distinta') as HallazgoModalidad[];

  // ── 1. Desincronización ──────────────────────────────────────────────────

  console.log('═'.repeat(90));
  console.log(`  1. proveedoresOficialIds ≠ tarifas[].seleccionada: ${desincronizados.length}`);
  console.log('═'.repeat(90));

  if (desincronizados.length > 0) {
    console.log('');
    console.log(
      'FOLIO'.padEnd(22) +
      'EMPRESA'.padEnd(22) +
      'SERVICIO'.padEnd(12) +
      'CONCEPTO',
    );
    console.log('─'.repeat(90));
    desincronizados.forEach(h => {
      console.log(
        `${h.folio.padEnd(22)}${h.empresa.slice(0, 20).padEnd(22)}` +
        `${h.servicioTipo.padEnd(12)}${h.concepto.slice(0, 30)}`,
      );
      console.log(`  → ${h.detalle}`);
    });
    console.log('');
    console.log('  Causa probable: elegirAgente escribe proveedoresOficialIds;');
    console.log('  ConceptoSection escribe seleccionada. No siempre coinciden.');
    console.log('  Efecto: la comparativa dice un proveedor y la tabla otro.\n');
  } else {
    console.log('  Ninguna.\n');
  }

  // ── 2. Costo manual sin moneda ──────────────────────────────────────────

  console.log('═'.repeat(90));
  console.log(`  2. Costo capturado a mano sin moneda explícita (rotulado USD): ${sinMoneda.length}`);
  console.log('═'.repeat(90));

  if (sinMoneda.length > 0) {
    console.log('');
    console.log(
      'FOLIO'.padEnd(22) +
      'EMPRESA'.padEnd(22) +
      'SERVICIO'.padEnd(12) +
      'CONCEPTO'.padEnd(26) +
      'COSTO'.padStart(12),
    );
    console.log('─'.repeat(90));
    sinMoneda.forEach(h => {
      console.log(
        `${h.folio.padEnd(22)}${h.empresa.slice(0, 20).padEnd(22)}` +
        `${h.servicioTipo.padEnd(12)}${h.concepto.slice(0, 24).padEnd(26)}` +
        `${fmt(h.costo).padStart(12)}`,
      );
    });
    console.log('');
    console.log('  Estos costos no tienen tarifa ni subconcepto. El adaptador plano');
    console.log('  (lineasCotizacion.ts:215/243) les asigna USD por defecto.');
    console.log('  Si el costo real era MXN, el desglose está mal.\n');
  } else {
    console.log('  Ninguna.\n');
  }

  // ── 3. Sin conceptoId ──────────────────────────────────────────────────

  console.log('═'.repeat(90));
  console.log(`  3. Líneas sin conceptoId (fuera del catálogo): ${sinConcepto.length}`);
  console.log('═'.repeat(90));

  if (sinConcepto.length > 0) {
    console.log('');
    console.log(
      'FOLIO'.padEnd(22) +
      'EMPRESA'.padEnd(22) +
      'SERVICIO'.padEnd(12) +
      'CONCEPTO',
    );
    console.log('─'.repeat(90));
    sinConcepto.forEach(h => {
      console.log(
        `${h.folio.padEnd(22)}${h.empresa.slice(0, 20).padEnd(22)}` +
        `${h.servicioTipo.padEnd(12)}${h.concepto}`,
      );
    });
    console.log('');
    console.log('  Sin conceptoId, el impuesto sale «Sin determinar» y no hace match');
    console.log('  en la regla de IVA. El concepto existe como texto libre.\n');
  } else {
    console.log('  Ninguna.\n');
  }

  // ── 4. Modalidad distinta ──────────────────────────────────────────────

  console.log('═'.repeat(90));
  console.log(`  4. Tarifa oficial con modalidad distinta a la del servicio: ${modalidadDistinta.length}`);
  console.log('═'.repeat(90));

  if (modalidadDistinta.length > 0) {
    console.log('');
    console.log(
      'FOLIO'.padEnd(22) +
      'CONCEPTO'.padEnd(24) +
      'PROVEEDOR'.padEnd(22) +
      'SERVICIO'.padEnd(12) +
      'TARIFA',
    );
    console.log('─'.repeat(90));
    modalidadDistinta.forEach(h => {
      console.log(
        `${h.folio.padEnd(22)}${h.concepto.slice(0, 22).padEnd(24)}` +
        `${h.proveedor.slice(0, 20).padEnd(22)}` +
        `${h.modalidadServicio.padEnd(12)}${h.modalidadTarifa}`,
      );
    });
    console.log('');
    console.log('  Una tarifa marítima en un servicio terrestre indica una');
    console.log('  confusión en la captura o al arrastrar tarifas.\n');
  } else {
    console.log('  Ninguna.\n');
  }

  // ── Resumen ─────────────────────────────────────────────────────────────

  console.log('═'.repeat(90));
  console.log('  RESUMEN');
  console.log('═'.repeat(90));

  const foliosAfectados = new Set(hallazgos.map(h => h.folio));

  console.log(`  Cotizaciones vivas revisadas:          ${vivas.length}`);
  console.log(`  Conceptos revisados:                   ${conceptosRevisados}`);
  console.log(`  Cotizaciones con al menos un hallazgo: ${foliosAfectados.size}`);
  console.log('');
  console.log(`  1. Desincronización oficialIds/seleccionada: ${desincronizados.length}`);
  console.log(`  2. Costo manual sin moneda (rotulado USD):   ${sinMoneda.length}`);
  console.log(`  3. Líneas sin conceptoId:                    ${sinConcepto.length}`);
  console.log(`  4. Modalidad tarifa ≠ servicio:              ${modalidadDistinta.length}`);
  console.log(`  ─────────────────────────────────────────────`);
  console.log(`  Total hallazgos:                             ${hallazgos.length}`);
  console.log('');

  if (foliosAfectados.size > 0) {
    console.log('  Folios afectados:');
    [...foliosAfectados].sort().forEach(f => console.log(`    ${f}`));
    console.log('');
  }

  process.exit(hallazgos.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\nFalló la auditoría:', err.message ?? err);
  process.exit(1);
});
