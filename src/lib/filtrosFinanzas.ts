/**
 * filtrosFinanzas.ts
 *
 * Los filtros de las dos pantallas de Finanzas —Cuentas por pagar y Cuentas
 * por cobrar— en el mismo formato plano (`Record<string, string | null>`) que
 * los de Embarques, para poder guardarse DENTRO de una vista de usuario sin
 * serializar nada.
 *
 * Por qué importa guardarlos: lo que Julio abre cada mañana no es «la tabla
 * de órdenes», es «lo autorizado en pesos que todavía no se paga». Eso son
 * tres clics, y una vista con nombre los convierte en uno.
 *
 * Un valor desconocido guardado en una vista se DESCARTA al leerla, en vez de
 * dejar la lista vacía sin explicación.
 *
 * Sin React, sin Firestore.
 */

import type { OrdenCompra, EstadoOC } from '../components/ordenesCompra/OrdenesCompraData';
import type { EtiquetaIVA } from './ivaOrdenCompra';
import type { EstadoCobro, FacturaEnCartera } from './cuentasPorCobrar';
import { contiene } from './texto';
import { esPrefactura, pendienteDeFactura } from './prefactura';

// ═══════════════════════════════════════════════════════════════════════════
// Cuentas por pagar
// ═══════════════════════════════════════════════════════════════════════════

const ESTADOS_OC_VALIDOS: EstadoOC[] = ['solicitada', 'en_gestion', 'autorizada', 'pagada', 'rechazada'];
const ETIQUETAS_IVA_VALIDAS = ['ok', 'alerta', 'pendiente'];

export interface FiltrosPorPagar {
  /** Estado de la orden. '' = todos. */
  estado: EstadoOC | '';
  /** Tarea 36 · Cotejo del IVA de la factura del proveedor. '' = todos. */
  iva: NonNullable<EtiquetaIVA> | '';
  /** Flag «No pagar» (§4.7). 'si' = solo las marcadas, 'no' = solo las libres. */
  noPagar: 'si' | 'no' | '';
  /** De dónde nació la orden. '' = las dos. */
  origen: 'embarque' | 'oficina' | '';
  moneda: 'USD' | 'MXN' | '';
  /** Tarea 74 · Prefacturas: 'marcadas' = las declaradas, 'pendientes' = pagadas y sin factura. */
  prefactura: 'marcadas' | 'pendientes' | '';
  /** Folio, proveedor, concepto, cliente, embarque o número de factura. */
  busqueda: string;
}

export const FILTROS_POR_PAGAR_VACIOS: FiltrosPorPagar = {
  estado: '', iva: '', noPagar: '', origen: '', moneda: '', prefactura: '', busqueda: '',
};

export interface ContextoPorPagar {
  /** Etiqueta de IVA de una orden; la resuelve la pantalla con el catálogo
   *  de conceptos. Sin ella el filtro de IVA no filtra nada. */
  etiquetaIVA?: (oc: OrdenCompra) => EtiquetaIVA;
}

export function aplicarFiltrosPorPagar(
  ordenes: readonly OrdenCompra[],
  f: FiltrosPorPagar,
  ctx: ContextoPorPagar = {},
): OrdenCompra[] {
  const q = f.busqueda.trim();
  return ordenes.filter(oc => {
    if (f.estado && oc.estado !== f.estado) return false;
    if (f.iva) {
      if (!ctx.etiquetaIVA) return false;
      if (ctx.etiquetaIVA(oc) !== f.iva) return false;
    }
    // Ausente = no marcada: el flag solo se escribe al detener un pago.
    if (f.noPagar === 'si' && !oc.noPagar) return false;
    if (f.noPagar === 'no' && oc.noPagar) return false;
    if (f.origen && oc.origen !== f.origen) return false;
    if (f.moneda && oc.moneda !== f.moneda) return false;
    if (f.prefactura === 'marcadas' && !esPrefactura(oc)) return false;
    if (f.prefactura === 'pendientes' && !pendienteDeFactura(oc)) return false;
    if (q) {
      const texto = [
        oc.folio, oc.proveedorNombre, oc.conceptoNombre, oc.clienteNombre,
        oc.embarqueFolio, oc.facturaAsociada, oc.facturaDatos?.numero,
      ].filter(Boolean).join(' ');
      if (!contiene(texto, q)) return false;
    }
    return true;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Cuentas por cobrar
// ═══════════════════════════════════════════════════════════════════════════

const ESTADOS_COBRO_VALIDOS: EstadoCobro[] = ['por_cobrar', 'por_vencer', 'vencido', 'cobrado'];

/** 'abiertas' es el default de la pantalla: todo lo que no está cobrado. */
export type FiltroEstadoCobro = 'abiertas' | 'todas' | EstadoCobro;

export interface FiltrosPorCobrar {
  estado: FiltroEstadoCobro;
  /** Id del cliente. '' = todos. */
  clienteId: string;
  moneda: 'USD' | 'MXN' | '';
  /** Mes de vencimiento, YYYY-MM. '' = todos. */
  mesVencimiento: string;
  /** Factura, cliente o embarque. */
  busqueda: string;
}

export const FILTROS_POR_COBRAR_VACIOS: FiltrosPorCobrar = {
  estado: 'abiertas', clienteId: '', moneda: '', mesVencimiento: '', busqueda: '',
};

export function aplicarFiltrosPorCobrar(
  items: readonly FacturaEnCartera[],
  f: FiltrosPorCobrar,
): FacturaEnCartera[] {
  const q = f.busqueda.trim();
  return items.filter(i => {
    if (f.estado === 'abiertas') { if (i.estado === 'cobrado') return false; }
    else if (f.estado !== 'todas' && i.estado !== f.estado) return false;
    if (f.clienteId && i.factura.clienteId !== f.clienteId) return false;
    if (f.moneda && i.factura.moneda !== f.moneda) return false;
    if (f.mesVencimiento && (i.factura.fechaVencimiento ?? '').slice(0, 7) !== f.mesVencimiento) return false;
    if (q && !contiene(
      `${i.factura.numero} ${i.factura.clienteNombre} ${i.factura.embarqueFolio}`, q,
    )) return false;
    return true;
  });
}

/** Los meses de vencimiento que existen, para no ofrecer meses vacíos. */
export function mesesDeVencimiento(items: readonly FacturaEnCartera[]): string[] {
  const meses = new Set<string>();
  items.forEach(i => {
    const m = (i.factura.fechaVencimiento ?? '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(m)) meses.add(m);
  });
  return [...meses].sort().reverse();
}

// ═══════════════════════════════════════════════════════════════════════════
// Ida y vuelta con la vista guardada
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cuántos filtros están activos frente al default de la pantalla. Se compara
 * contra el default, no contra «vacío»: en Cuentas por cobrar «Abiertas» es
 * el default, así que no cuenta como filtro puesto.
 */
function activos<F extends object>(f: F, vacios: F): number {
  const a = f as Record<string, string>;
  const b = vacios as Record<string, string>;
  return Object.keys(b).filter(k => String(a[k] ?? '').trim() !== '' && a[k] !== b[k]).length;
}

export const filtrosPorPagarActivos = (f: FiltrosPorPagar) => activos(f, FILTROS_POR_PAGAR_VACIOS);
export const filtrosPorCobrarActivos = (f: FiltrosPorCobrar) => activos(f, FILTROS_POR_COBRAR_VACIOS);

/** Lo que se guarda en la vista: solo lo que se desvía del default. */
function paraVista<F extends object>(f: F, vacios: F): Record<string, string | null> {
  const a = f as Record<string, string>;
  const b = vacios as Record<string, string>;
  const out: Record<string, string | null> = {};
  for (const k of Object.keys(b)) {
    if (a[k] && a[k] !== b[k]) out[k] = a[k];
  }
  return out;
}

export const filtrosPorPagarParaVista = (f: FiltrosPorPagar) => paraVista(f, FILTROS_POR_PAGAR_VACIOS);
export const filtrosPorCobrarParaVista = (f: FiltrosPorCobrar) => paraVista(f, FILTROS_POR_COBRAR_VACIOS);

/** De la vista a filtros válidos. Lo desconocido se descarta. */
export function filtrosPorPagarDesdeVista(
  guardados: Record<string, string | null> | undefined,
): FiltrosPorPagar {
  const f: FiltrosPorPagar = { ...FILTROS_POR_PAGAR_VACIOS };
  if (!guardados) return f;
  for (const k of Object.keys(FILTROS_POR_PAGAR_VACIOS) as (keyof FiltrosPorPagar)[]) {
    const v = guardados[k];
    if (typeof v === 'string') (f as unknown as Record<string, string>)[k] = v;
  }
  if (!ESTADOS_OC_VALIDOS.includes(f.estado as EstadoOC)) f.estado = '';
  if (!ETIQUETAS_IVA_VALIDAS.includes(f.iva)) f.iva = '';
  if (f.noPagar !== 'si' && f.noPagar !== 'no') f.noPagar = '';
  if (f.origen !== 'embarque' && f.origen !== 'oficina') f.origen = '';
  if (f.moneda !== 'USD' && f.moneda !== 'MXN') f.moneda = '';
  if (f.prefactura !== 'marcadas' && f.prefactura !== 'pendientes') f.prefactura = '';
  return f;
}

export function filtrosPorCobrarDesdeVista(
  guardados: Record<string, string | null> | undefined,
): FiltrosPorCobrar {
  const f: FiltrosPorCobrar = { ...FILTROS_POR_COBRAR_VACIOS };
  if (!guardados) return f;
  for (const k of Object.keys(FILTROS_POR_COBRAR_VACIOS) as (keyof FiltrosPorCobrar)[]) {
    const v = guardados[k];
    if (typeof v === 'string') (f as unknown as Record<string, string>)[k] = v;
  }
  if (f.estado !== 'abiertas' && f.estado !== 'todas'
      && !ESTADOS_COBRO_VALIDOS.includes(f.estado as EstadoCobro)) {
    f.estado = 'abiertas';
  }
  if (f.moneda !== 'USD' && f.moneda !== 'MXN') f.moneda = '';
  if (!/^\d{4}-\d{2}$/.test(f.mesVencimiento)) f.mesVencimiento = '';
  return f;
}
