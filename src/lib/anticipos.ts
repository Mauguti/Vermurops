/**
 * anticipos.ts (1.3)
 *
 * Cruzar un anticipo pagado contra la orden definitiva.
 *
 * ── El caso real ───────────────────────────────────────────────────────────
 * Un transportista cobra 50% adelantado. Se le paga un anticipo, y semanas
 * después llega la factura por el total. Esa factura NO se paga completa: se
 * le descuenta lo ya entregado. Sin este cruce, Vermur paga dos veces la
 * mitad del flete y el error solo aparece al conciliar el mes.
 *
 * ── El principio ───────────────────────────────────────────────────────────
 * Lo disponible de un anticipo se DERIVA de las aplicaciones que existen,
 * nunca se guarda como saldo que alguien tenga que recordar actualizar. Un
 * contador que se actualiza a mano se desincroniza el día que una OC se
 * rechaza, y entonces el sistema cree que hay dinero disponible que ya se usó.
 *
 * Sin React, sin Firestore, sin red.
 */

import type { AnticipoRef, OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import { calcularSaldoPendiente, calcularMontoDisponible } from '../components/ordenesCompra/OrdenesCompraData';

/**
 * Cuánto queda libre de un anticipo, mirando TODAS las órdenes.
 *
 * Solo cuentan las aplicaciones vivas: si la orden a la que se aplicó fue
 * rechazada, ese dinero vuelve a estar disponible. Por eso se deriva.
 */
export function disponibleDeAnticipo(anticipo: OrdenCompra, todas: OrdenCompra[]): number {
  if (!anticipo.esAnticipo) return 0;
  const aplicaciones = todas
    .filter(o => o.activo !== false && o.estado !== 'rechazada')
    .flatMap(o => (o.anticiposCruzados ?? []).filter(a => a.ocId === anticipo.id))
    .map(a => a.montoAplicado);
  return calcularMontoDisponible(anticipo.monto, aplicaciones);
}

export interface AnticipoDisponible {
  anticipo: OrdenCompra;
  disponible: number;
}

/**
 * Los anticipos que se pueden cruzar contra esta orden.
 *
 * Tienen que ser del MISMO proveedor y la MISMA moneda —cruzar un anticipo en
 * dólares contra una factura en pesos exigiría un tipo de cambio que nadie
 * declaró (§4.3)— y estar PAGADOS: un anticipo autorizado pero no pagado no
 * ha entregado dinero, y descontarlo dejaría al proveedor cobrando de menos.
 */
export function anticiposAplicables(
  oc: OrdenCompra,
  todas: OrdenCompra[],
): AnticipoDisponible[] {
  if (oc.esAnticipo) return []; // un anticipo no se cruza contra otro
  const yaAplicados = new Set((oc.anticiposCruzados ?? []).map(a => a.ocId));

  return todas
    .filter(o =>
      o.esAnticipo
      && o.activo !== false
      && o.estado === 'pagada'
      && o.proveedorId === oc.proveedorId
      && o.moneda === oc.moneda
      && !yaAplicados.has(o.id))
    .map(anticipo => ({ anticipo, disponible: disponibleDeAnticipo(anticipo, todas) }))
    .filter(x => x.disponible > 0)
    .sort((a, b) => a.anticipo.folio.localeCompare(b.anticipo.folio));
}

export interface ResultadoCruce {
  ok: boolean;
  /** Por qué no se puede. Se muestra tal cual. */
  error?: string;
  /** Cambios a guardar en la orden destino. */
  cambios?: Pick<OrdenCompra, 'anticiposCruzados' | 'saldoPendiente'>;
}

/**
 * Aplica un anticipo a una orden.
 *
 * Nunca se aplica más de lo disponible ni más de lo que la orden debe: pagar
 * de más con un anticipo no «adelanta» nada, deja un saldo a favor que nadie
 * rastrea y que el proveedor no reconoce.
 */
export function aplicarAnticipo(
  oc: OrdenCompra,
  anticipo: OrdenCompra,
  montoAAplicar: number,
  todas: OrdenCompra[],
): ResultadoCruce {
  if (anticipo.estado !== 'pagada') {
    return { ok: false, error: 'El anticipo todavía no se ha pagado: no hay dinero entregado que descontar.' };
  }
  if (anticipo.proveedorId !== oc.proveedorId) {
    return { ok: false, error: 'El anticipo es de otro proveedor.' };
  }
  if (anticipo.moneda !== oc.moneda) {
    return { ok: false, error: `El anticipo está en ${anticipo.moneda} y la orden en ${oc.moneda}.` };
  }
  if (!(montoAAplicar > 0)) {
    return { ok: false, error: 'El monto a aplicar debe ser mayor a cero.' };
  }

  const disponible = disponibleDeAnticipo(anticipo, todas);
  if (montoAAplicar > disponible) {
    return {
      ok: false,
      error: `Solo quedan ${anticipo.moneda} ${disponible.toLocaleString('en-US', { minimumFractionDigits: 2 })} disponibles de ${anticipo.folio}.`,
    };
  }

  const saldoActual = calcularSaldoPendiente(oc.monto, oc.anticiposCruzados ?? []);
  if (montoAAplicar > saldoActual) {
    return {
      ok: false,
      error: `La orden solo debe ${oc.moneda} ${saldoActual.toLocaleString('en-US', { minimumFractionDigits: 2 })}. Aplicar más dejaría un saldo a favor que nadie rastrea.`,
    };
  }

  const ref: AnticipoRef = {
    ocId: anticipo.id,
    folio: anticipo.folio,
    montoAplicado: montoAAplicar,
    moneda: anticipo.moneda,
    fechaPago: anticipo.pagadaPor?.fecha ?? new Date().toISOString(),
  };

  const anticiposCruzados = [...(oc.anticiposCruzados ?? []), ref];
  return {
    ok: true,
    cambios: {
      anticiposCruzados,
      saldoPendiente: calcularSaldoPendiente(oc.monto, anticiposCruzados),
    },
  };
}

/** Quita un anticipo aplicado. El dinero vuelve a estar disponible solo. */
export function quitarAnticipo(
  oc: OrdenCompra,
  anticipoId: string,
): Pick<OrdenCompra, 'anticiposCruzados' | 'saldoPendiente'> {
  const anticiposCruzados = (oc.anticiposCruzados ?? []).filter(a => a.ocId !== anticipoId);
  return {
    anticiposCruzados,
    saldoPendiente: anticiposCruzados.length > 0
      ? calcularSaldoPendiente(oc.monto, anticiposCruzados)
      : null,
  };
}

/** Lo que de verdad hay que transferir: el monto menos lo ya adelantado. */
export function montoATransferir(oc: OrdenCompra): number {
  return calcularSaldoPendiente(oc.monto, oc.anticiposCruzados ?? []);
}
