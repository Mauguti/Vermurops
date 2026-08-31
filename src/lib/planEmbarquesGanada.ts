/**
 * planEmbarquesGanada.ts
 *
 * A-1. Decide QUÉ embarques nacen de una cotización ganada, y con qué.
 *
 * ── Por qué es una capa aparte ─────────────────────────────────────────────
 * La generación tiene dos mitades con naturalezas distintas:
 *
 *   1. Decidir cuántos embarques, de qué modalidad, con qué cargos y qué
 *      advertencias, y de qué serie sale cada folio.  ← esto, puro
 *   2. Reservar los consecutivos y escribir cotización y embarques de forma
 *      atómica.                                        ← la transacción
 *
 * Separarlas permite probar la primera —que es donde está el criterio de
 * negocio— sin Firestore. Y es donde importa: quien marca la cotización como
 * ganada NO ve el embarque que acaba de crear. Si aquí se pierde un cargo o se
 * elige mal la serie, nadie se entera hasta que hay que pagar o facturar.
 *
 * Decisión del cliente (28-ago-2026): «una cotización ganada se crea un
 * embarque de a huevo, no hay paso intermedio».
 */

import { KanbanQuote, ServicioSolicitado } from '../components/quotes/QuotesData';
import { CargoDetalle, ModalidadEmbarque } from '../components/shipments/EmbarquesData';
import { Servicio } from '../config/serviciosStore';
import {
  Advertencia, ContextoMapeo, mapearLineasAEmbarque, revisarCliente,
} from './cotizacionAEmbarque';
import { aplanarCotizacion, LineaPlana } from './lineasCotizacion';
import {
  agruparParaEmbarques, GrupoEmbarque, prefijoFolio, ResolverModalidad, Trafico,
} from './generacionEmbarque';
import { modalidadDeServicio, resolverTrafico } from './traficoServicio';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface GrupoPlaneado {
  /** 'principal' o el id del servicio que se opera aparte. */
  clave: string;
  esPrincipal: boolean;
  modalidad: ModalidadEmbarque;
  /** null = no se pudo determinar; el folio sale de la serie provisional. */
  trafico: Trafico | null;
  /** Serie de la que sale el folio: VLIM, VLET… o VL si el tráfico no se supo. */
  prefijo: string;
  servicioIds: string[];
  lineas: LineaPlana[];
  cargos: CargoDetalle[];
  /** Las de sus propias líneas más las que produjo la agrupación. */
  advertencias: Advertencia[];
}

export interface PlanEmbarques {
  grupos: GrupoPlaneado[];
  /**
   * Avisos de la cotización entera, no de un grupo: el expediente del cliente.
   * Se copian a TODOS los embarques —Operaciones tiene que verlo abra el que
   * abra— pero se cuentan una sola vez al reportar.
   */
  advertenciasGenerales: Advertencia[];
  /** Cuántos folios pedirle a cada serie. Entrada de reservarFoliosMultiSerie. */
  pedidosDeFolio: { prefijo: string; cuantos: number }[];
}

// ─── Tráfico del grupo ────────────────────────────────────────────────────────

/**
 * Tráfico del grupo: el del servicio de MAYOR VENTA que sí lo defina.
 *
 * Un grupo puede juntar varios servicios (el marítimo con su acarreo), y en
 * teoría podrían discrepar. Se prefiere el que manda la operación, y la
 * discrepancia se avisa en vez de resolverla en silencio: el tráfico decide la
 * serie del folio y también el IVA (§4.2).
 */
export function traficoDelGrupo(
  grupo: GrupoEmbarque,
  servicios: ServicioSolicitado[],
): { trafico: Trafico | null; advertencias: Advertencia[] } {
  const advertencias: Advertencia[] = [];

  const ventaPorServicio = new Map<string, number>();
  grupo.lineas.forEach(l => {
    ventaPorServicio.set(l.servicioId, (ventaPorServicio.get(l.servicioId) ?? 0) + l.venta);
  });

  const candidatos = grupo.servicioIds
    .map(id => servicios.find(s => s.id === id))
    .filter((s): s is ServicioSolicitado => !!s)
    .sort((a, b) => (ventaPorServicio.get(b.id) ?? 0) - (ventaPorServicio.get(a.id) ?? 0));

  const resueltos = candidatos
    .map(s => ({ servicio: s, res: resolverTrafico(s) }))
    .filter(r => r.res.trafico !== null);

  if (resueltos.length === 0) {
    const motivo = candidatos.length > 0
      ? resolverTrafico(candidatos[0]).motivo ?? 'No se declaró el tráfico.'
      : 'El grupo no tiene servicios con ruta.';
    advertencias.push({
      tipo: 'folio_provisional',
      lineaId: '',
      concepto: '',
      detalle: `${motivo} El embarque nace con folio de la serie provisional VL; Operaciones debe reasignarlo a su serie al capturar.`,
    });
    return { trafico: null, advertencias };
  }

  const distintos = new Set(resueltos.map(r => r.res.trafico));
  if (distintos.size > 1) {
    advertencias.push({
      tipo: 'folio_provisional',
      lineaId: '',
      concepto: '',
      detalle: `Los servicios de este embarque declaran tráficos distintos (${[...distintos].join(' y ')}). Se tomó «${resueltos[0].res.trafico}» por ser el de mayor venta; verifica la serie del folio y el IVA.`,
    });
  }

  return {
    trafico: resueltos[0].res.trafico === 'importacion' ? 'impo' : 'expo',
    advertencias,
  };
}

// ─── Plan ─────────────────────────────────────────────────────────────────────

/**
 * Arma el plan completo. No toca Firestore ni reserva folios.
 *
 * INVARIANTE que hereda de `agruparParaEmbarques`: cada línea de la cotización
 * cae en exactamente un grupo. Ninguna se pierde ni se duplica, o el embarque
 * cobraría de menos o de más.
 */
export function planearEmbarquesDeGanada(
  quote: KanbanQuote,
  catalogoServicios: Servicio[],
  contexto: ContextoMapeo = {},
): PlanEmbarques {
  const lineas = aplanarCotizacion(quote);
  const servicios = quote.servicios ?? [];

  const independientes = new Set(
    servicios.filter(s => s.generaEmbarquePropio).map(s => s.id),
  );

  const resolver: ResolverModalidad = (tipo) => {
    const m = modalidadDeServicio(tipo, catalogoServicios);
    return m === 'maritimo' || m === 'aereo' || m === 'terrestre' ? m : null;
  };

  const { grupos, advertencias: avisosAgrupacion } =
    agruparParaEmbarques(lineas, independientes, resolver);

  const grupoPrincipal = grupos.find(g => g.esPrincipal) ?? grupos[0];

  const planeados: GrupoPlaneado[] = grupos.map(g => {
    const { cargos, advertencias: avisosLineas } =
      mapearLineasAEmbarque(g.lineas, quote.id, contexto);
    const { trafico, advertencias: avisosTrafico } = traficoDelGrupo(g, servicios);

    return {
      clave: g.clave,
      esPrincipal: g.esPrincipal,
      modalidad: g.modalidad,
      trafico,
      prefijo: prefijoFolio(g.modalidad, trafico),
      servicioIds: g.servicioIds,
      lineas: g.lineas,
      cargos,
      advertencias: [
        ...avisosLineas,
        ...avisosTrafico,
        // Las de agrupación son de la cotización, pero describen decisiones que
        // afectaron al embarque principal: se cuelgan de él.
        ...(g === grupoPrincipal ? avisosAgrupacion : []),
      ],
    };
  });

  // Una cotización sin líneas no produce grupos, y sin embargo ganó: tiene que
  // nacer un embarque igual, o la venta cerrada no aparece en ningún lado.
  if (planeados.length === 0) {
    planeados.push({
      clave: 'principal',
      esPrincipal: true,
      modalidad: 'maritimo',
      trafico: null,
      prefijo: prefijoFolio('maritimo', null),
      servicioIds: servicios.map(s => s.id),
      lineas: [],
      cargos: [],
      advertencias: [
        ...mapearLineasAEmbarque([], quote.id, contexto).advertencias,
        {
          tipo: 'sin_modalidad_transporte',
          lineaId: '',
          concepto: '',
          detalle: 'La cotización se ganó sin ninguna línea con importe. El embarque nace vacío y Operaciones debe capturar sus cargos.',
        },
      ],
    });
  }

  const pedidosDeFolio = planeados.map(g => ({ prefijo: g.prefijo, cuantos: 1 }));

  return {
    grupos: planeados,
    advertenciasGenerales: avisosGeneralesDeCotizacion(quote, contexto),
    pedidosDeFolio,
  };
}

/**
 * Lo que se revisa una sola vez por cotización: hoy, el expediente del cliente.
 *
 * Va aparte de las advertencias de grupo porque no es de un embarque sino de
 * la venta: repetirlo en cada uno sería ruido, y omitirlo dejaría a
 * Operaciones sin saber que el cliente no tiene expediente.
 */
function avisosGeneralesDeCotizacion(
  quote: KanbanQuote,
  contexto: ContextoMapeo,
): Advertencia[] {
  const delCliente = revisarCliente(quote, contexto.cliente);
  return delCliente ? [delCliente] : [];
}
