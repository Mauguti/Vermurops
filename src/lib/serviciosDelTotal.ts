/**
 * serviciosDelTotal.ts
 *
 * De dónde sale el Total Venta Consolidado y qué lo sustenta (Bloque 6,
 * 25-sep-2026).
 *
 * ── El bug ────────────────────────────────────────────────────────────────
 * El pie decía «Basado en 0 servicios con proveedor» junto a un total de
 * $6,100 (COT-2026-0031). Eran DOS cosas a la vez:
 *
 *   1. El texto contaba solo la ruta B —`servicio.cotizacionesProveedor`
 *      con `seleccionada`, la de BandejaPricing— mientras que
 *      `calcularTotalConsolidado` recorre las dos y cae a
 *      `servicio.conceptos`. Una cotización armada desde la ficha sumaba
 *      bien y se contaba en cero. Es la dualidad de §6 asomando en la
 *      interfaz.
 *   2. El total ni siquiera tiene que venir de los servicios: la ficha usa
 *      `quote.valorTotalConsolidado` —un campo GUARDADO— cuando es mayor
 *      que cero, y solo si no, calcula. Tres de las ocho cotizaciones de
 *      ejemplo están así: total guardado de 1,254 / 3,720 / 5,280 con
 *      servicios sin un solo monto capturado.
 *
 * Así que el pie no puede hablar de «servicios con proveedor»: tiene que
 * decir de dónde salió el número que está al lado. Eso es lo que hace.
 */

import type { KanbanQuote, ServicioSolicitado } from '../components/quotes/QuotesData';
import { calcularTotalConsolidado } from '../components/quotes/QuotesData';

/** Los servicios que ponen algo en el total, por cualquiera de las dos rutas. */
export function serviciosQueAportan(servicios: readonly ServicioSolicitado[] = []): ServicioSolicitado[] {
  return servicios.filter(srv => calcularTotalConsolidado([srv]) > 0);
}

export type OrigenDelTotal = 'servicios' | 'guardado' | 'vacio';

/** El mismo criterio que usa la ficha para elegir qué número enseñar. */
export function origenDelTotal(quote: Pick<KanbanQuote, 'valorTotalConsolidado' | 'servicios'>): OrigenDelTotal {
  const derivado = calcularTotalConsolidado(quote.servicios ?? []);
  if ((quote.valorTotalConsolidado ?? 0) > 0) return derivado > 0 ? 'servicios' : 'guardado';
  return derivado > 0 ? 'servicios' : 'vacio';
}

/**
 * El pie del consolidado: de dónde sale el total y qué lo sustenta. Nunca
 * dice «0 servicios» junto a un número distinto de cero sin explicarlo.
 */
export function textoBaseDelTotal(quote: Pick<KanbanQuote, 'valorTotalConsolidado' | 'servicios'>): string {
  const servicios = quote.servicios ?? [];
  const total = servicios.length;
  const n = serviciosQueAportan(servicios).length;

  switch (origenDelTotal(quote)) {
    case 'servicios':
      return `Suma de ${n} de ${total} servicio${total !== 1 ? 's' : ''} con montos capturados`;
    case 'guardado':
      if (total === 0) return 'Total guardado en la cotización; no tiene servicios';
      return total === 1
        ? 'Total guardado en la cotización: su único servicio no tiene montos capturados'
        : `Total guardado en la cotización: sus ${total} servicios no tienen montos capturados`;
    default:
      return total === 0
        ? 'Sin servicios en la cotización'
        : `Ningún servicio tiene montos capturados todavía (${total} en la cotización)`;
  }
}
