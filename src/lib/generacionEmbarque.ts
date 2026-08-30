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
import { aplanarCotizacion } from './lineasCotizacion';

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
