/**
 * impuestoLinea.ts
 *
 * El impuesto de cada renglón de la cotización: se elige AL COTIZAR, no
 * después.
 *
 * ── Por qué se elige por renglón ───────────────────────────────────────────
 * Lo más pedido de la junta, con dos casos reales que no admiten una regla
 * global:
 *
 *   El seguro de mercancía unos clientes lo piden con IVA y otros sin IVA.
 *   A los agentes se les cotiza el total con IVA incluido, pero se factura
 *   antes de IVA, y al pasar a embarque hay que corregir la tasa.
 *
 * ── El catálogo ya sabe la mitad ───────────────────────────────────────────
 * Los 105 conceptos traen `reglaIVA` y `calcularIVA` la resuelve con el
 * tráfico y la ubicación del servicio (regla espejo, §4.2). Eso PRECARGA el
 * renglón; no lo congela. Lo que el usuario capture manda sobre lo derivado,
 * porque el que sabe si este cliente quiere el seguro con IVA es Pricing, no
 * el catálogo.
 *
 * ── Lo que no se inventa ───────────────────────────────────────────────────
 * Cuando el servicio no declara tráfico o ubicación, o el concepto está
 * marcado «revisar», NO se asume 16% ni 0%: la línea queda indeterminada y lo
 * dice. Un IVA inventado se ve igual de creíble que uno correcto y sale en una
 * factura.
 *
 * Dos reglas del catálogo no caben en las tres opciones, y se conservan como
 * derivadas:
 *   aereo_split          el SAT no admite el 4% efectivo del flete aéreo: se
 *                        factura 25% al 16% + 75% al 0%.
 *   terrestre_retencion  16% con retención del 4%.
 * Elegir una opción a mano las reemplaza, y la pantalla lo dice.
 *
 * Lógica pura: sin React ni Firestore.
 */

import type { ReglaIVA } from '../components/conceptos/ConceptosData';
import type { ServicioSolicitado } from '../components/quotes/QuotesData';
import { ivaDeLinea, montoIVA, montoRetencion } from './ivaCotizacion';

/** Lo mínimo que pidió el cliente. `exento` no es lo mismo que 0%. */
export type OpcionImpuesto = 'iva16' | 'iva0' | 'exento';

export const OPCIONES_IMPUESTO: OpcionImpuesto[] = ['iva16', 'iva0', 'exento'];

export const ETIQUETA_IMPUESTO: Record<OpcionImpuesto, string> = {
  iva16: 'IVA 16%',
  iva0: 'IVA 0%',
  exento: 'Exento',
};

/**
 * `exento` y `iva0` dan el mismo dinero y NO son lo mismo para el SAT: el
 * exento está fuera del objeto del impuesto, el 0% está dentro con tasa cero.
 * Por eso son dos opciones y no una.
 */
export const TASA_DE_OPCION: Record<OpcionImpuesto, number> = {
  iva16: 16,
  iva0: 0,
  exento: 0,
};

export type EspecialImpuesto = 'aereo_split' | 'terrestre_retencion';

export interface ImpuestoLinea {
  /** null cuando la regla del catálogo no cabe en las tres opciones. */
  opcion: OpcionImpuesto | null;
  /** Porcentaje. `null` = indeterminado: no se asume ninguna. */
  tasa: number | null;
  origen: 'capturado' | 'derivado' | 'indeterminado';
  especial?: EspecialImpuesto;
  /** Porcentaje de retención, cuando la regla la trae. */
  retencion?: number;
  /** Por qué quedó indeterminado, o qué hace el caso especial. */
  detalle?: string;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export const TEXTO_ESPECIAL: Record<EspecialImpuesto, string> = {
  aereo_split: 'Flete aéreo: 25% al 16% + 75% al 0%, porque el SAT no admite la tasa efectiva del 4%.',
  terrestre_retencion: 'Flete terrestre nacional: 16% con retención del 4%.',
};

/**
 * El impuesto de una línea.
 *
 * @param capturado  Lo que el usuario eligió en el renglón. Manda sobre todo.
 * @param reglaIVA   Regla del concepto del catálogo.
 * @param servicio   De donde salen tráfico y ubicación.
 */
export function impuestoDeLinea(
  capturado: OpcionImpuesto | null | undefined,
  reglaIVA: ReglaIVA | null | undefined,
  servicio: ServicioSolicitado,
): ImpuestoLinea {
  if (capturado) {
    return { opcion: capturado, tasa: TASA_DE_OPCION[capturado], origen: 'capturado' };
  }

  if (reglaIVA === 'exento') {
    return { opcion: 'exento', tasa: 0, origen: 'derivado' };
  }

  const r = ivaDeLinea(reglaIVA, servicio);
  if (!r.iva) {
    return { opcion: null, tasa: null, origen: 'indeterminado', detalle: r.detalle };
  }

  if (r.iva.split) {
    return {
      opcion: null,
      // Tasa efectiva (4%), solo para enseñarla. El monto sale del split.
      tasa: redondear(r.iva.split.reduce((a, s) => a + (s.porcentaje / 100) * s.tasa, 0)),
      origen: 'derivado',
      especial: 'aereo_split',
      detalle: TEXTO_ESPECIAL.aereo_split,
    };
  }

  if (r.iva.retencion) {
    return {
      opcion: r.iva.tasa === 16 ? 'iva16' : 'iva0',
      tasa: r.iva.tasa,
      origen: 'derivado',
      especial: 'terrestre_retencion',
      retencion: r.iva.retencion,
      detalle: TEXTO_ESPECIAL.terrestre_retencion,
    };
  }

  return {
    opcion: r.iva.tasa === 16 ? 'iva16' : 'iva0',
    tasa: r.iva.tasa,
    origen: 'derivado',
  };
}

/** Lo que se cobra de impuesto sobre una base. Indeterminado = 0 y se avisa. */
export function montoImpuesto(base: number, imp: ImpuestoLinea): number {
  if (imp.tasa === null) return 0;
  if (imp.especial === 'aereo_split') {
    // 25% del monto al 16%; el otro 75% va al 0%. Es el desglose que el SAT
    // exige, no un redondeo de la tasa efectiva.
    return redondear(base * 0.25 * 0.16);
  }
  return redondear(base * (imp.tasa / 100));
}

/** Lo que se retiene, cuando aplica. Se resta del cobro, no se suma. */
export function montoRetenido(base: number, imp: ImpuestoLinea): number {
  if (!imp.retencion) return 0;
  return redondear(base * (imp.retencion / 100));
}

// ─── Totales ──────────────────────────────────────────────────────────────────

export interface TotalesImpuesto {
  moneda: string;
  subtotal: number;
  impuestos: number;
  retenciones: number;
  total: number;
  /** Cuántas líneas no pudieron determinar su impuesto. */
  indeterminadas: number;
}

export interface LineaConImpuesto {
  moneda: string;
  /** La base: lo que se le cobra al cliente. */
  venta: number;
  impuesto: ImpuestoLinea;
}

/**
 * Subtotal, impuestos y total POR MONEDA (§4.3: nunca se suman entre sí).
 *
 * `indeterminadas` no es cosmético: un total que ignoró en silencio dos líneas
 * sin tasa se ve idéntico a uno completo.
 */
export function totalesConImpuesto(lineas: LineaConImpuesto[]): TotalesImpuesto[] {
  const porMoneda = new Map<string, TotalesImpuesto>();

  lineas.forEach(l => {
    const t = porMoneda.get(l.moneda) ?? {
      moneda: l.moneda, subtotal: 0, impuestos: 0, retenciones: 0, total: 0, indeterminadas: 0,
    };
    t.subtotal = redondear(t.subtotal + l.venta);
    t.impuestos = redondear(t.impuestos + montoImpuesto(l.venta, l.impuesto));
    t.retenciones = redondear(t.retenciones + montoRetenido(l.venta, l.impuesto));
    if (l.impuesto.tasa === null) t.indeterminadas++;
    porMoneda.set(l.moneda, t);
  });

  return [...porMoneda.values()].map(t => ({
    ...t,
    total: redondear(t.subtotal + t.impuestos - t.retenciones),
  }));
}

export { montoIVA, montoRetencion };
