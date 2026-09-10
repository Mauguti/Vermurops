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
import { productosDesdeGrupo } from './cargaSolicitud';
import { refsDesdeCotizacion } from './entidadesEmbarque';

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
  /**
   * Servicios que viajan en ESTE embarque (S-3). De su carga tipada se
   * heredan los productos — contenedores, peso, mercancías — para que
   * Operaciones no recapture lo que Ventas ya declaró. Sin esto se hereda
   * del servicio de la ruta.
   */
  serviciosGrupo?: import('../components/quotes/QuotesData').ServicioSolicitado[];
  /** Marca de tiempo, inyectada para poder probar. */
  ahora: string;
  /**
   * Modalidad del embarque, cuando ya la decidió la agrupación.
   *
   * Sin esto se usa `modalidadDominante(quote)`, que mira la cotización
   * ENTERA: en una cotización con un terrestre que se opera aparte, los dos
   * embarques nacerían marítimos y el folio VLIT no correspondería al
   * documento.
   */
  modalidad?: ModalidadEmbarque;
  /** Servicio del que se hereda la ruta. Por defecto, el primero. */
  servicioRuta?: KanbanQuote['servicios'][number];
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
  const modalidad = d.modalidad ?? modalidadDominante(quote).modalidad;
  const primerServicio = d.servicioRuta ?? quote.servicios?.[0];

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
    // El cliente vinculado a la cotización (E6) llega con enlace a su ficha;
    // los demás roles nacen como texto y se validan en el embarque.
    entidadesRef: refsDesdeCotizacion(quote),

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
    // Herencia S-3: se captura una vez en la solicitud, no dos.
    productos: productosDesdeGrupo(
      d.serviciosGrupo ?? (primerServicio ? [primerServicio] : []),
      empresa,
      quote.id,
    ),
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

/**
 * Serie genérica para cuando no se sabe el tráfico.
 *
 * Un embarque sin folio no se puede referir en un correo ni en una carta de
 * encomienda: «el embarque de Grupo Textil» funciona hasta que hay dos. Así
 * que nace identificable con prefijo VL y su propio contador, marcado como
 * provisional para que Operaciones lo reasigne a la serie correcta al capturar.
 */
export const SERIE_PROVISIONAL = 'VL';

export function prefijoFolio(
  modalidad: ModalidadEmbarque,
  trafico: Trafico | null | undefined,
): string {
  if (!trafico) return SERIE_PROVISIONAL;
  return PREFIJO_FOLIO[modalidad][trafico];
}

/** ¿Este folio salió de la serie provisional? */
export function esFolioProvisional(folio: string): boolean {
  return folio.startsWith(`${SERIE_PROVISIONAL}-`);
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

export interface GrupoEmbarque {
  /** 'principal' o el id del servicio que se opera aparte. */
  clave: string;
  esPrincipal: boolean;
  modalidad: ModalidadEmbarque;
  servicioIds: string[];
  lineas: LineaPlana[];
  ventaTotal: number;
}

export interface AgrupacionEmbarques {
  grupos: GrupoEmbarque[];
  advertencias: Advertencia[];
}

/**
 * Reparte las líneas de la cotización en los embarques que se van a generar.
 *
 * Decisión del cliente (30-ago-2026): por defecto TODO va a un solo embarque,
 * cuya modalidad es la del servicio de mayor venta. Un acarreo dentro de una
 * operación marítima es parte de ella, no un VLIT aparte.
 *
 * Pricing marca `generaEmbarquePropio` en los servicios que sí se operan por
 * separado, y cada uno de esos genera su propio embarque con su folio. La
 * decisión vive en la cotización porque al ganarla no puede haber preguntas:
 * el cliente pidió generación automática «sin paso intermedio».
 *
 * INVARIANTE: cada línea cae en exactamente un grupo. Ninguna se pierde ni se
 * duplica, o el embarque cobraría de menos o de más.
 */
export function agruparParaEmbarques(
  lineas: LineaPlana[],
  serviciosIndependientes: Set<string>,
  resolver: ResolverModalidad = resolverModalidadCanonica,
): AgrupacionEmbarques {
  const advertencias: Advertencia[] = [];
  if (lineas.length === 0) return { grupos: [], advertencias };

  const independientes: LineaPlana[] = [];
  const principales: LineaPlana[] = [];

  lineas.forEach(l => {
    (serviciosIndependientes.has(l.servicioId) ? independientes : principales).push(l);
  });

  // ── Un grupo por cada servicio marcado como independiente ───────────────
  const grupos: GrupoEmbarque[] = [];
  const porServicio = new Map<string, LineaPlana[]>();
  independientes.forEach(l => {
    porServicio.set(l.servicioId, [...(porServicio.get(l.servicioId) ?? []), l]);
  });

  const devueltasAlPrincipal: LineaPlana[] = [];

  porServicio.forEach((ls, servicioId) => {
    const modalidad = resolver(ls[0].servicioTipo);
    if (!modalidad) {
      // Sin modalidad no hay prefijo de folio posible. Se reintegra al
      // principal y se explica, en vez de inventar una serie.
      advertencias.push({
        tipo: 'independiente_sin_modalidad',
        lineaId: '',
        concepto: ls[0].servicioTipo,
        detalle: `El servicio «${ls[0].servicioTipo}» está marcado para operarse por separado, pero no define una modalidad de transporte y sin ella no hay folio posible. Sus líneas se integraron al embarque principal.`,
      });
      devueltasAlPrincipal.push(...ls);
      return;
    }
    grupos.push({
      clave: servicioId,
      esPrincipal: false,
      modalidad,
      servicioIds: [servicioId],
      lineas: ls,
      ventaTotal: sumaVenta(ls),
    });
  });

  // ── El embarque principal: todo lo demás ────────────────────────────────
  const delPrincipal = [...principales, ...devueltasAlPrincipal];
  if (delPrincipal.length > 0) {
    const { modalidad, aviso } = modalidadDelPrincipal(delPrincipal, resolver);
    if (aviso) advertencias.push(aviso);
    grupos.unshift({
      clave: 'principal',
      esPrincipal: true,
      modalidad,
      servicioIds: [...new Set(delPrincipal.map(l => l.servicioId))],
      lineas: delPrincipal,
      ventaTotal: sumaVenta(delPrincipal),
    });
  }

  return { grupos, advertencias };
}

function sumaVenta(ls: LineaPlana[]): number {
  return Math.round(ls.reduce((a, l) => a + l.venta, 0) * 100) / 100;
}

/**
 * Modalidad del embarque principal: la del servicio de MAYOR VENTA entre los
 * que sí definen una. Si ninguno la define, se avisa fuerte y se usa marítimo,
 * porque una cotización ganada no puede quedarse sin embarque.
 */
function modalidadDelPrincipal(
  lineas: LineaPlana[],
  resolver: ResolverModalidad,
): { modalidad: ModalidadEmbarque; aviso?: Advertencia } {
  const ventaPorModalidad = new Map<ModalidadEmbarque, number>();
  lineas.forEach(l => {
    const m = resolver(l.servicioTipo);
    if (m) ventaPorModalidad.set(m, (ventaPorModalidad.get(m) ?? 0) + l.venta);
  });

  if (ventaPorModalidad.size === 0) {
    return {
      modalidad: 'maritimo',
      aviso: {
        tipo: 'sin_modalidad_transporte',
        lineaId: '',
        concepto: '',
        detalle: `Ninguna línea corresponde a una modalidad de transporte (${[...new Set(lineas.map(l => l.servicioTipo))].join(', ')}). El embarque se genera como marítimo y Operaciones debe corregir la modalidad antes de tramitarlo.`,
      },
    };
  }

  const modalidad = [...ventaPorModalidad.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return { modalidad };
}

