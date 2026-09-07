/**
 * fondeoCliente.ts (1.1)
 *
 * Cuándo se puede pagar a un proveedor: el fondeo del cliente y el flag
 * «No Pagar».
 *
 * ── La regla del negocio ───────────────────────────────────────────────────
 * Textual: «tenemos que esperar el dinero del cliente para pagarle al
 * proveedor». Vermur no financia la operación de su cliente — adelanta el
 * pago solo dentro del crédito que le dio, y para los IMPUESTOS ni eso:
 * §4.7 dice «no se financian impuestos: el cliente deposita primero».
 *
 * De ahí las dos reglas, que son distintas:
 *
 *   Gasto normal   → puede autorizarse aunque el depósito no haya llegado,
 *                    si el embarque tiene fondeo suficiente en conjunto.
 *   IMPUESTOS      → el depósito tiene que estar, cubriendo ESE monto.
 *                    No hay crédito, no hay excepción, no hay «lo cubrimos
 *                    y luego nos pagan».
 *
 * El flag «No Pagar» es la salida manual: bloquea la autorización aunque las
 * cuentas cuadren. Existe porque Administración a veces sabe algo que el
 * sistema no —un cliente que va a rechazar, un depósito que viene en camino
 * y no debe gastarse en otra cosa— y necesita frenar sin rechazar.
 *
 * Sin React, sin Firestore, sin red.
 */

import type { DepositoCliente, OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import { sumarPorMoneda, type TotalPorMoneda } from './sumarPorMoneda';

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Qué es un pago de impuestos
//
// ⚠️ DECISIÓN DE NEGOCIO PENDIENTE DE CONFIRMAR CON VERMUR (7-sep-2026).
//
// El catálogo de 105 conceptos NO marca cuáles son impuestos. Se identifican
// por id contra esta lista, derivada de leer el catálogo: «Pat - Taxes» es el
// pago de aranceles e impuestos de importación, y las retenciones son
// impuestos por definición (su cuenta contable es Income Tax Expense).
//
// La lista vive aquí y no en el catálogo a propósito: marcar los 105
// conceptos es trabajo de Administración, y una lista corta que se puede leer
// de un vistazo es más fácil de corregir que un campo repartido en 105
// documentos. Cuando Vermur confirme el criterio, esto se mueve al catálogo
// como `concepto.noFinanciable`.
//
// La OC guarda su propio `esPagoImpuestos` (ver `esPagoDeImpuestos`), así que
// corregir esta lista NO reescribe la historia de las OCs ya emitidas.
// ─────────────────────────────────────────────────────────────────────────────

export const CONCEPTOS_IMPUESTO = new Set([
  'CON-010', // Pat - Taxes — aranceles e impuestos de importación
  'CON-089', // Retención ISR
  'CON-090', // Retención ISR RESICO
  'CON-091', // Retención IVA
]);

/**
 * ¿Esta OC es un pago de impuestos?
 *
 * Lee la marca guardada en la OC si existe; si no —OCs anteriores a esto—
 * cae a la lista de conceptos. El patrón de `getOficialIds`: campo nuevo
 * primero, derivación después.
 */
export function esPagoDeImpuestos(
  oc: Pick<OrdenCompra, 'conceptoId'> & { esPagoImpuestos?: boolean },
): boolean {
  if (typeof oc.esPagoImpuestos === 'boolean') return oc.esPagoImpuestos;
  return CONCEPTOS_IMPUESTO.has(oc.conceptoId);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · El fondeo de un embarque
// ─────────────────────────────────────────────────────────────────────────────

export interface FondeoEmbarque {
  /** Depositado por el cliente, POR MONEDA (§4.3: nunca un escalar). */
  depositado: TotalPorMoneda;
  /** Comprometido en OCs vivas (ni pagadas ni rechazadas), por moneda. */
  comprometido: TotalPorMoneda;
  /** depositado − comprometido, por moneda. Puede ser negativo. */
  disponible: TotalPorMoneda;
}

const MONEDAS: (keyof TotalPorMoneda)[] = ['USD', 'MXN'];

/**
 * Cuánto entró y cuánto está comprometido en un embarque.
 *
 * §4.3: se calcula POR MONEDA. Un depósito de 40,000 MXN no fondea una OC de
 * 2,000 USD, y sumarlos daría un «42,000» que se ve bien y autoriza un pago
 * que no está cubierto.
 *
 * Las OCs ya pagadas no cuentan como comprometido —su dinero ya salió— pero
 * tampoco se restan del depósito: el depósito histórico y el saldo vivo son
 * preguntas distintas. Quien necesite el saldo bancario mira el banco.
 */
export function calcularFondeo(
  depositos: DepositoCliente[],
  ocsDelEmbarque: OrdenCompra[],
): FondeoEmbarque {
  const depositado = sumarPorMoneda(
    depositos.filter(d => d.activo !== false),
    d => d.monto,
    d => d.moneda,
  );

  const vivas = ocsDelEmbarque.filter(
    oc => oc.activo !== false && oc.estado !== 'rechazada' && oc.estado !== 'pagada',
  );
  const comprometido = sumarPorMoneda(vivas, oc => oc.monto, oc => oc.moneda);

  const disponible = { USD: 0, MXN: 0 } as TotalPorMoneda;
  for (const m of MONEDAS) {
    disponible[m] = Math.round(((depositado[m] ?? 0) - (comprometido[m] ?? 0)) * 100) / 100;
  }

  return { depositado, comprometido, disponible };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · ¿Se puede autorizar esta OC?
// ─────────────────────────────────────────────────────────────────────────────

export interface VeredictoFondeo {
  puedeAutorizar: boolean;
  /** Por qué no. Se muestra tal cual a Administración. */
  motivo?: string;
  /** true cuando el bloqueo es el flag manual, no las cuentas. */
  bloqueadaPorFlag?: boolean;
  /** true cuando lo que falta es el depósito de impuestos. */
  esperandoDepositoImpuestos?: boolean;
}

const money = (n: number, moneda: string) =>
  `${moneda} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * El veredicto de fondeo para una OC.
 *
 * Las OCs de oficina (origen ≠ embarque) no tienen cliente que las fondee:
 * son gastos de Vermur y pasan sin esta validación.
 */
export function evaluarFondeo(
  oc: OrdenCompra & { esPagoImpuestos?: boolean; noPagar?: boolean },
  fondeo: FondeoEmbarque,
): VeredictoFondeo {
  // El flag manual gana sobre cualquier cuenta: existe justo para eso.
  if (oc.noPagar) {
    return {
      puedeAutorizar: false,
      bloqueadaPorFlag: true,
      motivo: 'Marcada «No pagar»: alguien la detuvo a propósito. Quita la marca para autorizarla.',
    };
  }

  if (oc.origen !== 'embarque') return { puedeAutorizar: true };

  const moneda = oc.moneda;
  const depositado = fondeo.depositado[moneda] ?? 0;

  if (esPagoDeImpuestos(oc)) {
    // No se financian impuestos: el depósito debe cubrir ESTE monto, sin
    // importar qué tan bien vaya el resto del embarque.
    if (depositado < oc.monto) {
      return {
        puedeAutorizar: false,
        esperandoDepositoImpuestos: true,
        motivo: `Los impuestos no se financian: el cliente depositó ${money(depositado, moneda)} y esta orden es por ${money(oc.monto, moneda)}. Registra el depósito antes de autorizar.`,
      };
    }
    return { puedeAutorizar: true };
  }

  // Gasto normal: basta con que el embarque no quede sobregirado.
  const disponible = fondeo.disponible[moneda] ?? 0;
  if (disponible < 0) {
    return {
      puedeAutorizar: false,
      motivo: `El embarque está sobregirado en ${money(Math.abs(disponible), moneda)}: hay más órdenes vivas que depósitos. Registra el depósito o rechaza alguna orden.`,
    };
  }

  return { puedeAutorizar: true };
}

/**
 * ¿Debería nacer marcada «No pagar»?
 *
 * Se propone —no se impone— al crear la OC: una de impuestos sin depósito
 * suficiente nace frenada, que es exactamente lo que pide la regla. Quien la
 * crea puede quitar la marca si sabe algo que el sistema no.
 */
export function sugerirNoPagar(
  oc: Pick<OrdenCompra, 'conceptoId' | 'origen' | 'monto' | 'moneda'> & { esPagoImpuestos?: boolean },
  fondeo: FondeoEmbarque,
): boolean {
  if (oc.origen !== 'embarque') return false;
  if (!esPagoDeImpuestos(oc)) return false;
  return (fondeo.depositado[oc.moneda] ?? 0) < oc.monto;
}
