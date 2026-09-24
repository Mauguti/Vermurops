/**
 * proximosPasos.ts
 *
 * Qué sigue en una cotización: la línea de etapas que ve cada rol, la
 * siguiente etapa por orden natural, y quién puede darla.
 *
 * ── De dónde sale ──────────────────────────────────────────────────────────
 * Feedback del cliente (23-sep-2026): las acciones estaban hasta abajo de la
 * ficha y para usarlas había que recorrer toda la página. Piden el patrón de
 * Salesforce: arriba de las pestañas, las etapas en línea, la acción que
 * sigue como botón principal y, en una línea, qué falta para avanzar.
 *
 * Aquí vive la parte que se puede fijar con tests. El componente
 * (`components/quotes/ProximosPasos.tsx`) solo pinta lo que esto decide.
 *
 * ── Lo que NO decide ───────────────────────────────────────────────────────
 * Si el rol PUEDE avanzar lo dice la máquina de estados
 * (`transicionesDisponibles`), y si la cotización ESTÁ LISTA lo dice
 * `prontitudCotizacion`. Esto recibe ambas respuestas y arma la frase.
 */

import type { PipelineStageId } from '../components/quotes/QuotesData';
import type { UserRole } from '../auth/users';
import {
  LINEA_TIEMPO_VENTAS, lineaTiempoColapsada, type EtapaVisible,
} from './visibilidadCotizacion';
import { rolesQuePueden } from './stateMachine';

// ─── La línea de etapas ───────────────────────────────────────────────────────

/**
 * Lo que ven los roles que trabajan la cotización por dentro: las tres
 * etapas internas de Pricing, desglosadas. Ventas sigue viendo sus cinco
 * pasos (`LINEA_TIEMPO_VENTAS`): a Ventas le importa que está con Pricing,
 * no en cuál paso interno va.
 *
 * Los labels son cortos a propósito: la franja pinta hasta ocho pasos en una
 * sola línea.
 */
export const LINEA_TIEMPO_INTERNA: EtapaVisible[] = [
  { id: 'solicitud',   label: 'Solicitud',   cubre: ['solicitud_cliente'] },
  { id: 'a_pricing',   label: 'A Pricing',   cubre: ['solicitado_pricing'] },
  { id: 'cotizando',   label: 'Cotizando',   cubre: ['pricing_solicitando'] },
  { id: 'recibidas',   label: 'Recibidas',   cubre: ['cotizaciones_recibidas'] },
  { id: 'consolidada', label: 'Consolidada', cubre: ['consolidada'] },
  { id: 'enviada',     label: 'Enviada',     cubre: ['enviada_cliente'] },
  { id: 'negociacion', label: 'Negociación', cubre: ['negociacion'] },
  { id: 'cierre',      label: 'Ganada',      cubre: ['ganada', 'perdida'] },
];

/** La línea que le toca a cada rol. */
export function lineaDeEtapas(rol: UserRole | undefined | null): EtapaVisible[] {
  return lineaTiempoColapsada(rol) ? LINEA_TIEMPO_VENTAS : LINEA_TIEMPO_INTERNA;
}

/** Índice del paso que cubre la etapa. -1 si ninguno. */
export function indiceEnLinea(linea: EtapaVisible[], etapa: PipelineStageId): number {
  return linea.findIndex(p => p.cubre.includes(etapa));
}

// ─── La siguiente etapa ───────────────────────────────────────────────────────

/**
 * Para cada etapa, hacia dónde se avanza, en orden de preferencia. La
 * primera que el rol tenga disponible es el botón principal.
 *
 * Vivía en FichaCotizacion como FORWARD_TARGETS; se movió aquí para que la
 * franja y la ficha lean la misma tabla.
 */
export const HACIA_ADELANTE: Partial<Record<PipelineStageId, PipelineStageId[]>> = {
  solicitud_cliente:      ['solicitado_pricing'],
  solicitado_pricing:     ['pricing_solicitando'],
  pricing_solicitando:    ['cotizaciones_recibidas'],
  cotizaciones_recibidas: ['consolidada'],
  consolidada:            ['enviada_cliente'],
  enviada_cliente:        ['negociacion'],
  negociacion:            ['ganada'],
};

/**
 * Cómo se llama el botón y cómo se lee el paso en la línea «Siguiente: …».
 * El texto del botón es un verbo en imperativo; el de «siguiente», la
 * acción en infinitivo, que se lee igual la dé quien la dé.
 */
export const ACCION_DE_AVANCE: Partial<Record<PipelineStageId, { boton: string; siguiente: string }>> = {
  solicitado_pricing:     { boton: 'Enviar a Pricing',        siguiente: 'enviar la solicitud a Pricing' },
  pricing_solicitando:    { boton: 'Iniciar cotización',      siguiente: 'iniciar la cotización' },
  cotizaciones_recibidas: { boton: 'Cotizaciones recibidas',  siguiente: 'registrar las cotizaciones de los proveedores' },
  consolidada:            { boton: 'Consolidar cotización',   siguiente: 'consolidar la cotización' },
  enviada_cliente:        { boton: 'Enviar al cliente',       siguiente: 'enviar la cotización al cliente' },
  negociacion:            { boton: 'Iniciar negociación',     siguiente: 'la respuesta del cliente: negociar o marcar ganada' },
  ganada:                 { boton: 'Marcar ganada',           siguiente: 'marcar la cotización como ganada' },
};

const NOMBRE_AREA: Record<UserRole, string> = {
  ventas: 'Ventas',
  pricing: 'Pricing',
  operaciones: 'Operaciones',
  administracion: 'Administración',
  admin: 'Administración',
};

/**
 * A quién le toca una transición, para decirlo. Admin puede todo y no se
 * nombra: «le toca a Ventas o Administración» no le dice nada a nadie.
 */
export function aQuienLeToca(desde: PipelineStageId, hacia: PipelineStageId): string | null {
  const nombres = [...new Set(
    rolesQuePueden(desde, hacia).filter(r => r !== 'admin').map(r => NOMBRE_AREA[r]),
  )];
  if (nombres.length === 0) return null;
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(', ')} o ${nombres[nombres.length - 1]}`;
}

export interface ProximoPaso {
  /** Etapa a la que se avanzaría por orden natural. Null si ya terminó. */
  hacia: PipelineStageId | null;
  /** Texto del botón principal. Null si no hay avance para este rol. */
  boton: string | null;
  /** Lo que va después de «Siguiente:». */
  siguiente: string;
  /** La transición es de este rol según la máquina de estados. */
  esDeEsteRol: boolean;
  /**
   * La máquina la dio como disponible AHORA (rol + validación de negocio).
   * `esDeEsteRol && !disponible` = le toca a quien mira, pero la cotización
   * no cumple algo: se explica qué, no se dice «le toca a otro».
   */
  disponible: boolean;
  /** Cuando no es de este rol: a qué área le toca. */
  leTocaA: string | null;
  /** Ganada o perdida: ya no hay siguiente. */
  terminal: boolean;
}

/**
 * El siguiente paso desde la etapa actual, para el rol que mira.
 *
 * `disponibles` viene de `transicionesDisponibles`, que ya aplicó rol y
 * validaciones de negocio. Si el rol tiene alguna salida hacia adelante,
 * esa es el botón. Si no, la línea igual dice qué sigue y a quién le toca:
 * la diferencia entre «no puedo avanzar» y «no sé por qué no puedo».
 */
export function proximoPaso(
  etapa: PipelineStageId,
  rol: UserRole,
  disponibles: PipelineStageId[],
): ProximoPaso {
  if (etapa === 'ganada') {
    return {
      hacia: null, boton: null, esDeEsteRol: false, disponible: false, leTocaA: null, terminal: true,
      siguiente: 'nada — la cotización se ganó y el embarque se generó en automático',
    };
  }
  if (etapa === 'perdida') {
    return {
      hacia: null, boton: null, esDeEsteRol: false, disponible: false, leTocaA: null, terminal: true,
      siguiente: 'nada — la cotización se marcó como perdida',
    };
  }

  const candidatas = HACIA_ADELANTE[etapa] ?? [];
  const delRol = candidatas.find(t => disponibles.includes(t)) ?? null;
  const hacia = delRol ?? candidatas[0] ?? null;
  const accion = hacia ? ACCION_DE_AVANCE[hacia] : undefined;
  const esDeEsteRol = hacia !== null && rolesQuePueden(etapa, hacia).includes(rol);

  return {
    hacia,
    boton: esDeEsteRol && accion ? accion.boton : null,
    siguiente: accion?.siguiente ?? 'sin definir',
    esDeEsteRol,
    disponible: delRol !== null,
    leTocaA: !esDeEsteRol && hacia ? aQuienLeToca(etapa, hacia) : null,
    terminal: false,
  };
}
