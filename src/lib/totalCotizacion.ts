/**
 * totalCotizacion.ts
 *
 * El total de venta de la cotización: UNA función, para los dos lugares que
 * lo enseñan.
 *
 * ── Qué resuelve ───────────────────────────────────────────────────────────
 * En COT-2026-0034 el encabezado decía «USD 26,550.00 + MXN 70.00» y el
 * desglose «$26,660 USD». Ni el número ni la moneda coincidían, y la
 * diferencia —110 USD— no cuadraba con los 70 pesos, porque eran dos defectos
 * encadenados:
 *
 *   1. El desglose leía `quote.valorTotalConsolidado`, un campo GUARDADO que
 *      ganaba sobre el cálculo. Un total escrito cuando la cotización tenía
 *      otras líneas se quedaba ahí para siempre.
 *   2. Cuando sí calculaba, `calcularTotalConsolidado` sumaba las ventas sin
 *      mirar la moneda y lo rotulaba con `quote.moneda`. Los 70 pesos entraban
 *      como 70 dólares.
 *
 * ── La regla ───────────────────────────────────────────────────────────────
 * Siempre se muestra el CALCULADO, por moneda. El campo guardado no se toca ni
 * se migra —hay cotizaciones vivas que lo traen—, pero deja de mandar: cuando
 * difiere, se dice aparte y con su nombre, «total guardado anteriormente». Un
 * número viejo declarado no engaña; uno viejo disfrazado de actual, sí.
 *
 * Lógica pura: sin React ni Firestore.
 */

import { sumarPorMoneda, monedasConMonto, formatearPorMoneda } from './sumarPorMoneda';
import type { TotalPorMoneda, Moneda } from './sumarPorMoneda';
import type { LineaPlana } from './lineasCotizacion';

export interface TotalDeCotizacion {
  /** Lo calculado de las líneas, por moneda. Nunca un escalar (§4.3). */
  porMoneda: TotalPorMoneda;
  /** Las monedas con movimiento, en orden estable. */
  monedas: Moneda[];
  /** «USD 26,550.00 + MXN 70.00». Vacío si no hay nada. */
  texto: string;
  /** ¿Hay más de una divisa? El pie tiene que decirlo. */
  variasMonedas: boolean;
  /**
   * El valor guardado, SOLO cuando difiere de lo calculado y hay algo que
   * declarar. `null` = no hay nada que aclarar.
   */
  guardadoDistinto: number | null;
}

/**
 * El total de una cotización a partir de sus líneas planas.
 *
 * @param guardado `quote.valorTotalConsolidado`. Se usa para AVISAR, nunca
 *                 para mostrar.
 */
export function totalDeCotizacion(
  lineas: readonly LineaPlana[],
  guardado?: number | null,
): TotalDeCotizacion {
  const porMoneda = sumarPorMoneda(lineas, l => l.venta, l => l.moneda);
  const monedas = monedasConMonto(porMoneda);

  /*
   * El guardado se compara contra el calculado solo cuando hay UNA moneda:
   * con dos, el escalar viejo no tiene contra qué compararse sin convertir, y
   * convertir para decidir si avisar sería inventar la tasa que §4.3 prohíbe.
   * Con varias monedas se avisa siempre que haya un guardado, porque ese
   * número por fuerza mezcló divisas.
   */
  const g = typeof guardado === 'number' && guardado > 0 ? guardado : null;
  let guardadoDistinto: number | null = null;
  if (g !== null) {
    if (monedas.length === 1) {
      const calculado = porMoneda[monedas[0]] ?? 0;
      if (Math.abs(calculado - g) >= 0.01) guardadoDistinto = g;
    } else {
      guardadoDistinto = g;
    }
  }

  return {
    porMoneda,
    monedas,
    texto: monedas.length > 0 ? formatearPorMoneda(porMoneda) : '',
    variasMonedas: monedas.length > 1,
    guardadoDistinto,
  };
}

/** ¿Hay algo que enseñar? Sustituye al viejo `totalConsolidado > 0`. */
export function tieneTotal(t: TotalDeCotizacion): boolean {
  return t.monedas.length > 0;
}

/**
 * El pie que acompaña a un total de varias monedas.
 *
 * Se dice con todas sus letras en vez de dejar que dos números uno junto al
 * otro parezcan sumables.
 */
export const NOTA_VARIAS_MONEDAS =
  'Hay montos en dos divisas: no se suman entre sí. Para compararlos hace falta un tipo de cambio.';
