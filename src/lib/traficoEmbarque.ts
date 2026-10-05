/**
 * traficoEmbarque.ts
 *
 * El tráfico (importación / exportación) de un EMBARQUE, y con él la fecha
 * que cierra su mes.
 *
 * ── Por qué hace falta (tarea 59, 5-oct-2026) ──────────────────────────────
 * Julio hace los cierres de mes por importación / exportación y por modalidad,
 * y desde la lista de Embarques el tráfico no se veía en ninguna parte: está
 * en el prefijo del folio, que hay que saber leer, y en los embarques cuyo
 * folio viene de Magaya (`BOL 9016543`, `SHP-26-0001`) no está ni ahí.
 *
 * No se agrega un campo `trafico` al embarque: se DERIVA, por la misma razón
 * que `traficoDeFolio` ya existía en vez de duplicarlo (§4.14 — un dato
 * duplicado es un dato que se desincroniza). Dos fuentes, en este orden:
 *
 *   1. **El folio** (`traficoDeFolio`): VLIM es impo marítimo, VLET expo
 *      terrestre. Es el dato más fuerte porque lo reservó la serie al abrir
 *      el embarque (§4.15) y es lo que se imprime.
 *   2. **La ruta** (`resolverTrafico`): destino en México es importación,
 *      origen en México es exportación (§4.2). Es la MISMA derivación que ya
 *      usan la cotización y el IVA; aquí solo se le pasan los puertos del
 *      embarque en vez de los del servicio.
 *
 * Y si ninguna de las dos alcanza, `null`: ante la duda no se inventa el
 * dato. Un embarque marcado «—» se corrige; uno clasificado mal se cuenta en
 * el cierre del mes equivocado.
 *
 * Lógica pura: sin React ni Firestore.
 */

import { traficoDeFolio } from './facturacionEmbarque';
import { resolverTrafico, traficoParaIVA } from './traficoServicio';

/** Mismo vocabulario corto que `traficoDeFolio` y `calcularIVA`. */
export type TraficoEmbarque = 'impo' | 'expo';

/** De dónde salió. Importa para saber cuánto confiar en la clasificación. */
export type FuenteTraficoEmbarque = 'folio' | 'ruta' | 'desconocido';

export interface TraficoResuelto {
  trafico: TraficoEmbarque | null;
  fuente: FuenteTraficoEmbarque;
  /** Para el tooltip: qué se leyó. */
  detalle: string;
}

export const ETIQUETA_TRAFICO: Record<TraficoEmbarque, string> = {
  impo: 'Importación',
  expo: 'Exportación',
};

/**
 * Lo mínimo que este módulo necesita de un embarque. Estructural a propósito:
 * `EmbarqueCompleto` lo satisface, y los tests no tienen que construir uno
 * entero para probar una regla de tres líneas.
 */
export interface EmbarqueParaTrafico {
  folio?: string;
  ruta?: {
    origen?: { puertoCarga?: string };
    destino?: { puertoDescarga?: string };
  };
  fechas?: { salida?: string; arribo?: string };
}

/** Tráfico del embarque: primero el folio, luego la ruta, y si no, null. */
export function traficoDeEmbarque(e: EmbarqueParaTrafico): TraficoResuelto {
  const folio = (e.folio ?? '').trim();
  const porFolio = folio ? traficoDeFolio(folio) : null;
  if (porFolio) {
    return {
      trafico: porFolio,
      fuente: 'folio',
      detalle: `Del folio ${folio}`,
    };
  }

  const origen = e.ruta?.origen?.puertoCarga ?? '';
  const destino = e.ruta?.destino?.puertoDescarga ?? '';
  const r = resolverTrafico({ ruta: { origen, destino } });
  if (r.trafico) {
    return {
      trafico: traficoParaIVA(r.trafico),
      fuente: 'ruta',
      detalle: `Derivado de la ruta ${origen || '—'} → ${destino || '—'}`,
    };
  }

  return {
    trafico: null,
    fuente: 'desconocido',
    detalle: r.motivo
      ?? 'El folio no usa una serie de Vermur y la ruta no permite deducir el tráfico.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// El mes de cierre
//
// Julio cierra el mes por la fecha en que la operación ocurrió en México, que
// es la misma dimensión de la regla espejo del IVA (§4.2):
//
//   Importación → la mercancía LLEGA a México  → fecha de ARRIBO (ETA)
//   Exportación → la mercancía SALE de México  → fecha de SALIDA (ETD)
//
// Es una sola fecha por embarque, no las dos: si un mismo embarque cayera en
// el cierre de dos meses, los totales de Julio no cuadrarían con ninguno.
//
// Tráfico desconocido → se usa el arribo, que es lo que la lista ya trae por
// omisión en el rango de fechas. La columna «Tráfico» lo enseña como «—» para
// que se pueda corregir en vez de contarse a ciegas.
// ─────────────────────────────────────────────────────────────────────────────

export function campoDeCierre(trafico: TraficoEmbarque | null): 'arribo' | 'salida' {
  return trafico === 'expo' ? 'salida' : 'arribo';
}

export interface CierreDelEmbarque {
  trafico: TraficoEmbarque | null;
  campo: 'arribo' | 'salida';
  /** YYYY-MM-DD, o '' si el embarque no tiene esa fecha capturada. */
  fecha: string;
  /** YYYY-MM, o '' si no hay fecha. */
  mes: string;
}

export function cierreDelEmbarque(e: EmbarqueParaTrafico): CierreDelEmbarque {
  const { trafico } = traficoDeEmbarque(e);
  const campo = campoDeCierre(trafico);
  const fecha = (e.fechas?.[campo] ?? '').slice(0, 10);
  return { trafico, campo, fecha, mes: fecha.slice(0, 7) };
}

/** Atajo para el filtro: el YYYY-MM con el que este embarque cierra. */
export function mesDeCierre(e: EmbarqueParaTrafico): string {
  return cierreDelEmbarque(e).mes;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** 'octubre 2026' a partir de '2026-10'. Devuelve el crudo si no es un mes. */
export function etiquetaMes(mes: string): string {
  if (!/^\d{4}-\d{2}$/.test(mes)) return mes;
  const i = Number(mes.slice(5, 7)) - 1;
  return MESES[i] ? `${MESES[i]} ${mes.slice(0, 4)}` : mes;
}

/**
 * Los meses de cierre que de verdad aparecen en los embarques, del más
 * reciente al más viejo. Para el selector: ofrecer un mes vacío es ofrecer
 * una lista vacía.
 */
export function mesesDeCierrePresentes(embarques: readonly EmbarqueParaTrafico[]): string[] {
  const meses = new Set<string>();
  embarques.forEach(e => {
    const m = mesDeCierre(e);
    if (m) meses.add(m);
  });
  return [...meses].sort().reverse();
}
