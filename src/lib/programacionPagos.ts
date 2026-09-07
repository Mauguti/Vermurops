/**
 * programacionPagos.ts (1.5)
 *
 * Lo que Julio necesita ver cada mañana: qué se paga hoy, qué se venció, y
 * qué viene. Es la lógica del panel que reemplaza su Excel.
 *
 * ── Por qué un Excel funciona y una bandeja no ─────────────────────────────
 * El Excel de Julio ordena por fecha y agrupa por proveedor de un vistazo.
 * La bandeja de OCs ordena por estado, que sirve para el flujo pero no para
 * pagar: al pagar, el estado ya se sabe (autorizada) y lo que importa es
 * CUÁNDO y A QUIÉN. Este módulo produce esa otra lectura.
 *
 * Sin React, sin Firestore, sin red.
 */

import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import { agruparParaPago, type GrupoDePago } from './calendarioPagos';
import { montoATransferir } from './anticipos';
import { esPagoDeImpuestos } from './fondeoCliente';

/** En qué momento está un pago respecto de hoy. */
export type Vencimiento = 'vencido' | 'hoy' | 'proximo' | 'sin_fecha';

export interface OrdenProgramada {
  oc: OrdenCompra;
  /** Fecha en que toca pagarla. */
  fechaPago: string | null;
  vencimiento: Vencimiento;
  /** Días de atraso (positivo) o que faltan (negativo). null sin fecha. */
  dias: number | null;
  /** Lo que de verdad se transfiere: monto menos anticipos aplicados. */
  aTransferir: number;
  /** Marcas que Julio necesita ver antes de pagar. */
  avisos: string[];
}

const diasEntre = (desde: string, hasta: string): number => {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
};

/**
 * Las órdenes listas para pagar, con su urgencia.
 *
 * Solo las AUTORIZADAS: una orden en gestión todavía no es una cuenta por
 * pagar en firme, y mezclarlas haría que el total del día incluyera dinero
 * que nadie aprobó.
 */
export function ordenesProgramadas(
  ordenes: OrdenCompra[],
  hoy: string,
): OrdenProgramada[] {
  return ordenes
    .filter(oc => oc.activo !== false && oc.estado === 'autorizada')
    .map(oc => {
      const fechaPago = oc.fechaSugeridaPago;
      const dias = fechaPago ? diasEntre(fechaPago, hoy) : null;

      const vencimiento: Vencimiento =
        !fechaPago ? 'sin_fecha'
        : dias! > 0 ? 'vencido'
        : dias === 0 ? 'hoy'
        : 'proximo';

      const avisos: string[] = [];
      if (oc.noPagar) avisos.push('Marcada «No pagar»');
      if (esPagoDeImpuestos(oc)) avisos.push('Impuestos');
      if (!oc.cuentaBancariaId) avisos.push('Falta la cuenta del proveedor');
      if (!oc.facturaAsociada) avisos.push('Sin factura');
      if (oc.urgencia === 'urgente') avisos.push('Urgente');

      return { oc, fechaPago, vencimiento, dias, aTransferir: montoATransferir(oc), avisos };
    })
    .sort((a, b) => {
      // Lo vencido primero, después lo de hoy, y lo sin fecha al final:
      // ordenar por fecha dejaría lo sin programar arriba o abajo por azar.
      const peso = (v: Vencimiento) => v === 'vencido' ? 0 : v === 'hoy' ? 1 : v === 'proximo' ? 2 : 3;
      return peso(a.vencimiento) - peso(b.vencimiento)
        || (a.fechaPago ?? '').localeCompare(b.fechaPago ?? '')
        || a.oc.proveedorNombre.localeCompare(b.oc.proveedorNombre, 'es');
    });
}

/**
 * Agrupa lo pagable en transferencias reales.
 *
 * Una transferencia por proveedor, fecha y moneda. Las marcadas «No pagar»
 * quedan FUERA: si entraran al grupo, el total incluiría dinero que alguien
 * detuvo a propósito y la transferencia saldría de más.
 */
export function transferenciasDelDia(
  programadas: OrdenProgramada[],
  hasta: string,
): GrupoDePago<OrdenCompra>[] {
  const pagables = programadas.filter(p =>
    !p.oc.noPagar && p.fechaPago !== null && p.fechaPago <= hasta);

  // Se agrupa por lo que se TRANSFIERE, no por el monto de la orden: si un
  // anticipo cubrió la mitad, la transferencia es por la mitad.
  const items = pagables.map(p => ({ ...p.oc, monto: p.aTransferir }));
  return agruparParaPago(items, oc => {
    const prog = pagables.find(p => p.oc.id === oc.id);
    return prog?.fechaPago ?? hasta;
  });
}

export interface ResumenDelDia {
  vencidas: number;
  hoy: number;
  proximas: number;
  sinFecha: number;
  bloqueadas: number;
}

export function resumenDelDia(programadas: OrdenProgramada[]): ResumenDelDia {
  return {
    vencidas: programadas.filter(p => p.vencimiento === 'vencido').length,
    hoy: programadas.filter(p => p.vencimiento === 'hoy').length,
    proximas: programadas.filter(p => p.vencimiento === 'proximo').length,
    sinFecha: programadas.filter(p => p.vencimiento === 'sin_fecha').length,
    bloqueadas: programadas.filter(p => p.oc.noPagar).length,
  };
}

/**
 * El texto del comprobante para el proveedor.
 *
 * «Agrupar facturas del mismo proveedor con comprobante detallando folios»:
 * sin el detalle, el proveedor recibe un depósito y no sabe qué cubre, así
 * que llama a preguntar — que es justo el trabajo que este panel evita.
 */
export function textoComprobante(grupo: GrupoDePago<OrdenCompra>): string {
  const money = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const lineas = grupo.items.map(oc =>
    `  · ${oc.folio} — ${oc.conceptoNombre}${oc.facturaAsociada ? ` (factura ${oc.facturaAsociada})` : ''}: ${grupo.moneda} ${money(oc.monto)}`,
  );

  return [
    `Pago a ${grupo.proveedorNombre}`,
    `Fecha: ${grupo.fechaPago}`,
    `Total: ${grupo.moneda} ${money(grupo.total)}`,
    '',
    `Cubre ${grupo.items.length} concepto${grupo.items.length !== 1 ? 's' : ''}:`,
    ...lineas,
  ].join('\n');
}
