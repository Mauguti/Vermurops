/**
 * ocDesdeCargo.ts
 *
 * C-3. Un gasto del embarque se convierte en orden de compra.
 *
 * ── Por qué este es el origen natural ──────────────────────────────────────
 * El cargo de gasto ya sabe todo lo que la OC necesita: a qué proveedor se le
 * paga, por qué concepto, cuánto y en qué moneda. Recapturarlo a mano es
 * pedirle a Operaciones que copie datos que el sistema ya tiene, y cada copia
 * es una oportunidad de equivocarse en un monto.
 *
 * Es también la razón por la que el alta de cargo extra exige proveedor: un
 * gasto sin él no se le puede pagar a nadie, y aquí es donde se nota.
 *
 * ── La regla que impide pagar dos veces ────────────────────────────────────
 * El cargo queda marcado con `ordenCompraId`. Un gasto no puede generar dos
 * órdenes, igual que una línea no puede estar en dos facturas: así es como se
 * paga dos veces lo mismo. La marca vive en el CARGO y no como lista dentro de
 * la OC, por el mismo motivo que en la facturación.
 *
 * Lógica pura: sin React ni Firestore.
 */

import type { CargoDetalle, EmbarqueCompleto } from '../components/shipments/EmbarquesData';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import { programarPago } from './calendarioPagos';

// ─── Se puede o no ────────────────────────────────────────────────────────────

export type MotivoNoConvertible =
  | 'no_es_gasto'
  | 'sin_proveedor'
  | 'monto_cero'
  | 'ya_tiene_orden';

export interface Convertibilidad {
  puede: boolean;
  motivo?: MotivoNoConvertible;
  /** Qué falta, en palabras, para enseñarlo donde el botón no aparece. */
  detalle?: string;
}

/**
 * ¿Este cargo puede volverse orden de compra?
 *
 * Se responde con el motivo, no con un booleano suelto: un botón ausente sin
 * explicación es lo que hace que alguien crea que el sistema está roto.
 */
export function puedeConvertirse(cargo: CargoDetalle): Convertibilidad {
  if (cargo.tipo !== 'gasto') {
    return {
      puede: false,
      motivo: 'no_es_gasto',
      detalle: 'Solo los gastos se pagan a un proveedor. Un ingreso se le cobra al cliente.',
    };
  }
  if (!cargo.proveedorId) {
    return {
      puede: false,
      motivo: 'sin_proveedor',
      detalle: 'Sin proveedor no se sabe a quién pagarle. Asígnalo en el cargo.',
    };
  }
  if (!cargo.monto || cargo.monto <= 0) {
    return {
      puede: false,
      motivo: 'monto_cero',
      detalle: 'Un gasto en cero no genera un pago.',
    };
  }
  if (cargo.ordenCompraId) {
    return {
      puede: false,
      motivo: 'ya_tiene_orden',
      detalle: 'Este gasto ya generó una orden de compra. Ábrela desde el enlace del embarque.',
    };
  }
  return { puede: true };
}

// ─── Construcción ─────────────────────────────────────────────────────────────

export interface ContextoOC {
  embarque: EmbarqueCompleto;
  /** Nombre del proveedor, resuelto del catálogo. */
  proveedorNombre: string;
  /** Quién la solicita. */
  solicitante: { uid: string; nombre: string };
  /** ISO. Inyectable para poder probar. */
  ahora: string;
  /**
   * Días de crédito del proveedor para ESTA modalidad (1.4). Ausente cuando
   * no se conocen: entonces la fecha de pago queda sin calcular en vez de
   * inventarse.
   */
  diasCredito?: number;
}

/**
 * Arma la orden de compra que nace de un cargo.
 *
 * Devuelve el documento SIN `id`, `folio` ni timestamps: los pone el hook, que
 * es quien tiene el contador transaccional.
 *
 * Hereda cliente, proveedor, folio del embarque y concepto, que es lo que
 * pidió el cliente. La fecha de pago se programa con los días de crédito del
 * proveedor cuando el contexto los trae (1.4); sin ellos se deja en null en
 * vez de inventar un plazo.
 */
export function construirOCDesdeCargo(
  cargo: CargoDetalle,
  ctx: ContextoOC,
): Omit<OrdenCompra, 'id' | 'folio' | 'createdAt' | 'updatedAt'> {
  const { embarque, proveedorNombre, solicitante, ahora } = ctx;

  return {
    origen: 'embarque',
    embarqueId: embarque.id,
    embarqueFolio: embarque.folio,

    // El cliente se hereda del embarque: es quien tiene que fondear el pago
    // (C-4), así que la OC necesita saber de quién se espera el dinero.
    clienteId: null,
    clienteNombre: embarque.entidades?.clienteCobrar || null,

    proveedorId: cargo.proveedorId!,
    proveedorNombre,

    conceptoId: cargo.conceptoId ?? '',
    conceptoNombre: cargo.concepto,

    descripcion: `Gasto del embarque ${embarque.folio}: ${cargo.concepto}.`,
    monto: cargo.monto,
    moneda: cargo.moneda,

    fechaRequerida: ahora.slice(0, 10),
    // 1.4 · Crédito en días naturales, pago en día hábil. Sin días de
    // crédito conocidos no se inventa un plazo: queda sin calcular.
    fechaSugeridaPago: typeof ctx.diasCredito === 'number'
      ? programarPago(ahora.slice(0, 10), ctx.diasCredito, proveedorNombre).fechaPago
      : null,

    urgencia: 'normal',
    estado: 'solicitada',
    motivoRechazo: null,
    historialEstados: [{
      estado: 'solicitada',
      fecha: ahora,
      usuarioId: solicitante.uid,
      usuarioNombre: solicitante.nombre,
    }],

    solicitadaPor: { uid: solicitante.uid, nombre: solicitante.nombre, fecha: ahora },
    gestionadaPor: null,
    autorizadaPor: null,
    pagadaPor: null,

    cuentaBancariaId: null,
    bancoSalida: null,
    cuentaSalida: null,
    facturaAsociada: null,
    comprobantePago: null,

    esAnticipo: false,
    anticiposCruzados: [],
    saldoPendiente: null,
    montoDisponible: null,

    activo: true,
  };
}

/** Marca el cargo con la orden que generó, para que no genere otra. */
export function marcarCargoConOrden(
  detalles: CargoDetalle[],
  cargoId: string,
  ordenCompraId: string,
): CargoDetalle[] {
  return detalles.map(c =>
    c.id === cargoId ? { ...c, ordenCompraId } : c);
}
