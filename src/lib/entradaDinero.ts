/**
 * entradaDinero.ts — tarea 69 · P3, bloque 1 del plan de pagos
 *
 * «Registrar entrada de dinero»: el dinero que entra del cliente, capturado
 * donde se recibe. Gaby: «quien hace la solicitud de pago es Operaciones,
 * pero quien recibe el dinero del cliente es Administración».
 *
 * ── Qué mueve esta tarea ──────────────────────────────────────────────────
 * Hasta aquí había DOS formularios en dos pantallas distintas y ninguno
 * donde Administración cobra:
 *
 *   - «Registrar cobro» contra una factura, en Cuentas por cobrar y en la
 *     pestaña Facturas del embarque.
 *   - «Registrar depósito del cliente» DENTRO de la ficha de la orden de
 *     compra (`FichaOC.tsx`), que es la pantalla del pago AL PROVEEDOR. Esa
 *     es la queja del bloque 1: el cobro vivía en la cuenta por pagar.
 *
 * Los dos se juntan en Cuentas por cobrar, con la misma pregunta de siempre
 * —cuánto entró, cuándo, a qué cuenta— y una sola diferencia: a qué se liga.
 * Contra una factura es un cobro; sin factura es un anticipo, y entonces se
 * liga al embarque y con eso fondea sus órdenes de pago (1.1).
 *
 * ── Lo que esta capa decide ───────────────────────────────────────────────
 * Lógica pura: qué embarques pueden recibir un anticipo, qué falta para
 * poder guardar, y qué entradas tiene ya un embarque para pintarlas de solo
 * lectura en la ficha de la orden. Sin React y sin Firestore.
 */

import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import type { Pago } from './pagos';
import { sumarPorMoneda, type TotalPorMoneda, type Moneda } from './sumarPorMoneda';

/** Contra qué se liga el dinero que entró. */
export type TipoEntrada = 'factura' | 'anticipo';

/**
 * El aviso que sustituye al formulario de depósito en la ficha de la orden.
 *
 * Es una sola constante y no un texto pegado en la pantalla porque lo tienen
 * que decir los dos lugares donde el formulario desapareció —la ficha de la
 * orden y la pestaña Facturas del embarque— y tienen que decir lo MISMO. Un
 * «ya no está aquí» sin el «está allá» manda a buscar.
 */
export const AVISO_COBRO_EN_COBRANZA =
  'Los cobros los registra Administración en Cuentas por cobrar.';

// ─────────────────────────────────────────────────────────────────────────────
// 1 · A qué embarque se le puede anticipar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un embarque al que se le puede registrar un anticipo, con lo que piden sus
 * órdenes de pago.
 *
 * Se DERIVA de las órdenes de compra y no de la colección de embarques, por
 * dos razones:
 *
 *  1. Es lo que el punto 1 de la tarea pide: el anticipo se liga «al embarque
 *     y a la orden de pago que fondea». Un embarque sin ninguna orden abierta
 *     no tiene pago que fondear, así que ofrecerlo sería ofrecer un destino
 *     sin motivo.
 *  2. El dato está completo ahí. La orden ya trae `embarqueFolio`, `clienteId`
 *     y `clienteNombre` —es justo lo que el formulario de la ficha de la OC
 *     usaba— así que no hace falta cruzar con otra colección para armar el
 *     documento.
 */
export interface EmbarqueFondeable {
  embarqueId: string;
  embarqueFolio: string;
  clienteId: string;
  clienteNombre: string;
  /** Cuántas órdenes siguen esperando dinero. */
  ordenesAbiertas: number;
  /** Lo que piden esas órdenes, POR MONEDA (§4.3). */
  comprometido: TotalPorMoneda;
}

/** Una orden ya pagada o rechazada no espera dinero: no pide fondeo. */
function esperaDinero(o: OrdenCompra): boolean {
  return o.estado !== 'pagada' && o.estado !== 'rechazada';
}

/**
 * Los embarques que pueden recibir un anticipo, el más comprometido primero.
 *
 * Un gasto de oficina (`origen !== 'embarque'`) no entra: no tiene cliente
 * que anticipe. Y una orden sin `embarqueId` tampoco, aunque diga que viene
 * de un embarque: sin el id el depósito no se podría ligar y el fondeo no lo
 * vería — el mismo motivo por el que `CobroCliente` lo exige.
 */
export function embarquesFondeables(ordenes: readonly OrdenCompra[]): EmbarqueFondeable[] {
  const porEmbarque = new Map<string, { base: EmbarqueFondeable; montos: { monto: number; moneda: Moneda }[] }>();

  for (const o of ordenes) {
    if (o.origen !== 'embarque') continue;
    if (!o.embarqueId) continue;
    if (!esperaDinero(o)) continue;

    const previo = porEmbarque.get(o.embarqueId);
    if (previo) {
      previo.base.ordenesAbiertas += 1;
      previo.montos.push({ monto: o.monto, moneda: o.moneda });
      /* El nombre del cliente se completa con el primero que lo traiga: una
         orden puede tenerlo vacío y otra no, y «(sin cliente)» en el selector
         esconde un embarque que sí se puede fondear. */
      if (!previo.base.clienteNombre && o.clienteNombre) {
        previo.base.clienteNombre = o.clienteNombre;
        previo.base.clienteId = o.clienteId ?? previo.base.clienteId;
      }
      continue;
    }

    porEmbarque.set(o.embarqueId, {
      base: {
        embarqueId: o.embarqueId,
        embarqueFolio: o.embarqueFolio ?? o.embarqueId,
        clienteId: o.clienteId ?? '',
        clienteNombre: o.clienteNombre ?? '',
        ordenesAbiertas: 1,
        comprometido: { USD: 0, MXN: 0 },
      },
      montos: [{ monto: o.monto, moneda: o.moneda }],
    });
  }

  return [...porEmbarque.values()]
    .map(({ base, montos }) => ({
      ...base,
      comprometido: sumarPorMoneda(montos, m => m.monto, m => m.moneda),
    }))
    .sort((a, b) => a.embarqueFolio.localeCompare(b.embarqueFolio, 'es'));
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Qué falta para poder guardar
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que el formulario del anticipo tiene en pantalla. */
export interface BorradorAnticipo {
  embarqueId: string;
  monto: number;
  moneda: Moneda | '';
  fecha: string;
}

/**
 * Qué falta para registrar un anticipo. `null` = se puede guardar.
 *
 * **La referencia bancaria NO está aquí, y es el punto 2 de la tarea.** Gaby:
 * «la referencia bancaria aparece después del pago, no antes». El formulario
 * de la ficha de la OC la exigía (`disabled={… || !depRef.trim()}`), así que
 * la entrada de dinero no se podía capturar sin inventar una referencia — y
 * una referencia inventada es peor que una vacía: se ve igual que una real y
 * descuadra la conciliación de Julio sin avisar.
 *
 * **La moneda sí.** Antes se heredaba de la orden (`moneda: oc.moneda`), así
 * que un depósito en pesos contra una orden en dólares se guardaba como
 * dólares (§10.1 del plan). Ahora se elige, y si no se eligió no se guarda:
 * un default la volvería a adivinar en silencio.
 */
export function problemaAnticipo(b: BorradorAnticipo): string | null {
  if (!b.embarqueId) return 'Elige a qué embarque entra el dinero.';
  if (!b.moneda) return 'Elige la moneda del depósito.';
  if (!Number.isFinite(b.monto) || b.monto <= 0) return 'Captura cuánto entró.';
  if (!b.fecha) return 'Captura la fecha del depósito.';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Lo que ya entró, para el panel de solo lectura de la orden
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Una entrada de dinero de un embarque, en la forma en que la ficha de la
 * orden la pinta ahora que no la captura.
 *
 * `aplicadoA` es contra qué se ligó: la factura, cuando el pago trae
 * aplicaciones, y null cuando es un anticipo a cuenta. Es la diferencia que
 * el panel tiene que enseñar, porque un anticipo todavía no cobra ninguna
 * factura y eso se pregunta.
 */
export interface EntradaDeEmbarque {
  pagoId: string;
  folio: string;
  fecha: string;
  monto: number;
  moneda: Moneda;
  referencia: string | null;
  /** Números de factura que este pago cubrió en ESTE embarque; vacío si es anticipo. */
  aplicadoA: string[];
}

/**
 * Las entradas vivas de un embarque, la más reciente primero.
 *
 * Se lee de la lista unificada de la tarea 67, así que un cobro viejo de
 * `cobros/`, un depósito viejo de `depositosCliente/` y un `Pago` nuevo se
 * ven igual. Si uno apareciera y el otro no, la lista unificada se rompió.
 *
 * Un pago ANULADO no se lista. El panel es de solo lectura y su pregunta es
 * «cuánto dinero hay», no «qué se capturó»: un movimiento anulado contestaría
 * la segunda y se leería como la primera.
 */
export function entradasDelEmbarque(
  pagos: readonly Pago[],
  embarqueId: string,
): EntradaDeEmbarque[] {
  if (!embarqueId) return [];

  return pagos
    .filter(p => p.lado === 'cliente' && p.activo !== false && (p.embarqueIds ?? []).includes(embarqueId))
    .map(p => ({
      pagoId: p.id,
      folio: p.folio || p.id,
      fecha: p.fecha,
      monto: p.monto,
      moneda: p.moneda,
      referencia: p.referencia ?? null,
      aplicadoA: (p.aplicaciones ?? [])
        .filter(a => a.destinoTipo === 'factura')
        .map(a => a.destinoNumero || a.destinoId),
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}
