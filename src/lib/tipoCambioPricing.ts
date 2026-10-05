/**
 * tipoCambioPricing.ts
 *
 * Quién manda en el tipo de cambio de una cotización (tarea 56).
 *
 * ── La decisión ─────────────────────────────────────────────────────────────
 * Gaby, sesión de Administración del 2-oct-2026: «que no se use el TC del SAT
 * o de Banamex, que se use el de pricing». Julio, sobre la consulta automática
 * a Banxico: «no funciona» — y el log demuestra que sí consulta y sí guarda
 * (ver `sprint/reportes/56.md`). Lo que no funciona es su PAPEL: ese número no
 * es el que Vermur usa para cotizar.
 *
 * Así que hay DOS tipos de cambio, y no compiten porque no sirven para lo
 * mismo:
 *
 *   OPERATIVO — el de Pricing. Con él se cotiza y se mide el profit. Se
 *     captura en la cotización, se congela ahí y el embarque lo hereda. Puede
 *     ser un valor directo («nosotros cotizamos a 20.50») o una regla sobre
 *     otra tasa («el de Banamex más cuatro pesos»).
 *
 *   FISCAL — el FIX del DOF de Banxico, que el SAT exige en el CFDI. Vive en
 *     `configuracion/tipoCambio`, lo escribe la Function, y aquí es solo
 *     REFERENCIA: se ve al lado de la captura y no precarga ni calcula nada.
 *     Entra en juego cuando exista el timbrado, no antes.
 *
 * ── Por qué «referencia» tiene que ser de verdad referencia ─────────────────
 * Un botón que precarga el FIX es un botón que la mitad de las veces se
 * aprieta por reflejo, y el 18.19 de Banxico se ve idéntico al 20.50 de
 * Pricing en el renglón del total: la diferencia solo aparece en el margen,
 * semanas después. Si alguien quiere ese número, lo teclea.
 *
 * ── Las cotizaciones viejas no se tocan ─────────────────────────────────────
 * Una cotización que se capturó con fuente Banxico o SAT conserva su tasa
 * congelada: recalcularla reordenaría agentes y contradiría una decisión ya
 * tomada (§4.3). Lo único que se hace es DECIRLO cuando se abre la captura.
 *
 * Lógica pura: sin React ni Firestore.
 */

import { ETIQUETA_FUENTE, type FuenteTipoCambio, type TipoCambioCotizacion } from './monedaComparativa';

/** Modos de captura de la tasa operativa. */
export type ModoCaptura = 'directo' | 'regla';

/**
 * La fuente por defecto de una cotización nueva.
 *
 * `pricing_rate` cubre las dos formas del de Pricing: el valor directo (sin
 * `reglaAplicada`) y la regla sobre otra tasa (con ella). No se agregó una
 * fuente nueva al modelo a propósito: los documentos ya guardados la leerían
 * como desconocida.
 */
export const FUENTE_OPERATIVA_POR_DEFECTO: FuenteTipoCambio = 'pricing_rate';

/** Las que SÍ son tasa operativa de Vermur. */
export const FUENTES_OPERATIVAS: FuenteTipoCambio[] = ['pricing_rate', 'manual'];

/** Tasas de mercado: sirven de base o de referencia, no de tasa operativa. */
export const FUENTES_REFERENCIA: FuenteTipoCambio[] = [
  'sat', 'banxico', 'banamex_compra', 'banamex_venta',
];

export function esFuenteOperativa(fuente: FuenteTipoCambio | undefined | null): boolean {
  return !!fuente && FUENTES_OPERATIVAS.includes(fuente);
}

/**
 * Con qué fuente abre la captura.
 *
 * Una cotización que ya tiene tasa abre con la suya —editar no es volver a
 * empezar—; una nueva abre con la de Pricing.
 */
export function fuenteInicial(tc: TipoCambioCotizacion | null | undefined): FuenteTipoCambio {
  return tc?.fuente ?? FUENTE_OPERATIVA_POR_DEFECTO;
}

/**
 * Con qué pestaña abre la captura.
 *
 * `reglaAplicada` es la huella de que el número salió de una regla: si la
 * tiene, se abre en «regla» para que se vea de dónde venía.
 */
export function modoInicial(tc: TipoCambioCotizacion | null | undefined): ModoCaptura {
  return tc?.reglaAplicada ? 'regla' : 'directo';
}

/**
 * Aviso cuando la tasa guardada viene de una fuente de referencia.
 *
 * No bloquea ni corrige nada: la tasa congelada se queda como está (§4.3).
 * Solo evita que nadie se entere de que esa cotización se hizo con el número
 * del SAT.
 */
export function avisoFuenteReferencia(tc: TipoCambioCotizacion | null | undefined): string | null {
  if (!tc || esFuenteOperativa(tc.fuente)) return null;
  if (!FUENTES_REFERENCIA.includes(tc.fuente)) return null;
  return `Esta cotización se capturó con el tipo de cambio de ${ETIQUETA_FUENTE[tc.fuente]}. `
    + 'El operativo de Vermur es el de Pricing; esta tasa se queda como está.';
}

// ─────────────────────────────────────────────────────────────────────────────
// La referencia de Banxico
// ─────────────────────────────────────────────────────────────────────────────

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «2 oct 2026». Igual que `etiquetaFechaTC`, duplicada aquí para no acoplar. */
function fechaCorta(iso: string): string {
  const p = iso.split('-');
  if (p.length !== 3) return iso;
  const mes = MESES[Number(p[1]) - 1] ?? p[1];
  return `${Number(p[2])} ${mes} ${p[0]}`;
}

export interface ReferenciaBanxico {
  valor: number;
  fechaDeterminacion: string;
}

/**
 * Rótulo informativo del FIX: «FIX Banxico del 2 oct 2026: 18.1903».
 *
 * Devuelve null cuando no hay dato —la Function nunca corrió, o la regla no
 * deja leerlo— para que la captura no pinte un renglón vacío. Un cero no es
 * un tipo de cambio.
 */
export function etiquetaReferenciaBanxico(ref: ReferenciaBanxico | null | undefined): string | null {
  if (!ref || !Number.isFinite(ref.valor) || ref.valor <= 0) return null;
  const valor = ref.valor.toLocaleString('es-MX', {
    minimumFractionDigits: 2, maximumFractionDigits: 4,
  });
  return ref.fechaDeterminacion
    ? `FIX Banxico del ${fechaCorta(ref.fechaDeterminacion)}: ${valor}`
    : `FIX Banxico: ${valor}`;
}
