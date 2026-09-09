/**
 * facturacionEmbarque.ts (2.1)
 *
 * Registrar la factura que YA se emitió por fuera.
 *
 * ── Qué es y qué no ────────────────────────────────────────────────────────
 * Vermur no tiene PAC: el timbrado ocurre en otro sistema. Esto no factura,
 * REGISTRA — para que la operación sepa qué se cobró y cuándo vence. Por eso
 * nada de aquí bloquea por un dato fiscal faltante: el documento ya existe, y
 * negarse a registrarlo solo lograría que el cobro viva fuera del sistema.
 *
 * Lo que sí se hace es DERIVAR el IVA en vez de capturarlo (§4.2), y decir
 * claramente cuándo no se pudo derivar. Una tasa inventada se ve idéntica a
 * una correcta hasta que el contador la revisa.
 *
 * Sin React, sin Firestore, sin red.
 */

import type { CargoDetalle } from '../components/shipments/EmbarquesData';
import type { LineaFactura, FacturaCliente } from '../components/facturas/FacturasData';
import type { ConceptoVermur } from '../components/conceptos/ConceptosData';
import type { Moneda } from './sumarPorMoneda';
import { calcularIVA, type ContextoIVA } from './calcularIVA';
import { montoIVA, montoRetencion } from './ivaCotizacion';
import { programarPago } from './calendarioPagos';

// ─────────────────────────────────────────────────────────────────────────────
// 1 · El IVA de una línea del embarque
//
// `calcularIVA` necesita tráfico Y ubicación. El tráfico se conoce (viene del
// folio del embarque); la ubicación —si el servicio ocurre en origen o en
// destino— vive en la cotización y NO se copió al cargo.
//
// ⚠️ DECISIÓN MARCADA (8-sep-2026): cuando falta la ubicación, la línea se
// registra con tasa 0 y un aviso que lo dice, en vez de asumir 16% o 0%.
// Asumir 16% infla la factura registrada; asumir 0% la desinfla; decirlo deja
// que quien la capturó compare contra el documento real, que tiene enfrente.
// La salida de fondo es heredar `ubicacion` del servicio al crear el cargo.
// ─────────────────────────────────────────────────────────────────────────────

export interface ContextoFactura {
  /** Tráfico del embarque, derivado de su folio (VLIM impo, VLEM expo…). */
  trafico: 'impo' | 'expo' | null;
  /** Catálogo, para leer la regla de IVA de cada concepto. */
  conceptos: ConceptoVermur[];
}

export function lineaDeFactura(
  cargo: CargoDetalle,
  ctx: ContextoFactura,
): LineaFactura {
  const base: LineaFactura = {
    cargoId: cargo.id,
    concepto: cargo.concepto,
    conceptoId: cargo.conceptoId,
    subtotal: cargo.monto,
    moneda: cargo.moneda as Moneda,
    tasaIVA: 0,
    montoIVA: 0,
    montoRetencion: 0,
  };

  const concepto = cargo.conceptoId
    ? ctx.conceptos.find(c => c.id === cargo.conceptoId)
    : undefined;

  if (!concepto) {
    return { ...base, avisoIVA: 'La línea no está ligada al catálogo: el IVA no se pudo derivar.' };
  }
  if (!ctx.trafico) {
    return { ...base, avisoIVA: 'El embarque no declara tráfico: el IVA no se pudo derivar.' };
  }
  if (!cargo.ubicacionIVA) {
    return {
      ...base,
      avisoIVA: 'No se sabe si el servicio ocurre en origen o en destino: el IVA no se pudo derivar. Compáralo contra la factura emitida.',
    };
  }

  const contexto: ContextoIVA = { trafico: ctx.trafico, ubicacion: cargo.ubicacionIVA };
  const iva = calcularIVA(concepto.reglaIVA, contexto);

  if (!iva) {
    return { ...base, avisoIVA: `El concepto «${concepto.nombre}» exige revisar el IVA a mano.` };
  }

  return {
    ...base,
    // El split del flete aéreo no es una tasa única: montoIVA lo resuelve, y
    // la tasa que se muestra es la efectiva sobre la base.
    tasaIVA: iva.split ? Math.round((montoIVA(100, iva) / 100) * 10000) / 100 : iva.tasa,
    montoIVA: montoIVA(cargo.monto, iva),
    montoRetencion: montoRetencion(cargo.monto, iva),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · La propuesta de factura
// ─────────────────────────────────────────────────────────────────────────────

export interface PropuestaFactura {
  lineas: LineaFactura[];
  moneda: Moneda;
  subtotal: number;
  iva: number;
  retencion: number;
  total: number;
  /** Lo que hay que revisar antes de registrar. No bloquea. */
  avisos: string[];
}

/**
 * Unión con NOMBRE, no anónima: TypeScript estrecha una unión discriminada
 * con alias de forma más fiable a través de useMemo y de las props.
 */
export type ResultadoPropuesta =
  | { ok: true; propuesta: PropuestaFactura }
  | { ok: false; error: string };

/**
 * Arma la factura a partir de las líneas facturables.
 *
 * §4.3: UNA moneda por factura. Si las líneas mezclan, se rechaza en vez de
 * sumar: un subtotal revuelto se ve creíble y es basura, y aquí acabaría
 * impreso en un cobro.
 */
export function proponerFactura(
  cargos: CargoDetalle[],
  ctx: ContextoFactura,
): ResultadoPropuesta {
  if (cargos.length === 0) {
    return { ok: false, error: 'No hay líneas por facturar: todas están cubiertas o no hay ingresos.' };
  }

  const monedas = [...new Set(cargos.map(c => c.moneda))];
  if (monedas.length > 1) {
    return {
      ok: false,
      error: `Las líneas están en ${monedas.join(' y ')}. Una factura cubre una sola moneda: registra una por cada una.`,
    };
  }

  const lineas = cargos.map(c => lineaDeFactura(c, ctx));
  const r2 = (n: number) => Math.round(n * 100) / 100;

  const subtotal = r2(lineas.reduce((a, l) => a + l.subtotal, 0));
  const iva = r2(lineas.reduce((a, l) => a + l.montoIVA, 0));
  const retencion = r2(lineas.reduce((a, l) => a + l.montoRetencion, 0));

  const sinIVA = lineas.filter(l => l.avisoIVA).length;
  const avisos: string[] = [];
  if (sinIVA > 0) {
    avisos.push(
      `${sinIVA} de ${lineas.length} línea${lineas.length !== 1 ? 's' : ''} sin IVA derivado. Compara el total contra la factura que emitiste.`,
    );
  }

  return {
    ok: true,
    propuesta: {
      lineas,
      moneda: monedas[0] as Moneda,
      subtotal, iva, retencion,
      // La retención se RESTA: es impuesto que el cliente entera al SAT, no
      // dinero que Vermur cobra.
      total: r2(subtotal + iva - retencion),
      avisos,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · El vencimiento
// ─────────────────────────────────────────────────────────────────────────────

export interface CreditoCliente {
  maritimo?: number;
  terrestre?: number;
  aereo?: number;
  /** El campo plano de hoy: un solo número para todas las modalidades. */
  general?: number;
}

/**
 * Días de crédito del cliente PARA ESTA modalidad (§4.6).
 *
 * «No es un número por cliente: varían por tipo de operación. Un mismo
 * cliente puede tener 45 días en marítimo, 20 en aéreo y 15 en terrestre.»
 * Se lee el desglose si existe y se cae al plano, que es lo que hoy tiene
 * `ClienteVermur.dias`.
 */
export function diasCreditoDe(credito: CreditoCliente | null | undefined, modalidad: string): number {
  if (!credito) return 0;
  const porModalidad = modalidad === 'maritimo' ? credito.maritimo
    : modalidad === 'terrestre' ? credito.terrestre
    : modalidad === 'aereo' ? credito.aereo
    : undefined;
  return porModalidad ?? credito.general ?? 0;
}

/**
 * Cuándo vence una factura.
 *
 * El crédito corre en días naturales desde la emisión; el vencimiento se
 * expresa en día hábil por la misma razón que los pagos: el banco no mueve
 * dinero en fin de semana. Reusa calendarioPagos para que cobrar y pagar
 * cuenten los días igual.
 */
export function vencimientoFactura(fechaEmision: string, diasCredito: number): string {
  return programarPago(fechaEmision, diasCredito).fechaPago;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Estado de cobro
// ─────────────────────────────────────────────────────────────────────────────

export interface SaldoFactura {
  cobrado: number;
  saldo: number;
  estado: FacturaCliente['estado'];
  /** Hay cobros en otra moneda que no cuentan para este saldo (§4.3). */
  avisoMoneda?: string;
}

/**
 * Cuánto se ha cobrado de una factura y cuánto falta.
 *
 * Se DERIVA de los cobros, no se guarda: un acumulado que alguien tenga que
 * actualizar se desincroniza el día que un cobro se anula, y entonces el
 * panel dice que la factura está cobrada cuando el dinero no entró.
 */
export function saldoDeFactura(
  factura: Pick<FacturaCliente, 'total' | 'estado' | 'moneda'>,
  cobros: { monto: number; moneda?: Moneda; activo?: boolean }[],
): SaldoFactura {
  /*
   * §4.3: solo cuentan los cobros de LA MONEDA de la factura. Un cobro de
   * 1,000 USD contra una factura de 1,000 MXN la dejaría «liquidada» y nadie
   * volvería a mirarla. Los que no coinciden se reportan aparte en vez de
   * descartarse en silencio: si están ahí, alguien los capturó por algo.
   *
   * La moneda ausente se asume de la factura, por los cobros anteriores a
   * este campo — mismo patrón de fallback de §3.
   */
  const vivos = cobros.filter(c => c.activo !== false);
  const deLaMoneda = vivos.filter(c => (c.moneda ?? factura.moneda) === factura.moneda);
  const enOtraMoneda = vivos.length - deLaMoneda.length;

  // La suma es de una sola moneda por construcción: el filtro de arriba lo
  // garantiza, y por eso no pasa por sumarPorMoneda.
  const cobrado = Math.round(
    deLaMoneda.reduce((a, c) => a + c.monto, 0) * 100,
  ) / 100;
  const saldo = Math.round((factura.total - cobrado) * 100) / 100;

  const estado: FacturaCliente['estado'] =
    factura.estado === 'cancelada' ? 'cancelada'
    // Tolerancia de un peso: los redondeos de IVA dejan centavos que no son
    // una deuda y nadie va a perseguir.
    : saldo <= 1 ? 'cobrada'
    : cobrado > 0 ? 'cobrada_parcial'
    : 'emitida';

  return {
    cobrado, saldo, estado,
    ...(enOtraMoneda > 0
      ? { avisoMoneda: `${enOtraMoneda} cobro(s) en otra moneda no cuentan para el saldo de esta factura en ${factura.moneda}.` }
      : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5 · El tráfico del embarque
//
// El embarque no guarda `trafico` como campo: lo codifica el prefijo de su
// folio (VLIM impo marítimo, VLEM expo marítimo, VLIT impo terrestre…). Se
// lee de ahí en vez de duplicarlo, por la misma razón de siempre: un dato
// duplicado es un dato que se desincroniza.
// ─────────────────────────────────────────────────────────────────────────────

export function traficoDeFolio(folio: string): 'impo' | 'expo' | null {
  const prefijo = folio.split('-')[0]?.toUpperCase() ?? '';
  // VL + I/E + modalidad. La serie provisional «VL-» no dice el tráfico.
  if (!/^VL[IE][MTA]$/.test(prefijo)) return null;
  return prefijo[2] === 'I' ? 'impo' : 'expo';
}
