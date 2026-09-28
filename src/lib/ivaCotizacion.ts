/**
 * ivaCotizacion.ts
 *
 * Conecta `calcularIVA` con las líneas de la cotización.
 *
 * ── Por qué estaba desconectada ────────────────────────────────────────────
 * `calcularIVA` existe desde hace meses con 21 tests y nunca se pudo aplicar:
 * necesitaba `trafico` y `ubicacion`, que no estaban en `ServicioSolicitado`.
 * Era la deuda prioritaria de §6. Al agregarlos para el folio del embarque,
 * queda desbloqueada.
 *
 * ── Qué hace y qué no ──────────────────────────────────────────────────────
 * Calcula el IVA de una línea a partir de la regla de su concepto del catálogo
 * y del tráfico/ubicación de su servicio. NO decide dónde mostrarlo: el
 * desglose en la ficha y en el PDF es trabajo aparte.
 *
 * Devuelve `null` cuando falta el dato para decidir, en vez de asumir 0% o
 * 16%. Un IVA inventado se ve igual de creíble que uno correcto y sale en una
 * factura.
 */

import { calcularIVA, ContextoIVA, ResultadoIVA } from './calcularIVA';
import { ServicioSolicitado } from '../components/quotes/QuotesData';
import type { ConceptoVermur, ReglaIVA } from '../components/conceptos/ConceptosData';
import { resolverTrafico, traficoParaIVA } from './traficoServicio';

export type MotivoSinIVA =
  /** El servicio no declara tráfico y no se pudo derivar de la ruta. */
  | 'sin_trafico'
  /** El servicio no declara dónde ocurre. */
  | 'sin_ubicacion'
  /** La línea no está ligada a un concepto del catálogo. */
  | 'sin_concepto'
  /** La regla del concepto exige captura manual. */
  | 'requiere_revision';

export interface ResultadoIVALinea {
  /** null = no se pudo determinar. Nunca se asume una tasa. */
  iva: ResultadoIVA | null;
  motivo?: MotivoSinIVA;
  detalle?: string;
}

/**
 * IVA de una línea de cotización.
 *
 * @param reglaIVA  Regla del concepto del catálogo (105 conceptos, §4.4).
 * @param servicio  Servicio al que pertenece la línea.
 */
/**
 * Dónde ocurre ESTE concepto, que no siempre es donde ocurre su servicio.
 *
 * ── El bug que cierra ──────────────────────────────────────────────────────
 * La ubicación vivía SOLO en el servicio, así que un marítimo de importación
 * marcado «origen» ponía en 0% a TODOS sus conceptos, incluidos los que
 * ocurren en destino. Sobre la regla espejo (§4.2) eso es IVA de menos.
 *
 * ── Lo que el catálogo ya sabe ─────────────────────────────────────────────
 * Cada concepto trae `aplicaOrigen` y `aplicaDestino`. Cuando declara UNA
 * sola, esa manda: un concepto que solo existe en destino ocurre en destino,
 * esté donde esté marcado el servicio.
 *
 * Cuando declara las dos —o ninguna— el catálogo no sabe distinguir, y se cae
 * al servicio, que es lo que había. No se inventa: se usa el único dato que
 * queda.
 *
 * Alcance real: de los 105 conceptos solo 17 usan la regla espejo (los demás
 * son tasa fija, exentos, retención o «revisar», y no miran la ubicación). De
 * esos 17, ocho declaran un solo lado y quedan resueltos aquí; los nueve
 * restantes siguen dependiendo del servicio. Para ésos hace falta ubicación
 * por renglón, que es modelo nuevo.
 */
export function ubicacionDeLinea(
  concepto: Pick<ConceptoVermur, 'aplicaOrigen' | 'aplicaDestino'> | null | undefined,
  servicio: Pick<ServicioSolicitado, 'ubicacion'>,
): 'origen' | 'destino' | undefined {
  if (concepto) {
    if (concepto.aplicaOrigen && !concepto.aplicaDestino) return 'origen';
    if (concepto.aplicaDestino && !concepto.aplicaOrigen) return 'destino';
  }
  return servicio.ubicacion;
}

export function ivaDeLinea(
  reglaIVA: ReglaIVA | undefined | null,
  servicio: ServicioSolicitado,
  concepto?: Pick<ConceptoVermur, 'aplicaOrigen' | 'aplicaDestino'> | null,
): ResultadoIVALinea {
  if (!reglaIVA) {
    return {
      iva: null,
      motivo: 'sin_concepto',
      detalle: 'La línea no está ligada a un concepto del catálogo, así que no tiene regla de IVA.',
    };
  }

  const { trafico, motivo } = resolverTrafico(servicio);
  if (!trafico) {
    return { iva: null, motivo: 'sin_trafico', detalle: motivo };
  }

  const ubicacion = ubicacionDeLinea(concepto, servicio);
  if (!ubicacion) {
    return {
      iva: null,
      motivo: 'sin_ubicacion',
      detalle: 'Ni el concepto ni el servicio declaran si ocurre en origen o en destino, que es la otra mitad de la regla espejo (§4.2).',
    };
  }

  const contexto: ContextoIVA = {
    trafico: traficoParaIVA(trafico),
    ubicacion,
  };

  const iva = calcularIVA(reglaIVA, contexto);
  if (iva === null) {
    return {
      iva: null,
      motivo: 'requiere_revision',
      detalle: 'El concepto está marcado como «revisar»: su IVA se captura a mano.',
    };
  }

  return { iva };
}

/** Busca la regla de IVA de un concepto del catálogo. */
export function reglaDeConcepto(
  conceptoId: string | null | undefined,
  catalogo: ConceptoVermur[],
): ReglaIVA | null {
  if (!conceptoId) return null;
  return catalogo.find(c => c.id === conceptoId)?.reglaIVA ?? null;
}

/**
 * Monto de IVA sobre una base.
 *
 * El caso del flete aéreo no es una tasa: el SAT no admite el 4% efectivo, así
 * que se factura en dos líneas (25% al 16% + 75% al 0%). Aquí se resuelve el
 * monto total; el desglose en dos renglones es cosa de la factura.
 */
export function montoIVA(base: number, iva: ResultadoIVA): number {
  if (iva.split) {
    const total = iva.split.reduce(
      (acc, s) => acc + (base * s.porcentaje / 100) * (s.tasa / 100),
      0,
    );
    return Math.round(total * 100) / 100;
  }
  return Math.round(base * (iva.tasa / 100) * 100) / 100;
}

/** Retención aplicable, si la regla la define (flete terrestre nacional: 4%). */
export function montoRetencion(base: number, iva: ResultadoIVA): number {
  if (!iva.retencion) return 0;
  return Math.round(base * (iva.retencion / 100) * 100) / 100;
}
