/**
 * prefactura.ts (tarea 74 · P7 · PLAN-PAGOS §5)
 *
 * «Las navieras cobran antes de facturar.» Una prefactura es una orden de
 * compra que Operaciones DECLARA como pagadera antes de tener la factura del
 * proveedor. Lo único que se guarda son `esPrefactura` y `motivoPrefactura`;
 * todo lo demás se deriva de lo que ya existe:
 *
 *   marcada, sin pagar              → «Prefactura»
 *   marcada, pagada, sin factura    → «Factura pendiente · N días»
 *   marcada, pagada, con factura    → «Factura recibida»
 *   sin marcar, pagada, sin factura → NO es prefactura (es otra cosa)
 *
 * La marca se guarda en vez de derivarse de «pagada y sin factura» porque
 * declarar que se paga antes de facturar es una decisión de Operaciones, no
 * una conclusión del sistema: sin ella el contador contaría toda orden pagada
 * a la que todavía no le subieron el PDF, y a los dos días nadie lo lee.
 *
 * No toca la máquina de estados: pagar una prefactura ya era posible.
 */

import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import { identificarFactura } from './facturasProveedor';

export type EstadoPrefactura =
  | 'no_aplica'       // no está marcada
  | 'por_pagar'       // marcada, todavía no se paga
  | 'factura_pendiente'
  | 'factura_recibida';

const MS_DIA = 24 * 60 * 60 * 1000;

export const esPrefactura = (oc: Pick<OrdenCompra, 'esPrefactura'>): boolean =>
  oc.esPrefactura === true;

/** ¿Ya tiene factura del proveedor, por cualquiera de las tres vías? */
export const tieneFactura = (oc: OrdenCompra): boolean =>
  identificarFactura(oc).fuente !== 'sin_factura';

/** Una orden dada de baja o rechazada no existió: no es un pendiente. */
const viva = (oc: OrdenCompra) => oc.activo !== false && oc.estado !== 'rechazada';

export function pendienteDeFactura(oc: OrdenCompra): boolean {
  return viva(oc) && esPrefactura(oc) && oc.estado === 'pagada' && !tieneFactura(oc);
}

/**
 * Días desde que se pagó. `null` si no se pagó o la fecha no se puede leer;
 * nunca negativo (un reloj adelantado no debe pintar «-2 días»).
 */
export function diasSinFactura(oc: OrdenCompra, hoy: Date = new Date()): number | null {
  if (!pendienteDeFactura(oc)) return null;
  const fecha = oc.pagadaPor?.fecha ? Date.parse(oc.pagadaPor.fecha) : NaN;
  if (Number.isNaN(fecha)) return null;
  return Math.max(0, Math.floor((hoy.getTime() - fecha) / MS_DIA));
}

export function estadoPrefactura(oc: OrdenCompra): EstadoPrefactura {
  if (!esPrefactura(oc)) return 'no_aplica';
  if (oc.estado !== 'pagada') return 'por_pagar';
  return tieneFactura(oc) ? 'factura_recibida' : 'factura_pendiente';
}

export interface ResumenPrefacturas {
  pendientes: number;
  /** Días de la más vieja; null si ninguna tiene fecha legible. */
  masVieja: number | null;
}

export function resumenPrefacturas(ordenes: readonly OrdenCompra[], hoy: Date = new Date()): ResumenPrefacturas {
  const pend = ordenes.filter(pendienteDeFactura);
  const dias = pend.map(oc => diasSinFactura(oc, hoy)).filter((d): d is number => d !== null);
  return { pendientes: pend.length, masVieja: dias.length ? Math.max(...dias) : null };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «Factura pendiente · 12 días» (sin días si la fecha no se pudo leer). */
export function textoFacturaPendiente(oc: OrdenCompra, hoy: Date = new Date()): string {
  const d = diasSinFactura(oc, hoy);
  return d === null ? 'Factura pendiente' : `Factura pendiente · ${plural(d, 'día', 'días')}`;
}

/** Texto del contador del encabezado; null si no hay nada que avisar. */
export function textoContadorPrefacturas(r: ResumenPrefacturas): string | null {
  if (r.pendientes === 0) return null;
  const base = `${plural(r.pendientes, 'prefactura pagada sin factura', 'prefacturas pagadas sin factura')}`;
  return r.masVieja === null ? base : `${base} · la más vieja de ${plural(r.masVieja, 'día', 'días')}`;
}

/** El motivo es libre y opcional: vacío o solo espacios se guarda como null. */
export function motivoPrefacturaParaGuardar(valor: string | null | undefined): string | null {
  const t = (valor ?? '').trim();
  return t === '' ? null : t;
}
