/**
 * generacionEmbarque.ts
 *
 * E-4. Construye el embarque que nace de una cotización ganada.
 *
 * Puro: recibe todo lo que necesita y devuelve el documento. La transacción de
 * Firestore —leer el contador, escribir la cotización y el embarque de forma
 * atómica— vive en el hook; aquí solo está la forma del documento, para poder
 * probarla sin base de datos.
 *
 * Contexto: el cliente decidió que el embarque se cree AUTOMÁTICAMENTE al
 * marcar la cotización como ganada, sin paso intermedio. Quien dispara —Ventas
 * o Pricing— no ve el resultado, así que lo que se construya aquí tiene que
 * quedar utilizable para Operaciones sin retoques a ciegas.
 */

import { KanbanQuote } from '../components/quotes/QuotesData';
import {
  EmbarqueCompleto, ModalidadEmbarque, recalcularCargos,
} from '../components/shipments/EmbarquesData';
import { Advertencia } from './cotizacionAEmbarque';
import { aplanarCotizacion, LineaPlana } from './lineasCotizacion';

/** Cómo nació el embarque. Gobierna qué permiso se exige al guardarlo. */
export type OrigenEmbarque = 'automatico' | 'manual';

const MODALIDADES: Record<string, ModalidadEmbarque> = {
  maritimo: 'maritimo',
  aereo: 'aereo',
  terrestre: 'terrestre',
};

/**
 * Modalidad del embarque a partir de los servicios de la cotización.
 *
 * Una cotización puede ser multimodal y `ModalidadEmbarque` es un solo valor.
 * Se toma la del servicio con MAYOR venta —el que domina la operación— y el
 * caso multimodal se reporta como advertencia para que Operaciones lo sepa.
 *
 * ⚠️ Si Vermur prefiere un embarque por servicio en las multimodales, esto
 * cambia. Está ligado a la pregunta de embarques parciales, que sigue sin
 * respuesta del cliente.
 */
export function modalidadDominante(quote: KanbanQuote): {
  modalidad: ModalidadEmbarque;
  esMultimodal: boolean;
  tipos: string[];
} {
  const lineas = aplanarCotizacion(quote);

  const ventaPorTipo = new Map<string, number>();
  lineas.forEach(l => {
    ventaPorTipo.set(l.servicioTipo, (ventaPorTipo.get(l.servicioTipo) ?? 0) + l.venta);
  });

  const tipos = [...ventaPorTipo.keys()];
  const dominante = [...ventaPorTipo.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    modalidad: MODALIDADES[dominante] ?? 'maritimo',
    esMultimodal: tipos.filter(t => MODALIDADES[t]).length > 1,
    tipos,
  };
}

export interface DatosGeneracion {
  quote: KanbanQuote;
  /** Folio ya reservado por el contador transaccional. */
  folio: string;
  cargos: ReturnType<typeof recalcularCargos>['detalles'];
  advertencias: Advertencia[];
  origen: OrigenEmbarque;
  /** Quién disparó. En automático es quien cerró la venta. */
  generadoPor: string;
  /** Marca de tiempo, inyectada para poder probar. */
  ahora: string;
}

/**
 * Arma el documento del embarque.
 *
 * Hereda del prospecto/cliente y de la ruta lo que se pueda, y deja en «por
 * definir» lo que solo Operaciones sabe (guía, booking, buque, fechas reales).
 * `requiereCaptura` marca justo eso: nació solo y le falta la parte operativa.
 */
export function construirEmbarqueDesdeCotizacion(d: DatosGeneracion): EmbarqueCompleto {
  const { quote, folio, cargos, advertencias, origen, generadoPor, ahora } = d;
  const { modalidad } = modalidadDominante(quote);
  const primerServicio = quote.servicios?.[0];

  const empresa = quote.prospecto?.empresa ?? 'Por definir';
  const fecha = ahora.slice(0, 10);

  return {
    id: folio,
    folio,
    cotizacionId: quote.id,
    modalidad,
    tipo: 'hijo',
    masterId: null,

    numeroGuia: '',
    numeroReservacion: '',
    referenciaCliente: '',

    entidades: {
      expedidor: '',
      consignatario: empresa,
      notificar: '',
      agenteAduanal: '',
      agenteCarga: '',
      agenteDestino: '',
      importador: '',
      clienteCobrar: empresa,
    },

    ruta: {
      origen: {
        puertoCarga: primerServicio?.ruta?.origen ?? '',
        transportista: '', buque: '', bandera: '', viaje: '',
      },
      destino: {
        puertoDescarga: primerServicio?.ruta?.destino ?? '',
        transportistaEntrega: '', lugarEntrega: '',
      },
      aduana: { aes: false, pedimento: '' },
    },

    fechas: {
      salida: '', arribo: '', ordenGeneral: '',
      limiteDocumentacion: '', libreDemoras: '', libreAlmacenaje: '',
    },

    descripcionCarga: primerServicio?.mercancia ?? '',
    valorDeclarado: 0,
    cierres: { operativo: false, pago: false, administrativo: false },

    cargos: recalcularCargos(cargos),

    documentos: [],
    eventos: [{
      id: `evt-gen-${folio}`,
      titulo: origen === 'automatico' ? 'Embarque generado automáticamente' : 'Embarque creado',
      descripcion: origen === 'automatico'
        ? `Nació al marcar la cotización ${quote.id} como ganada. Heredó ${cargos.length} cargo(s). Generado por ${generadoPor}.`
        : `Creado manualmente por ${generadoPor}.`,
      fecha: ahora.slice(0, 16).replace('T', ' '),
      tipo: advertencias.length > 0 ? 'alerta' : 'info',
    }],

    createdAt: ahora.slice(0, 16).replace('T', ' '),
    updatedAt: ahora.slice(0, 16).replace('T', ' '),

    // ── Campos de E-4 ───────────────────────────────────────────────────────
    origen,
    generadoPor,
    fechaGeneracion: fecha,
    requiereCaptura: origen === 'automatico',
    advertenciasHeredadas: advertencias,
  } as EmbarqueCompleto;
}

// ─── Agrupación por modalidad ─────────────────────────────────────────────────
//
// Decisión del cliente (30-ago-2026): un embarque POR MODALIDAD. Marítimo y
// terrestre son embarques distintos, y la nomenclatura lo confirma — los folios
// codifican la modalidad y el tráfico (VLIM impo marítimo, VLIT impo terrestre,
// VLET expo terrestre), así que un embarque mixto no tendría prefijo posible.
//
// Una cotización multimodal genera N embarques, uno por modalidad.

export type Trafico = 'impo' | 'expo';

/**
 * Prefijo de folio por modalidad y tráfico. Confirmado contra los embarques
 * reales de Magaya que están en los datos de ejemplo: VLIT-24-107 (impo
 * terrestre), VLIA-24-020 (impo aéreo).
 */
export const PREFIJO_FOLIO: Record<ModalidadEmbarque, Record<Trafico, string>> = {
  maritimo:  { impo: 'VLIM', expo: 'VLEM' },
  terrestre: { impo: 'VLIT', expo: 'VLET' },
  aereo:     { impo: 'VLIA', expo: 'VLEA' },
};

export function prefijoFolio(modalidad: ModalidadEmbarque, trafico: Trafico): string {
  return PREFIJO_FOLIO[modalidad][trafico];
}

/**
 * Traduce el `tipo` de un servicio a una modalidad de embarque.
 *
 * ⚠️ Se recibe como función inyectada y no se resuelve aquí porque el campo NO
 * es confiable: el formulario de nueva cotización guarda el id del catálogo de
 * servicios (`srv-def-2`), mientras que los datos de ejemplo usan el nombre
 * canónico (`terrestre`). Hasta unificarlo, quien llame decide cómo mapear.
 */
export type ResolverModalidad = (servicioTipo: string) => ModalidadEmbarque | null;

/** Mapeo por nombre canónico. Sirve para los datos que ya lo usan. */
export const resolverModalidadCanonica: ResolverModalidad = (tipo) =>
  MODALIDADES[tipo] ?? null;

export interface GrupoModalidad {
  modalidad: ModalidadEmbarque;
  lineas: LineaPlana[];
  ventaTotal: number;
}

export interface AgrupacionModalidad {
  grupos: GrupoModalidad[];
  advertencias: Advertencia[];
}

/**
 * Reparte las líneas de la cotización en un grupo por modalidad.
 *
 * Las líneas que no pertenecen a ninguna modalidad de transporte —despacho
 * aduanal, seguro de mercancía, asesoría— se asignan al embarque de MAYOR
 * venta, que es el que domina la operación.
 *
 * Solo se avisa cuando la asignación es realmente ambigua, es decir cuando hay
 * dos o más modalidades y por tanto había dónde elegir. Con una sola modalidad
 * no hay decisión que tomar y avisar sería ruido: una advertencia que se
 * equivoca seguido es una advertencia que se ignora.
 *
 * INVARIANTE: cada línea cae en exactamente un grupo. Ninguna se pierde ni se
 * duplica, o el embarque cobraría de menos o de más.
 */
export function agruparLineasPorModalidad(
  lineas: LineaPlana[],
  resolver: ResolverModalidad = resolverModalidadCanonica,
): AgrupacionModalidad {
  const advertencias: Advertencia[] = [];
  const porModalidad = new Map<ModalidadEmbarque, LineaPlana[]>();
  const huerfanas: LineaPlana[] = [];

  lineas.forEach(l => {
    const m = resolver(l.servicioTipo);
    if (m) {
      porModalidad.set(m, [...(porModalidad.get(m) ?? []), l]);
    } else {
      huerfanas.push(l);
    }
  });

  // Sin ninguna modalidad de transporte no hay a qué colgar los cargos.
  if (porModalidad.size === 0) {
    if (lineas.length > 0) {
      advertencias.push({
        tipo: 'sin_modalidad_transporte',
        lineaId: '',
        concepto: '',
        detalle: `Ninguna línea corresponde a una modalidad de transporte (${[...new Set(lineas.map(l => l.servicioTipo))].join(', ')}). Se genera un solo embarque marítimo y Operaciones debe corregir la modalidad.`,
      });
      porModalidad.set('maritimo', lineas);
    }
    return { grupos: construirGrupos(porModalidad), advertencias };
  }

  if (huerfanas.length > 0) {
    const destino = modalidadConMayorVenta(porModalidad);
    porModalidad.set(destino, [...(porModalidad.get(destino) ?? []), ...huerfanas]);

    if (porModalidad.size > 1) {
      huerfanas.forEach(l => {
        advertencias.push({
          tipo: 'linea_sin_modalidad',
          lineaId: l.id,
          concepto: l.concepto,
          detalle: `«${l.concepto}» (${l.servicioTipo}) no pertenece a una modalidad de transporte y se asignó al embarque ${destino}, que es el de mayor venta. Verificar si corresponde.`,
        });
      });
    }
  }

  return { grupos: construirGrupos(porModalidad), advertencias };
}

function modalidadConMayorVenta(mapa: Map<ModalidadEmbarque, LineaPlana[]>): ModalidadEmbarque {
  return [...mapa.entries()]
    .map(([m, ls]) => [m, ls.reduce((a, l) => a + l.venta, 0)] as const)
    .sort((a, b) => b[1] - a[1])[0][0];
}

function construirGrupos(mapa: Map<ModalidadEmbarque, LineaPlana[]>): GrupoModalidad[] {
  return [...mapa.entries()]
    .map(([modalidad, ls]) => ({
      modalidad,
      lineas: ls,
      ventaTotal: Math.round(ls.reduce((a, l) => a + l.venta, 0) * 100) / 100,
    }))
    .sort((a, b) => b.ventaTotal - a.ventaTotal);
}
