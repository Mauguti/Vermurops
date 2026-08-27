/**
 * historialProveedor.ts
 *
 * Lógica pura para extraer historial y métricas de un proveedor
 * recorriendo las cotizaciones en memoria.
 *
 * quotes → servicios → conceptos → tarifas  (CotizacionProveedor con proveedorId)
 * quotes → servicios → cotizacionesProveedor (vista plana, deduplicada por id)
 *
 * Soporta fallback por nombre normalizado para CotizacionProveedor legacy sin proveedorId.
 */

import type { KanbanQuote, CotizacionProveedor, PipelineStageId } from '../components/quotes/QuotesData';

// ─── Utilidad de normalización ──────────────────────────────────────────────

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// ─── Tipos de salida ─────────────────────────────────────────────────────────

export interface RegistroHistorialProveedor {
  folio: string;            // KanbanQuote.id  (ej. "COT-2026-0042")
  fecha: string;            // KanbanQuote.createdAt
  etapa: PipelineStageId;   // etapa actual de la cotización
  concepto: string;         // ConceptoCotizacion.nombre
  monto: number;
  moneda: 'MXN' | 'USD';
  seleccionada: boolean;
  estadoRespuesta: CotizacionProveedor['estadoRespuesta'];
}

export interface TotalesPorMoneda {
  USD: number;
  MXN: number;
}

export interface ResumenProveedor {
  totalCotizado: TotalesPorMoneda;
  cotizacionesAtendidas: number;   // estadoRespuesta === 'recibida'
  cotizacionesTotal: number;       // todas las CotizacionProveedor de este proveedor
  vecesSeleccionado: number;       // seleccionada === true
  cotizacionesUnicas: number;      // cuántas KanbanQuote distintas participó
}

// ─── Extracción ──────────────────────────────────────────────────────────────

/**
 * Extrae todos los registros de CotizacionProveedor de un proveedor
 * recorriendo:
 *   1. quotes → servicios → conceptos → tarifas  (vista detallada)
 *   2. quotes → servicios → cotizacionesProveedor (vista plana)
 *
 * Deduplica por CotizacionProveedor.id para evitar doble conteo cuando
 * la misma tarifa aparece en ambos niveles.
 *
 * Soporta fallback por nombre normalizado: si una CotizacionProveedor no
 * tiene `proveedorId`, se compara `normalize(tarifa.proveedor)` contra
 * `normalize(proveedorNombre)`.
 */
export function extraerHistorialProveedor(
  quotes: KanbanQuote[],
  proveedorId: string,
  proveedorNombre?: string,
): RegistroHistorialProveedor[] {
  const registros: RegistroHistorialProveedor[] = [];
  const seenIds = new Set<string>();

  const matches = (tarifa: CotizacionProveedor): boolean =>
    tarifa.proveedorId === proveedorId ||
    (!tarifa.proveedorId && !!proveedorNombre && normalize(tarifa.proveedor) === normalize(proveedorNombre));

  for (const q of quotes) {
    for (const srv of q.servicios ?? []) {
      // 1. Vista detallada: conceptos → tarifas
      for (const concepto of srv.conceptos ?? []) {
        for (const tarifa of concepto.tarifas ?? []) {
          if (matches(tarifa) && !seenIds.has(tarifa.id)) {
            seenIds.add(tarifa.id);
            registros.push({
              folio: q.id,
              fecha: q.createdAt,
              etapa: q.etapa,
              concepto: concepto.nombre,
              monto: tarifa.monto,
              moneda: tarifa.moneda,
              seleccionada: tarifa.seleccionada,
              estadoRespuesta: tarifa.estadoRespuesta,
            });
          }
        }
      }

      // 2. Vista plana: servicio.cotizacionesProveedor
      for (const tarifa of srv.cotizacionesProveedor ?? []) {
        if (matches(tarifa) && !seenIds.has(tarifa.id)) {
          seenIds.add(tarifa.id);
          registros.push({
            folio: q.id,
            fecha: q.createdAt,
            etapa: q.etapa,
            concepto: `(servicio ${srv.tipo})`,
            monto: tarifa.monto,
            moneda: tarifa.moneda,
            seleccionada: tarifa.seleccionada,
            estadoRespuesta: tarifa.estadoRespuesta,
          });
        }
      }
    }
  }

  // Ordenar por fecha descendente (más reciente primero)
  registros.sort((a, b) => b.fecha.localeCompare(a.fecha));
  return registros;
}

// ─── Resumen ─────────────────────────────────────────────────────────────────

/**
 * Calcula métricas agregadas del historial de un proveedor.
 * Totales separados por moneda (nunca mezcla USD + MXN).
 */
export function calcularResumenProveedor(
  registros: RegistroHistorialProveedor[],
): ResumenProveedor {
  const totalCotizado: TotalesPorMoneda = { USD: 0, MXN: 0 };
  let cotizacionesAtendidas = 0;
  let vecesSeleccionado = 0;
  const foliosUnicos = new Set<string>();

  for (const r of registros) {
    totalCotizado[r.moneda] += r.monto;
    if (r.estadoRespuesta === 'recibida') cotizacionesAtendidas++;
    if (r.seleccionada) vecesSeleccionado++;
    foliosUnicos.add(r.folio);
  }

  // Redondear a 2 decimales
  totalCotizado.USD = Math.round(totalCotizado.USD * 100) / 100;
  totalCotizado.MXN = Math.round(totalCotizado.MXN * 100) / 100;

  return {
    totalCotizado,
    cotizacionesAtendidas,
    cotizacionesTotal: registros.length,
    vecesSeleccionado,
    cotizacionesUnicas: foliosUnicos.size,
  };
}

// ─── Formato ─────────────────────────────────────────────────────────────────

/**
 * Formatea totales por moneda como string legible.
 * Ej: "USD $12,400 · MXN $85,000" o "USD $12,400" si solo hay una moneda.
 * Devuelve "—" si ambos son 0.
 */
export function formatTotalesPorMoneda(t: TotalesPorMoneda): string {
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const parts: string[] = [];
  if (t.USD > 0) parts.push(`USD $${fmt(t.USD)}`);
  if (t.MXN > 0) parts.push(`MXN $${fmt(t.MXN)}`);
  return parts.length > 0 ? parts.join(' · ') : '—';
}
