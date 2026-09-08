/**
 * cierresEmbarque.ts (2.4)
 *
 * Los tres cierres del embarque, contra datos reales.
 *
 * ── El problema que resuelve ───────────────────────────────────────────────
 * §4.7 define tres cierres —operativo (Operaciones), de pago (Admin) y
 * administrativo (Admin)— y hasta hoy los tres eran interruptores manuales.
 * Un interruptor manual dice lo que alguien recordó marcar, no lo que pasó:
 * un embarque puede aparecer «cerrado de pago» con la factura sin cobrar.
 *
 * Aquí se calcula lo que los DATOS dicen, y se compara contra lo que está
 * marcado. No se toma el control del interruptor: la persona sigue decidiendo
 * —a veces sabe algo que el sistema no— pero cuando marca algo que los datos
 * contradicen, se le dice.
 *
 * Sin React, sin Firestore, sin red.
 */

import type { EmbarqueCompleto } from '../components/shipments/EmbarquesData';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import type { FacturaCliente, CobroCliente } from '../components/facturas/FacturasData';
import { saldoDeFactura } from './facturacionEmbarque';
import { lineasFacturables } from '../components/shipments/EmbarquesData';

export type TipoCierre = 'operativo' | 'pago' | 'administrativo';

export interface EvaluacionCierre {
  /** ¿Los datos respaldan este cierre? */
  listo: boolean;
  /** Qué falta, en el orden en que hay que resolverlo. Vacío si está listo. */
  faltantes: string[];
  /** Lo que ya se cumplió, para que el avance sea visible. */
  cumplidos: string[];
}

export interface EvaluacionCierres {
  operativo: EvaluacionCierre;
  pago: EvaluacionCierre;
  administrativo: EvaluacionCierre;
  /**
   * Cierres marcados a mano que los datos contradicen. No se desmarcan: se
   * señalan. Quien marcó pudo tener una razón que el sistema no conoce.
   */
  discrepancias: { cierre: TipoCierre; detalle: string }[];
}

export interface ContextoCierres {
  embarque: EmbarqueCompleto;
  /** Órdenes de compra de este embarque. */
  ordenes: OrdenCompra[];
  /** Facturas emitidas de este embarque. */
  facturas: FacturaCliente[];
  /** Cobros recibidos, para saber si las facturas están liquidadas. */
  cobros: CobroCliente[];
}

const money = (n: number, m: string) =>
  `${m} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Operativo: Operaciones terminó y no quedan pendientes suyos.
 *
 * «Sin pendientes» es la guía o reservación capturada —lo primero que se
 * consigue del transportista— y ninguna advertencia heredada sin resolver.
 */
function evaluarOperativo(ctx: ContextoCierres): EvaluacionCierre {
  const e = ctx.embarque;
  const faltantes: string[] = [];
  const cumplidos: string[] = [];

  const tieneGuia = Boolean(e.numeroGuia?.trim()) || Boolean(e.numeroReservacion?.trim());
  if (tieneGuia) cumplidos.push('Guía o reservación capturada.');
  else faltantes.push('Falta el número de guía o de reservación.');

  if (e.requiereCaptura) {
    faltantes.push('El embarque nació automático y sigue marcado como pendiente de captura.');
  } else {
    cumplidos.push('Captura operativa revisada.');
  }

  const pendientes = (e.advertenciasHeredadas ?? []).length;
  if (pendientes > 0) {
    faltantes.push(`Tiene ${pendientes} advertencia${pendientes !== 1 ? 's' : ''} heredada${pendientes !== 1 ? 's' : ''} de la cotización sin resolver.`);
  }

  return { listo: faltantes.length === 0, faltantes, cumplidos };
}

/**
 * De pago: el cliente pagó.
 *
 * Todo lo facturable tiene factura, y todas las facturas vivas están
 * liquidadas. Facturar y no cobrar no cierra nada — es justo el caso que el
 * interruptor manual dejaba pasar.
 */
function evaluarPago(ctx: ContextoCierres): EvaluacionCierre {
  const faltantes: string[] = [];
  const cumplidos: string[] = [];

  const sinFacturar = lineasFacturables(ctx.embarque.cargos?.detalles ?? []);
  if (sinFacturar.length > 0) {
    faltantes.push(`${sinFacturar.length} línea${sinFacturar.length !== 1 ? 's' : ''} de ingreso sin facturar.`);
  } else if ((ctx.embarque.cargos?.detalles ?? []).some(c => c.tipo === 'ingreso')) {
    cumplidos.push('Todo lo facturable está facturado.');
  }

  const vivas = ctx.facturas.filter(f => f.activo !== false && f.estado !== 'cancelada');
  if (vivas.length === 0 && sinFacturar.length === 0) {
    faltantes.push('No hay facturas registradas: no hay nada que dé por cobrado el embarque.');
  }

  for (const f of vivas) {
    const { saldo } = saldoDeFactura(f, ctx.cobros.filter(c => c.facturaId === f.id));
    if (saldo > 1) {
      faltantes.push(`La factura ${f.numero} debe ${money(saldo, f.moneda)}.`);
    } else {
      cumplidos.push(`Factura ${f.numero} cobrada.`);
    }
  }

  return { listo: faltantes.length === 0, faltantes, cumplidos };
}

/**
 * Administrativo: todos los proveedores pagados.
 *
 * Una orden viva —solicitada, en gestión o autorizada— es dinero que Vermur
 * todavía debe. Las rechazadas no cuentan: ese gasto no se va a pagar.
 */
function evaluarAdministrativo(ctx: ContextoCierres): EvaluacionCierre {
  const faltantes: string[] = [];
  const cumplidos: string[] = [];

  const vivas = ctx.ordenes.filter(
    o => o.activo !== false && o.estado !== 'pagada' && o.estado !== 'rechazada',
  );
  if (vivas.length > 0) {
    faltantes.push(
      `${vivas.length} orden${vivas.length !== 1 ? 'es' : ''} de compra sin pagar: ${vivas.map(o => o.folio).join(', ')}.`,
    );
  } else if (ctx.ordenes.length > 0) {
    cumplidos.push('Todas las órdenes de compra están pagadas.');
  }

  // Un gasto sin orden es un proveedor al que nadie le ha pedido el pago.
  const gastosSinOrden = (ctx.embarque.cargos?.detalles ?? [])
    .filter(c => c.tipo === 'gasto' && !c.ordenCompraId);
  if (gastosSinOrden.length > 0) {
    faltantes.push(`${gastosSinOrden.length} gasto${gastosSinOrden.length !== 1 ? 's' : ''} sin orden de compra: nadie ha pedido su pago.`);
  }

  return { listo: faltantes.length === 0, faltantes, cumplidos };
}

export function evaluarCierres(ctx: ContextoCierres): EvaluacionCierres {
  const operativo = evaluarOperativo(ctx);
  const pago = evaluarPago(ctx);
  const administrativo = evaluarAdministrativo(ctx);

  const marcados = ctx.embarque.cierres ?? { operativo: false, pago: false, administrativo: false };
  const discrepancias: EvaluacionCierres['discrepancias'] = [];

  const revisar = (cierre: TipoCierre, ev: EvaluacionCierre) => {
    if (marcados[cierre] && !ev.listo) {
      discrepancias.push({
        cierre,
        detalle: ev.faltantes[0] ?? 'Los datos no respaldan este cierre.',
      });
    }
  };
  revisar('operativo', operativo);
  revisar('pago', pago);
  revisar('administrativo', administrativo);

  return { operativo, pago, administrativo, discrepancias };
}

/**
 * El orden importa: operativo → pago → administrativo (§4.7).
 *
 * No se bloquea marcar fuera de orden —Administración a veces cobra antes de
 * que Operaciones termine su captura— pero se avisa, porque cerrar
 * administrativamente algo que ni siquiera operó suele ser un clic mal dado.
 */
export function avisoDeOrden(
  cierre: TipoCierre,
  cierres: { operativo: boolean; pago: boolean; administrativo: boolean },
): string | null {
  if (cierre === 'pago' && !cierres.operativo) {
    return 'El cierre operativo todavía no está. Normalmente se cierra primero.';
  }
  if (cierre === 'administrativo' && !cierres.pago) {
    return 'El cierre de pago todavía no está: se estaría cerrando el embarque sin que el cliente haya pagado.';
  }
  return null;
}
