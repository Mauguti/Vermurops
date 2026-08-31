/**
 * cuentasPorPagar.ts
 *
 * C-1. Qué debe Vermur, leído desde las órdenes de compra.
 *
 * ── Por qué una OC autorizada ES una cuenta por pagar ──────────────────────
 * Decisión del cliente: las órdenes de compra no son un módulo aparte de las
 * cuentas por pagar; son lo mismo visto en dos momentos. Tener dos pantallas
 * mostrando el mismo dinero es la forma más segura de que digan cosas
 * distintas.
 *
 * El estado es lo que separa una cosa de la otra:
 *
 *   solicitada · en gestión → una SOLICITUD en curso. Todavía no se debe:
 *                             nadie ha autorizado el pago y puede rechazarse.
 *   autorizada             → cuenta por pagar EN FIRME. Esto es lo que se
 *                             debe y lo que alimenta el KPI.
 *   pagada                 → histórico.
 *   rechazada              → no existió.
 *
 * Lógica pura: sin React ni Firestore.
 */

import type { EstadoOC, OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import { sumarPorMoneda, monedasConMonto, Moneda } from './sumarPorMoneda';

/** @deprecated Usa `Moneda` de sumarPorMoneda. Se conserva por los imports. */
export type MonedaOC = Moneda;

const MONEDAS: Moneda[] = ['USD', 'MXN'];
const redondear = (n: number) => Math.round(n * 100) / 100;

export interface TotalesPorPagar {
  /** Autorizadas: lo que se debe en firme, por moneda. */
  enFirme: Record<Moneda, number>;
  /** Solicitadas y en gestión: todavía no es deuda, pero viene. */
  enCurso: Record<Moneda, number>;
  /** Ya pagadas, por moneda. Histórico. */
  pagado: Record<Moneda, number>;
  /** Monedas con algún movimiento en firme o en curso, en orden estable. */
  monedasActivas: Moneda[];
}

/** ¿Este estado cuenta como deuda en firme? */
export function esCuentaPorPagar(estado: EstadoOC): boolean {
  return estado === 'autorizada';
}

/** ¿Todavía es una solicitud, no una deuda? */
export function esSolicitudEnCurso(estado: EstadoOC): boolean {
  return estado === 'solicitada' || estado === 'en_gestion';
}

/**
 * Totales por moneda. NUNCA se suman entre sí ni se convierten: §4.3.
 *
 * Las OC inactivas (baja lógica) no cuentan. Una moneda desconocida se ignora
 * en vez de caer en USD por defecto: inventar la moneda de un pago es peor que
 * dejarlo fuera del total, porque el total seguiría viéndose correcto.
 */
export function totalesPorPagar(ordenes: OrdenCompra[]): TotalesPorPagar {
  const vivas = ordenes.filter(oc => oc.activo !== false);
  const de = (predicado: (oc: OrdenCompra) => boolean) =>
    sumarPorMoneda(vivas.filter(predicado), oc => oc.monto, oc => oc.moneda);

  const enFirme = de(oc => esCuentaPorPagar(oc.estado));
  const enCurso = de(oc => esSolicitudEnCurso(oc.estado));
  const pagado  = de(oc => oc.estado === 'pagada');
  // La rechazada no cae en ningún grupo: no existió.

  return {
    enFirme,
    enCurso,
    pagado,
    monedasActivas: MONEDAS.filter(
      m => monedasConMonto(enFirme).includes(m) || monedasConMonto(enCurso).includes(m),
    ),
  };
}

/**
 * Lo que vence a cada proveedor, en firme y por moneda.
 *
 * Base del panel de Administración (C-8) y del agrupado de pagos: a un
 * proveedor se le paga junto, con el comprobante detallando folios.
 */
export function porPagarPorProveedor(
  ordenes: OrdenCompra[],
): { proveedorId: string; proveedorNombre: string; moneda: Moneda; monto: number; folios: string[] }[] {
  const mapa = new Map<string, { proveedorId: string; proveedorNombre: string; moneda: Moneda; monto: number; folios: string[] }>();

  ordenes.forEach(oc => {
    if (oc.activo === false || !esCuentaPorPagar(oc.estado)) return;
    if (!MONEDAS.includes(oc.moneda as Moneda)) return;
    const clave = `${oc.proveedorId}::${oc.moneda}`;
    const actual = mapa.get(clave) ?? {
      proveedorId: oc.proveedorId,
      proveedorNombre: oc.proveedorNombre,
      moneda: oc.moneda as Moneda,
      monto: 0,
      folios: [],
    };
    actual.monto = redondear(actual.monto + (oc.monto ?? 0));
    actual.folios.push(oc.folio);
    mapa.set(clave, actual);
  });

  return [...mapa.values()].sort((a, b) => b.monto - a.monto);
}
