/**
 * historialCliente.ts
 *
 * Lógica pura para extraer historial y métricas de un cliente
 * recorriendo las cotizaciones en memoria.
 *
 * Más directo que proveedor: KanbanQuote.clienteId es un campo top-level.
 */

import type { KanbanQuote, PipelineStageId } from '../components/quotes/QuotesData';

// ─── Tipos de salida ─────────────────────────────────────────────────────────

export interface RegistroHistorialCliente {
  folio: string;             // KanbanQuote.id
  fecha: string;             // KanbanQuote.createdAt
  etapa: PipelineStageId;
  estadoFinal: 'ganada' | 'perdida' | null;
  totalConsolidado: number;
  moneda: 'MXN' | 'USD';
  servicios: number;         // cantidad de servicios en la cotización
}

export interface TotalesPorMoneda {
  USD: number;
  MXN: number;
}

export interface ResumenCliente {
  totalCotizaciones: number;
  ganadas: number;
  perdidas: number;
  enCurso: number;
  montoGanado: TotalesPorMoneda;   // solo cotizaciones con estadoFinal === 'ganada'
  montoTotal: TotalesPorMoneda;    // todas las cotizaciones (consolidado)
}

// ─── Extracción ──────────────────────────────────────────────────────────────

/**
 * Extrae las cotizaciones de un cliente por clienteId.
 */
export function extraerHistorialCliente(
  quotes: KanbanQuote[],
  clienteId: string,
): RegistroHistorialCliente[] {
  const registros: RegistroHistorialCliente[] = [];

  for (const q of quotes) {
    if (q.clienteId !== clienteId) continue;

    registros.push({
      folio: q.id,
      fecha: q.createdAt,
      etapa: q.etapa,
      estadoFinal: q.estadoFinal,
      totalConsolidado: q.valorTotalConsolidado,
      moneda: q.moneda,
      servicios: (q.servicios ?? []).length,
    });
  }

  // Ordenar por fecha descendente
  registros.sort((a, b) => b.fecha.localeCompare(a.fecha));
  return registros;
}

// ─── Resumen ─────────────────────────────────────────────────────────────────

/**
 * Calcula métricas agregadas del historial de un cliente.
 * Montos separados por moneda.
 */
export function calcularResumenCliente(
  registros: RegistroHistorialCliente[],
): ResumenCliente {
  const montoGanado: TotalesPorMoneda = { USD: 0, MXN: 0 };
  const montoTotal: TotalesPorMoneda = { USD: 0, MXN: 0 };
  let ganadas = 0;
  let perdidas = 0;
  let enCurso = 0;

  for (const r of registros) {
    montoTotal[r.moneda] += r.totalConsolidado;

    if (r.estadoFinal === 'ganada') {
      ganadas++;
      montoGanado[r.moneda] += r.totalConsolidado;
    } else if (r.estadoFinal === 'perdida') {
      perdidas++;
    } else {
      enCurso++;
    }
  }

  // Redondear
  montoGanado.USD = Math.round(montoGanado.USD * 100) / 100;
  montoGanado.MXN = Math.round(montoGanado.MXN * 100) / 100;
  montoTotal.USD = Math.round(montoTotal.USD * 100) / 100;
  montoTotal.MXN = Math.round(montoTotal.MXN * 100) / 100;

  return {
    totalCotizaciones: registros.length,
    ganadas,
    perdidas,
    enCurso,
    montoGanado,
    montoTotal,
  };
}

// ─── Formato ─────────────────────────────────────────────────────────────────

/**
 * Formatea totales por moneda como string legible.
 * Reutiliza la misma lógica que historialProveedor.
 */
export function formatTotalesPorMoneda(t: TotalesPorMoneda): string {
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const parts: string[] = [];
  if (t.USD > 0) parts.push(`USD $${fmt(t.USD)}`);
  if (t.MXN > 0) parts.push(`MXN $${fmt(t.MXN)}`);
  return parts.length > 0 ? parts.join(' · ') : '—';
}
