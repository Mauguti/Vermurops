/**
 * vistaConceptos.ts
 *
 * La lógica pura de la pantalla del catálogo de conceptos (B3).
 *
 * ── Lo más importante: el IVA se DERIVA, no se captura ─────────────────────
 * Cada concepto tiene su reglaIVA y `calcularIVA` decide la tasa según
 * tráfico y ubicación. La pantalla no escribe esa tabla a mano: la GENERA
 * llamando a calcularIVA en las cuatro combinaciones, para que lo que se ve
 * en el catálogo sea exactamente lo que la facturación va a aplicar. Si la
 * regla cambia, la vista cambia sola — no hay dos fuentes que desincronizar.
 *
 * Lógica pura: sin React ni Firestore.
 */

import { calcularIVA } from './calcularIVA';
import type { ReglaIVA, CategoriaConcepto, ConceptoVermur } from '../components/conceptos/ConceptosData';
import type { KanbanQuote } from '../components/quotes/QuotesData';

// ─── La tabla de IVA que produce una regla ────────────────────────────────────

export interface RenglonIVA {
  /** «Importación + destino» */
  combinacion: string;
  trafico: 'impo' | 'expo';
  ubicacion: 'origen' | 'destino';
  /** «16%» · «0%» · «25% al 16% + 75% al 0%» · «16% − ret. 4%» */
  tasaTexto: string;
  /** null = la regla está en 'revisar' y no se puede derivar. */
  tasa: number | null;
}

const COMBINACIONES: { trafico: 'impo' | 'expo'; ubicacion: 'origen' | 'destino'; label: string }[] = [
  { trafico: 'impo', ubicacion: 'destino', label: 'Importación + destino' },
  { trafico: 'impo', ubicacion: 'origen',  label: 'Importación + origen' },
  { trafico: 'expo', ubicacion: 'origen',  label: 'Exportación + origen' },
  { trafico: 'expo', ubicacion: 'destino', label: 'Exportación + destino' },
];

/**
 * Qué IVA produce esta regla en cada combinación. GENERADO con calcularIVA,
 * nunca escrito a mano.
 */
export function derivarTablaIVA(regla: ReglaIVA): RenglonIVA[] {
  return COMBINACIONES.map(c => {
    const r = calcularIVA(regla, { trafico: c.trafico, ubicacion: c.ubicacion });
    if (r === null) {
      return { combinacion: c.label, trafico: c.trafico, ubicacion: c.ubicacion, tasaTexto: 'Sin derivar — regla en revisión', tasa: null };
    }
    let texto: string;
    if (r.split) {
      texto = r.split.map(s => `${s.porcentaje}% al ${s.tasa}%`).join(' + ');
    } else if (r.retencion) {
      texto = `${r.tasa}% − retención ${r.retencion}%`;
    } else {
      texto = `${r.tasa}%`;
    }
    return { combinacion: c.label, trafico: c.trafico, ubicacion: c.ubicacion, tasaTexto: texto, tasa: r.tasa };
  });
}

/** La explicación del caso especial, para leerla junto a la tabla. */
export const NOTA_REGLA: Record<ReglaIVA, string> = {
  espejo: 'Se grava lo que ocurre en territorio nacional: importación grava el destino, exportación grava el origen.',
  aereo_split: 'El flete aéreo tiene tasa efectiva del 4%, que el SAT no admite: se factura en dos líneas, 25% del monto al 16% y 75% al 0%.',
  terrestre_retencion: 'El flete terrestre nacional lleva retención del 4% sobre el 16%.',
  exento: 'Siempre 0%. Los seguros de mercancía son el caso típico.',
  fijo16: 'Siempre 16%: servicio que ocurre en territorio nacional sin depender del tráfico.',
  fijo0: 'Siempre 0%: servicio internacional sin dimensión origen/destino.',
  revisar: 'Pendiente de que Administración defina la regla. Hasta entonces su IVA no se puede derivar y bloqueará la facturación.',
};

// ─── Los contadores del encabezado ────────────────────────────────────────────

export interface ResumenCatalogo {
  total: number;
  activos: number;
  porCategoria: { categoria: CategoriaConcepto; cuantos: number }[];
  /** Los que Administración tiene que resolver. */
  enRevisar: number;
  /** Sin claveProductoSAT o sin claveUnidadSAT: bloquearán el timbrado (Fase B). */
  sinClavesSAT: number;
}

export function resumenCatalogo(conceptos: ConceptoVermur[]): ResumenCatalogo {
  const porCat = new Map<CategoriaConcepto, number>();
  let enRevisar = 0;
  let sinClaves = 0;
  let activos = 0;

  conceptos.forEach(c => {
    porCat.set(c.categoria, (porCat.get(c.categoria) ?? 0) + 1);
    if (c.activo !== false) activos++;
    if (c.reglaIVA === 'revisar') enRevisar++;
    if (!c.claveProductoSAT?.trim() || !c.claveUnidadSAT?.trim()) sinClaves++;
  });

  return {
    total: conceptos.length,
    activos,
    porCategoria: [...porCat.entries()]
      .map(([categoria, cuantos]) => ({ categoria, cuantos }))
      .sort((a, b) => b.cuantos - a.cuantos),
    enRevisar,
    sinClavesSAT: sinClaves,
  };
}

/** ¿Al concepto le falta algo que va a doler después? */
export function pendientesDeConcepto(c: ConceptoVermur): ('regla_iva' | 'claves_sat')[] {
  const p: ('regla_iva' | 'claves_sat')[] = [];
  if (c.reglaIVA === 'revisar') p.push('regla_iva');
  if (!c.claveProductoSAT?.trim() || !c.claveUnidadSAT?.trim()) p.push('claves_sat');
  return p;
}

// ─── El impacto de cambiar la regla ───────────────────────────────────────────

export interface ImpactoConcepto {
  /** Tarifas del catálogo que apuntan a este concepto. */
  tarifas: number;
  /** Cotizaciones que lo usan en alguna línea. */
  cotizaciones: number;
  /** De esas, las que están en una etapa viva del pipeline. */
  cotizacionesVivas: number;
}

const ETAPAS_VIVAS = new Set([
  'solicitud_cliente', 'solicitado_pricing', 'pricing_solicitando',
  'cotizaciones_recibidas', 'consolidada', 'enviada_cliente', 'negociacion',
]);

/**
 * Cuántas cosas usan este concepto. Se enseña ANTES de guardar un cambio de
 * regla: el IVA de un concepto no es un dato del concepto, es un dato de cada
 * factura que se emita con él.
 */
export function impactoConcepto(
  conceptoId: string,
  tarifas: { conceptoId: string }[],
  quotes: KanbanQuote[],
): ImpactoConcepto {
  const enTarifas = tarifas.filter(t => t.conceptoId === conceptoId).length;

  let enQuotes = 0;
  let vivas = 0;
  quotes.forEach(q => {
    const laUsa = (q.servicios ?? []).some(s =>
      (s.conceptos ?? []).some(c => c.conceptoId === conceptoId)
      || (s.cotizacionesProveedor ?? []).some(cp => cp.conceptoId === conceptoId));
    if (!laUsa) return;
    enQuotes++;
    if (ETAPAS_VIVAS.has(q.etapa)) vivas++;
  });

  return { tarifas: enTarifas, cotizaciones: enQuotes, cotizacionesVivas: vivas };
}
