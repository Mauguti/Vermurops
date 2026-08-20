/**
 * clasificarBandeja.ts (BP-1)
 *
 * Funciones puras para clasificar cotizaciones de la Bandeja de Pricing
 * en tres bloques de acción: Te toca cotizar, Esperando respuesta, Listas para consolidar.
 */

import type { KanbanQuote, ConceptoCotizacion, PipelineStageId } from '../components/quotes/QuotesData';
import { getOficialIds } from '../components/quotes/QuotesData';
import type { TarifaVermur } from '../components/tarifas/TarifasData';
import { esTarifaVigente } from '../components/tarifas/TarifasData';
import { matchConcept, type ConceptoMatch } from '../components/tarifas/tarifaMatching';

// ─── Progreso de una cotización ──────────────────────────────────────────────

export interface ProgresoCotizacion {
  /** Conceptos con al menos un proveedor oficial asignado. */
  conOficial: number;
  /** Total de conceptos en todos los servicios. */
  total: number;
}

/**
 * Calcula cuántos conceptos tienen proveedor oficial asignado vs. cuántos hay en total.
 * Usa `getOficialIds()` para cubrir backward compat con `proveedorOficialId`.
 */
export function calcularProgreso(quote: KanbanQuote): ProgresoCotizacion {
  let conOficial = 0;
  let total = 0;
  for (const srv of quote.servicios) {
    for (const conc of srv.conceptos || []) {
      total++;
      if (getOficialIds(conc).length > 0) conOficial++;
    }
  }
  return { conOficial, total };
}

// ─── Clasificación en bloques ────────────────────────────────────────────────

export type BloqueBandeja = 'te_toca' | 'esperando' | 'listas';

export interface BandejaClasificada {
  teCotizar: KanbanQuote[];
  esperando: KanbanQuote[];
  listasConsolidar: KanbanQuote[];
}

/** Etapas que la Bandeja de Pricing muestra. */
const ETAPAS_BANDEJA: PipelineStageId[] = [
  'solicitado_pricing',
  'pricing_solicitando',
  'cotizaciones_recibidas',
];

/**
 * ¿El analista aún no ha iniciado trabajo en esta cotización?
 * True si ningún servicio ha sido enviado a proveedores ni cotizado.
 */
function sinTrabajoIniciado(quote: KanbanQuote): boolean {
  return quote.servicios.every(s =>
    s.estado === 'pendiente'
  );
}

/**
 * Clasifica una cotización individual en su bloque.
 * Retorna null si la cotización no pertenece a la bandeja (etapa fuera de scope o consolidada).
 */
export function clasificarCotizacion(quote: KanbanQuote): BloqueBandeja | null {
  if (!ETAPAS_BANDEJA.includes(quote.etapa)) return null;

  const { conOficial, total } = calcularProgreso(quote);

  // Progreso completo → lista para consolidar (independientemente de la etapa)
  if (total > 0 && conOficial === total) return 'listas';

  // Sin trabajo iniciado → te toca cotizar
  if (quote.etapa === 'solicitado_pricing') return 'te_toca';
  if (quote.etapa === 'pricing_solicitando' && sinTrabajoIniciado(quote)) return 'te_toca';

  // El resto → esperando respuesta
  return 'esperando';
}

/**
 * Clasifica todas las cotizaciones en los tres bloques de la bandeja.
 * Cotizaciones fuera de scope (consolidada, enviada_cliente, etc.) se ignoran.
 * Dentro de cada bloque, ordena por antigüedad (más antigua primero).
 */
export function clasificarBandeja(quotes: KanbanQuote[]): BandejaClasificada {
  const result: BandejaClasificada = {
    teCotizar: [],
    esperando: [],
    listasConsolidar: [],
  };

  for (const q of quotes) {
    const bloque = clasificarCotizacion(q);
    if (bloque === 'te_toca') result.teCotizar.push(q);
    else if (bloque === 'esperando') result.esperando.push(q);
    else if (bloque === 'listas') result.listasConsolidar.push(q);
  }

  // Ordenar por antigüedad dentro de cada bloque (más antigua primero)
  const byAge = (a: KanbanQuote, b: KanbanQuote) => a.createdAt.localeCompare(b.createdAt);
  result.teCotizar.sort(byAge);
  result.esperando.sort(byAge);
  result.listasConsolidar.sort(byAge);

  return result;
}

// ─── Días esperando ──────────────────────────────────────────────────────────

/**
 * Calcula los días naturales desde que la cotización entró a etapa de pricing.
 * Usa la fecha de la última transición a una etapa de pricing en historialEtapas.
 * Fallback: usa createdAt si no hay historial.
 */
export function diasEsperando(quote: KanbanQuote, hoy?: string): number {
  const ref = hoy ?? new Date().toISOString().slice(0, 10);

  // Buscar la fecha de entrada a pricing (la más reciente transición a solicitado_pricing)
  let fechaEntrada: string | null = null;
  for (const h of quote.historialEtapas || []) {
    if (h.etapa === 'solicitado_pricing') {
      fechaEntrada = h.fecha;
    }
  }

  const desde = fechaEntrada ?? quote.createdAt.slice(0, 10);
  const msDay = 86_400_000;
  const diff = Math.floor(
    (new Date(ref).getTime() - new Date(desde.slice(0, 10)).getTime()) / msDay
  );
  return Math.max(0, diff);
}

// ─── BP-2: Conteo de tarifas disponibles ─────────────────────────────────────

/**
 * Precuenta tarifas vigentes agrupadas por conceptoId.
 * Se ejecuta una vez por render de la bandeja. O(T) donde T = tarifas activas.
 */
export function buildTarifaCountMap(tarifas: TarifaVermur[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tarifas) {
    if (!esTarifaVigente(t)) continue;
    m.set(t.conceptoId, (m.get(t.conceptoId) || 0) + 1);
  }
  return m;
}

/**
 * Cuenta cuántas tarifas vigentes hacen match con los conceptos de una cotización.
 * Usa matchConcept (ID-first O(1), fallback a nombre) para cada concepto.
 *
 * @param quote          La cotización a evaluar.
 * @param tarifaCountMap Precuenta de tarifas por conceptoId (de buildTarifaCountMap).
 * @param conceptos      Catálogo de conceptos activos.
 * @param conceptoMap    Map para búsqueda O(1) por ID.
 */
export function contarTarifasDisponibles(
  quote: KanbanQuote,
  tarifaCountMap: Map<string, number>,
  conceptos: ConceptoMatch[],
  conceptoMap: Map<string, ConceptoMatch>,
): number {
  let total = 0;
  const seen = new Set<string>(); // Evitar contar el mismo concepto del catálogo dos veces
  for (const srv of quote.servicios) {
    for (const conc of srv.conceptos || []) {
      const { match } = matchConcept(conc.conceptoId, conc.nombre, conceptos, conceptoMap);
      if (match && !seen.has(match.id)) {
        seen.add(match.id);
        total += tarifaCountMap.get(match.id) || 0;
      }
    }
  }
  return total;
}
