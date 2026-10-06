/**
 * aplicarPago.ts — tarea 70 · P4, bloque 2 del plan de pagos (§7.1)
 *
 * «Aplicar pago» del lado cliente: UNA entrada de dinero repartida entre
 * VARIAS facturas, con parcialidades.
 *
 * ── El flujo que describió Julio ──────────────────────────────────────────
 * Eliges una factura → «Aplicar pago» → el sistema muestra las demás
 * pendientes **del mismo cliente y en la misma moneda** → eliges varias,
 * capturas cuánto se aplica a cada una, y el restante de cada factura queda
 * a la vista. Es el flujo de Magaya que hoy no existe: `CobroCliente` apunta
 * a UNA factura, así que «un cliente paga doce facturas con una
 * transferencia» eran doce documentos con la misma referencia copiada a
 * mano, y ninguno sabía de los otros.
 *
 * ── Lo que esta capa decide ───────────────────────────────────────────────
 * Qué facturas se pueden ofrecer, cómo se reparte el dinero en cascada, y
 * qué impide guardar. Nada de React, nada de Firestore, nada de red.
 *
 * ── Lo que NO hace, y por qué ─────────────────────────────────────────────
 * **No convierte monedas.** §4 del plan, salida (a): un pago se aplica solo a
 * destinos de SU moneda. El dinero que de verdad entró al banco está en una
 * sola moneda y es lo que Julio concilia; y §4.3 solo tolera un total
 * convertido cuando la conversión está declarada y a la vista — dentro de un
 * renglón de aplicación ese tipo de cambio quedaría escondido, que es justo
 * lo que la regla prohíbe. Lo que sí se hace es DECIRLO: cuando el cliente
 * tiene facturas abiertas solo en la otra moneda, la pantalla lo explica en
 * vez de dejar la lista vacía (`avisoDeMoneda`). La conversión declarada es
 * la salida (b), reservada en el tipo y pendiente de la respuesta de Julio
 * (pregunta J3 del plan).
 */

import type { FacturaEnCartera } from './cuentasPorCobrar';
import type { AplicacionPago, Pago } from './pagos';
import type { Moneda } from './sumarPorMoneda';

const redondear = (n: number) => Math.round(n * 100) / 100;

/** La tolerancia de `saldoDeFactura`: un peso de redondeo no es una deuda. */
const TOLERANCIA = 1;

const money = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Cómo se agrupa un cliente cuando la factura no trae `clienteId`.
 *
 * El mismo criterio que `agruparPorCliente`: hay facturas legacy sin id, y
 * compararlas por id dejaría cada una en su propio cliente — el pago no
 * podría cubrir dos facturas del mismo cliente solo porque el dato viejo no
 * trae la llave.
 */
export function claveDeCliente(f: { clienteId?: string | null; clienteNombre?: string }): string {
  return f.clienteId || `nombre:${(f.clienteNombre ?? '').trim().toLowerCase()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Qué facturas se pueden ofrecer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Las facturas a las que ESTE pago se puede aplicar, la más vencida primero.
 *
 * Tres filtros, y los tres niegan algo que se vería bien:
 *
 *  1. **Mismo cliente.** Un pago tiene un solo tercero (§1.1): no cubre a dos.
 *  2. **Misma moneda** (§4). Lo que no se puede aplicar no se ofrece: un
 *     renglón en MXN dentro de un pago en USD se vería idéntico a los demás
 *     y `montoCobrable` lo rechazaría hasta el final.
 *  3. **Con saldo.** Una factura liquidada no recibe más dinero; aplicarle
 *     otro peso la dejaría sobrecobrada sin que nada lo señale (§10.5).
 *
 * El orden es el de `cartera` invertido por atraso: lo más vencido arriba, que
 * es lo que se cobra primero y lo que la cascada reparte primero.
 */
export function facturasAplicables(
  items: readonly FacturaEnCartera[],
  destino: { clienteClave: string; moneda: Moneda },
): FacturaEnCartera[] {
  return items
    .filter(i => claveDeCliente(i.factura) === destino.clienteClave)
    .filter(i => i.factura.moneda === destino.moneda)
    .filter(i => i.estado !== 'cobrado' && i.saldo > TOLERANCIA)
    .sort((a, b) =>
      b.diasVencido - a.diasVencido
      || a.factura.fechaVencimiento.localeCompare(b.factura.fechaVencimiento)
      || a.factura.numero.localeCompare(b.factura.numero, 'es'));
}

/**
 * Lo que hay que DECIR cuando el pago no tiene a qué aplicarse en su moneda.
 *
 * §4 del plan, textual: «cuando un cliente tiene dinero sin aplicar en USD y
 * facturas abiertas solo en MXN, la pantalla lo DICE, en vez de dejar la
 * lista vacía sin explicación». Una lista vacía se lee como «este cliente no
 * debe nada», que es lo contrario de lo que pasa.
 *
 * Devuelve null cuando no hay nada que explicar: hay facturas en la moneda
 * del pago, o el cliente de verdad no debe nada.
 */
export function avisoDeMoneda(
  items: readonly FacturaEnCartera[],
  destino: { clienteClave: string; moneda: Moneda },
): string | null {
  const abiertas = items.filter(i =>
    claveDeCliente(i.factura) === destino.clienteClave
    && i.estado !== 'cobrado' && i.saldo > TOLERANCIA);

  if (abiertas.some(i => i.factura.moneda === destino.moneda)) return null;

  const otras = abiertas.filter(i => i.factura.moneda !== destino.moneda);
  if (otras.length === 0) return null;

  // Una sola moneda por renglón; se agrupa para no inventar un total mezclado.
  const porMoneda = new Map<Moneda, number>();
  otras.forEach(i => porMoneda.set(
    i.factura.moneda, redondear((porMoneda.get(i.factura.moneda) ?? 0) + i.saldo)));
  const detalle = [...porMoneda.entries()].map(([m, n]) => `${m} ${money(n)}`).join(' + ');

  return `Este cliente no tiene facturas abiertas en ${destino.moneda}. `
    + `Lo que debe está en otra moneda (${detalle}) y un pago no se aplica a `
    + `facturas de otra moneda: el dinero queda a cuenta hasta que se emita o `
    + `se cobre una factura en ${destino.moneda}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · El reparto
// ─────────────────────────────────────────────────────────────────────────────

/** Cuánto se aplica a cada factura. Ausente = no elegida. */
export type Reparto = Record<string, number>;

/**
 * «Aplicar lo más vencido primero»: reparte el monto en cascada.
 *
 * Es una PROPUESTA editable, no un automático — igual que la comparativa
 * preselecciona el paquete más barato y se puede cambiar (§4.9). Julio puede
 * tener una instrucción del cliente sobre qué factura quiere ver liquidada.
 *
 * Lo que sobra no se mete a la fuerza en la última factura: queda sin aplicar
 * y a la vista. Cuadrar el reparto inflando un renglón dejaría una factura
 * sobrecobrada, que hoy es invisible (§10.5 del plan).
 */
export function repartirEnCascada(monto: number, facturas: readonly FacturaEnCartera[]): Reparto {
  const out: Reparto = {};
  let queda = redondear(monto);
  if (!(queda > 0)) return out;

  for (const i of facturas) {
    if (queda <= 0) break;
    const aplica = redondear(Math.min(queda, i.saldo));
    if (aplica <= 0) continue;
    out[i.factura.id] = aplica;
    queda = redondear(queda - aplica);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Qué cuadra y qué no
// ─────────────────────────────────────────────────────────────────────────────

export interface ResumenAplicacion {
  /** Σ de lo repartido, en la moneda del pago. */
  aplicado: number;
  /**
   * monto − aplicado. **Positivo es válido**: es el «a cuenta» del cliente,
   * el `sinAplicar` del pago (§1.1), y es la razón de que no haya dos
   * formularios distintos (§7.1). Negativo NO: ver `sobreAplicado`.
   */
  sinAplicar: number;
  /** Se está repartiendo más dinero del que entró. Bloquea el guardado. */
  sobreAplicado: boolean;
  /** Cuántas facturas reciben algo. */
  lineas: number;
  /** Cuántas de ellas quedan parcialmente cobradas. */
  parciales: number;
  /** Cuántas quedan liquidadas con este pago. */
  liquidadas: number;
}

/** El restante de una factura después de aplicarle lo que le toca. */
export function restanteDespues(item: FacturaEnCartera, aplica: number): number {
  return redondear(item.saldo - (aplica || 0));
}

/**
 * El pie del formulario: «Aplicado 120,000 · Sin aplicar 0.00 ✓ cuadra».
 *
 * Solo cuenta las facturas que están en la lista ofrecida: un reparto que
 * quedó apuntando a una factura que ya se cobró —otra pestaña, otra persona—
 * no puede sumar al aplicado, o el pie diría que cuadra contra algo que ya
 * no existe.
 */
export function resumenAplicacion(
  monto: number,
  reparto: Reparto,
  facturas: readonly FacturaEnCartera[],
): ResumenAplicacion {
  let aplicado = 0;
  let lineas = 0;
  let parciales = 0;
  let liquidadas = 0;

  for (const i of facturas) {
    const aplica = reparto[i.factura.id];
    if (!(aplica > 0)) continue;
    aplicado = redondear(aplicado + aplica);
    lineas += 1;
    if (restanteDespues(i, aplica) <= TOLERANCIA) liquidadas += 1; else parciales += 1;
  }

  const sinAplicar = redondear((Number.isFinite(monto) ? monto : 0) - aplicado);
  return { aplicado, sinAplicar, sobreAplicado: sinAplicar < -TOLERANCIA, lineas, parciales, liquidadas };
}

/** Lo que el formulario tiene capturado arriba, antes del reparto. */
export interface BorradorPago {
  monto: number;
  moneda: Moneda | '';
  fecha: string;
  banco: string;
}

/**
 * Qué impide registrar el pago. `null` = se puede guardar.
 *
 * El orden importa: se contesta primero lo que está más arriba en la
 * pantalla, para no mandar a revisar el reparto cuando lo que falta es el
 * monto.
 *
 * **La referencia bancaria no está aquí** (tarea 69): «aparece después del
 * pago, no antes». Una referencia inventada se ve igual que una real y
 * descuadra la conciliación de Julio sin que nadie se entere.
 *
 * **Cero aplicaciones tampoco se guarda desde aquí**, y es una decisión de
 * interfaz: el dinero que entra sin cubrir ninguna factura es el anticipo, y
 * ese formulario ya existe —«Registrar entrada de dinero» (tarea 69)— donde
 * además se elige a qué embarque entra, que es lo que lo hace fondear las
 * órdenes de pago (1.1). Un pago nacido aquí sin aplicaciones no tendría
 * embarque y no fondearía nada, aunque se vería igual en la lista.
 */
export function problemaAplicacion(
  b: BorradorPago,
  resumen: ResumenAplicacion,
): string | null {
  if (!b.moneda) return 'Elige la moneda del pago.';
  if (!Number.isFinite(b.monto) || b.monto <= 0) return 'Captura cuánto dinero entró.';
  if (!b.fecha) return 'Captura la fecha en que se movió el dinero.';
  if (!b.banco) return 'Elige a qué cuenta de Vermur entró.';

  if (resumen.sobreAplicado) {
    return `Estás aplicando ${money(resumen.aplicado)} de un pago de ${money(b.monto)}: `
      + `sobran ${money(-resumen.sinAplicar)} que no entraron al banco.`;
  }
  if (resumen.lineas === 0) {
    return 'Elige al menos una factura. Si el dinero todavía no cubre ninguna, '
      + 'regístralo con «Registrar entrada de dinero», que lo liga al embarque y fondea sus pagos.';
  }
  return null;
}

/** El problema de UN renglón: no se puede aplicar más de lo que la factura debe. */
export function problemaDeLinea(item: FacturaEnCartera, aplica: number): string | null {
  if (!(aplica > 0)) return null;
  if (aplica > item.saldo + TOLERANCIA) {
    return `${item.factura.numero} debe ${money(item.saldo)}: aplicarle ${money(aplica)} la dejaría sobrecobrada.`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 · De reparto a aplicaciones
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Las aplicaciones del pago, en el orden en que se ofrecieron.
 *
 * `destinoNumero` se congela aquí (§1.1): el renglón tiene que poder leerse
 * solo en la ficha del pago, sin volver a bajar la factura para saber de qué
 * folio hablaba.
 */
export function aplicacionesDelReparto(
  reparto: Reparto,
  facturas: readonly FacturaEnCartera[],
  ctx: { moneda: Moneda; por: { uid: string; nombre: string }; fecha: string },
): AplicacionPago[] {
  const out: AplicacionPago[] = [];
  for (const i of facturas) {
    const monto = reparto[i.factura.id];
    if (!(monto > 0)) continue;
    out.push({
      destinoTipo: 'factura',
      destinoId: i.factura.id,
      destinoNumero: i.factura.numero,
      monto: redondear(monto),
      moneda: ctx.moneda,
      aplicadaPor: { uid: ctx.por.uid, nombre: ctx.por.nombre, fecha: ctx.fecha },
    });
  }
  return out;
}

/**
 * Los embarques que el pago toca, derivados de las facturas que cubrió.
 *
 * Es lo que `CobroCliente.embarqueId` —un solo string obligatorio— no podía
 * representar: una transferencia que cubre facturas de dos embarques fondea
 * los dos, cada uno por lo que le toca (`entradasDeFondeo`, caso 3).
 */
export function embarquesDelReparto(
  reparto: Reparto,
  facturas: readonly FacturaEnCartera[],
): string[] {
  const out: string[] = [];
  for (const i of facturas) {
    if (!(reparto[i.factura.id] > 0)) continue;
    const e = i.factura.embarqueId;
    if (e && !out.includes(e)) out.push(e);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5 · Al revés: qué pagos cubrieron una factura
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un renglón de «qué pagos cubrieron esta factura» (punto 4 de la tarea).
 *
 * Es la mitad que se puede hacer hoy. La vista completa al revés —un pago con
 * todas sus facturas, su ficha, quitar una aplicación y anular— es P5.
 */
export interface CoberturaDeFactura {
  pagoId: string;
  folio: string;
  fecha: string;
  monto: number;
  moneda: Moneda;
  banco: string | null;
  referencia: string | null;
  /** El pago cubrió más facturas además de esta. */
  compartido: boolean;
  /** Un cobro o depósito viejo, leído como pago, que no tiene documento propio. */
  legacy: boolean;
}

/**
 * Los pagos vivos que aplicaron dinero a esta factura, el más reciente
 * primero.
 *
 * Se lee de la lista unificada de la tarea 67, así que un cobro viejo de
 * `cobros/` y un pago nuevo de `pagos/` se ven igual. Si uno apareciera y el
 * otro no, la lista unificada se rompió.
 *
 * Dos aplicaciones del MISMO pago a la misma factura se suman en un renglón:
 * son un movimiento de dinero, y pintarlas dos veces se leería como dos.
 */
export function coberturaDeFactura(
  facturaId: string,
  pagos: readonly Pago[],
): CoberturaDeFactura[] {
  const out: CoberturaDeFactura[] = [];

  for (const p of pagos) {
    if (p.activo === false) continue;
    const suyas = (p.aplicaciones ?? []).filter(a => a.destinoId === facturaId);
    if (suyas.length === 0) continue;

    const monto = redondear(suyas.reduce((acc, a) => acc + (a.monto ?? 0), 0));
    const destinos = new Set((p.aplicaciones ?? []).map(a => a.destinoId));

    out.push({
      pagoId: p.id,
      folio: p.folio || p.id,
      fecha: p.fecha ?? '',
      monto,
      moneda: p.moneda,
      banco: p.banco ?? null,
      referencia: p.referencia ?? null,
      compartido: destinos.size > 1,
      legacy: !!p.origen && p.origen !== 'app',
    });
  }

  return out.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.folio.localeCompare(b.folio, 'es'));
}
