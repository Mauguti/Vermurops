/**
 * visibilidadCotizacion.ts
 *
 * Qué ve cada rol dentro de una cotización.
 *
 * ── De dónde sale ──────────────────────────────────────────────────────────
 * Sesión de feedback del 30-ago-2026. Gabi, gerente de ventas: «me meto al
 * sistema y veo un sistema para todo Vermur, menos para mí. Yo estoy agregada
 * en los módulos de los demás».
 *
 * Ventas ve la cotización y el margen de la operación. No ve el desglose por
 * concepto, ni los proveedores, ni los costos, ni los profits individuales, ni
 * los adjuntos de tarifas. Textual: «que vean la coti, o sea, la información
 * que tiene una cotización, y el margen. Eso es todo».
 *
 * Lógica pura: sin React ni Firestore.
 */

import { UserRole } from '../auth/users';
import { PipelineStageId } from '../components/quotes/QuotesData';

// ─── Qué secciones ve cada rol ────────────────────────────────────────────────

export interface VisibilidadFicha {
  /** Tabla de conceptos con costos, proveedores y profit por línea. */
  desglosePorConcepto: boolean;
  /**
   * Tabla de conceptos SOLO con nombre y precio de venta (sep-2026).
   * Es lo que Ventas necesita para hablar con el cliente: qué lleva la
   * cotización y cuánto cuesta cada cosa — sin el desglose interno.
   */
  ventaPorConcepto: boolean;
  /** Nombre y datos de los proveedores cotizados. */
  proveedores: boolean;
  /** Comparativa de agentes (costos de proveedor lado a lado). */
  comparativaAgentes: boolean;
  /** Catálogo de tarifas dentro de la ficha. */
  catalogoTarifas: boolean;
  /** Adjuntos de las tarifas (correos, PDFs del proveedor). */
  adjuntosTarifa: boolean;
  /** Margen de la operación completa, sin desglosar. */
  margenGeneral: boolean;
  /** Línea del tiempo de etapas. */
  lineaTiempo: boolean;
}

/**
 * Ventas es el único rol restringido. Los demás trabajan la cotización por
 * dentro y necesitan el desglose para hacer su trabajo.
 */
export function visibilidadDe(rol: UserRole | undefined | null): VisibilidadFicha {
  if (rol === 'ventas') {
    return {
      desglosePorConcepto: false,
      ventaPorConcepto: true,
      proveedores: false,
      comparativaAgentes: false,
      catalogoTarifas: false,
      adjuntosTarifa: false,
      margenGeneral: true,
      lineaTiempo: true,
    };
  }
  return {
    desglosePorConcepto: true,
    ventaPorConcepto: true,
    proveedores: true,
    comparativaAgentes: true,
    catalogoTarifas: true,
    adjuntosTarifa: true,
    margenGeneral: true,
    lineaTiempo: true,
  };
}

// ─── Línea del tiempo por rol ─────────────────────────────────────────────────

/**
 * Etapas internas de Pricing. Para Ventas se colapsan en una sola —«En
 * pricing»— porque no aportan a su seguimiento: lo que necesita saber es que
 * está con Pricing, no en cuál de los tres pasos internos va.
 */
const ETAPAS_INTERNAS_PRICING: PipelineStageId[] = [
  'pricing_solicitando',
  'cotizaciones_recibidas',
  'consolidada',
];

export interface EtapaVisible {
  id: string;
  label: string;
  /** Etapas reales que este paso representa. */
  cubre: PipelineStageId[];
}

/** Línea del tiempo que ve Ventas: cinco pasos, sin el detalle de Pricing. */
export const LINEA_TIEMPO_VENTAS: EtapaVisible[] = [
  { id: 'solicitud',   label: 'Solicitud',          cubre: ['solicitud_cliente'] },
  { id: 'en_pricing',  label: 'En pricing',         cubre: ['solicitado_pricing', ...ETAPAS_INTERNAS_PRICING] },
  { id: 'enviada',     label: 'Enviada al cliente', cubre: ['enviada_cliente'] },
  { id: 'negociacion', label: 'Negociación',        cubre: ['negociacion'] },
  { id: 'cierre',      label: 'Ganada / Perdida',   cubre: ['ganada', 'perdida'] },
];

/** ¿La línea del tiempo de este rol se colapsa? Solo la de Ventas. */
export function lineaTiempoColapsada(rol: UserRole | undefined | null): boolean {
  return rol === 'ventas';
}

/** En qué paso de la línea de Ventas cae una etapa real. */
export function pasoDeVentas(etapa: PipelineStageId): EtapaVisible | null {
  return LINEA_TIEMPO_VENTAS.find(p => p.cubre.includes(etapa)) ?? null;
}

/** Índice del paso actual, para pintar el avance. -1 si no cae en ninguno. */
export function indicePasoVentas(etapa: PipelineStageId): number {
  return LINEA_TIEMPO_VENTAS.findIndex(p => p.cubre.includes(etapa));
}

/** ¿Esta etapa es interna de Pricing y por tanto no se le nombra a Ventas? */
export function esEtapaInternaPricing(etapa: PipelineStageId): boolean {
  return ETAPAS_INTERNAS_PRICING.includes(etapa);
}

// ─── Pestañas de la ficha ─────────────────────────────────────────────────────

export type TabFicha = 'info' | 'servicios' | 'actividades' | 'historial' | 'chat';

/**
 * Pestañas que ve cada rol.
 *
 * Ventas SÍ ve «Servicios» (sep-2026), pero en su versión: conceptos con su
 * precio de venta y el total. Lo que no ve es el contenido interno — costos,
 * profit, margen por línea, proveedores, comparativa y catálogo de tarifas —
 * gobernado por visibilidadDe(), no por esta lista.
 */
export function tabsVisibles(rol: UserRole | undefined | null): TabFicha[] {
  return ['info', 'servicios', 'actividades', 'historial', 'chat'];
}
