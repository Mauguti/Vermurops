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
  /**
   * Tarea 28 · Ubicación capturada POR RENGLÓN. Si está, manda sobre todo:
   * es una decisión explícita de Pricing para esta línea.
   */
  ubicacionDelConcepto?: 'origen' | 'destino',
): 'origen' | 'destino' | undefined {
  // 1. Captura explícita del renglón (tarea 28): manda.
  if (ubicacionDelConcepto) return ubicacionDelConcepto;
  // 2. El catálogo lo resuelve a un solo lado.
  if (concepto) {
    if (concepto.aplicaOrigen && !concepto.aplicaDestino) return 'origen';
    if (concepto.aplicaDestino && !concepto.aplicaOrigen) return 'destino';
  }
  // 3. Respaldo: la ubicación vieja del servicio.
  return servicio.ubicacion;
}

/**
 * ¿Esta regla MIRA el tráfico y la ubicación?
 *
 * Solo una lo hace: la regla espejo. `calcularIVA` ignora el contexto en las
 * demás —fijo16, fijo0, exento, aereo_split y terrestre_retencion devuelven lo
 * mismo pase lo que pase— y «revisar» se captura a mano.
 *
 * ── El bug que cierra (1b) ─────────────────────────────────────────────────
 * `ivaDeLinea` exigía tráfico Y ubicación ANTES de mirar la regla, así que un
 * concepto de tasa fija quedaba «Sin determinar» por faltarle un dato que su
 * regla nunca iba a leer. Y la ubicación NO la escribe ningún camino de alta
 * —ni el formulario de solicitud, ni «Agregar servicio», ni el alta rápida del
 * Kanban—: solo se pone a mano en Información → Operación. O sea que en una
 * cotización recién nacida el impuesto salía sin precargar SIEMPRE, viniera la
 * línea de donde viniera.
 *
 * Son 56 de los 105 conceptos: 34 de fijo16, 20 de fijo0, el de
 * terrestre_retencion y el de aereo_split. Los 17 de espejo sí necesitan los
 * dos datos y lo siguen diciendo; los 27 de «revisar» son manuales por diseño.
 */
export function necesitaContextoIVA(regla: ReglaIVA): boolean {
  return regla === 'espejo';
}

/**
 * Contexto de relleno para las reglas que no lo leen.
 *
 * No es un default disfrazado: `calcularIVA` no toca estos valores salvo en
 * espejo, y a espejo no se le pasa nunca este objeto.
 */
const CONTEXTO_NO_LEIDO: ContextoIVA = { trafico: 'impo', ubicacion: 'destino' };

export function ivaDeLinea(
  reglaIVA: ReglaIVA | undefined | null,
  servicio: ServicioSolicitado,
  concepto?: Pick<ConceptoVermur, 'aplicaOrigen' | 'aplicaDestino'> | null,
  /** Tarea 28 · Ubicación capturada por renglón. */
  ubicacionDelConcepto?: 'origen' | 'destino',
): ResultadoIVALinea {
  if (!reglaIVA) {
    return {
      iva: null,
      motivo: 'sin_concepto',
      detalle: 'La línea no está ligada a un concepto del catálogo, así que no tiene regla de IVA.',
    };
  }

  if (reglaIVA === 'revisar') {
    return {
      iva: null,
      motivo: 'requiere_revision',
      detalle: 'El concepto está marcado como «revisar»: su IVA se captura a mano.',
    };
  }

  // Tasa fija, exento, retención o split aéreo: la regla ya trae la respuesta.
  // Pedir el tráfico para esto es pedir un dato que nadie va a leer.
  if (!necesitaContextoIVA(reglaIVA)) {
    return { iva: calcularIVA(reglaIVA, CONTEXTO_NO_LEIDO)! };
  }

  // ── Regla espejo: aquí sí hacen falta los dos (§4.2) ─────────────────────
  const { trafico, motivo } = resolverTrafico(servicio);
  if (!trafico) {
    return { iva: null, motivo: 'sin_trafico', detalle: motivo };
  }

  const ubicacion = ubicacionDeLinea(concepto, servicio, ubicacionDelConcepto);
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

  // «revisar» ya salió arriba, así que aquí calcularIVA no devuelve null.
  return { iva: calcularIVA(reglaIVA, contexto)! };
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
