/**
 * documentosEmbarque.ts (D-3)
 *
 * Los documentos del embarque, clasificados con IA y confirmados a mano.
 *
 * ── Qué resuelve ───────────────────────────────────────────────────────────
 * La pestaña anterior «guardaba» con `URL.createObjectURL`: el archivo nunca
 * llegaba a Storage y la URL moría al recargar. Aquí el archivo ES la
 * evidencia (una subida, dos usos, como en tarifarios y expediente), y lo
 * que se guarda es lo que el usuario confirmó en la revisión.
 *
 * Lo más valioso: una factura de proveedor precarga la OC del embarque —
 * número real, fecha, emisor— y coteja el total. Es lo del levantamiento:
 * «hay que sustituir el folio interno por el número real, cuadrar montos y
 * adjuntar el respaldo». El clasificador lo hace; el usuario confirma.
 *
 * Sin React, sin Firestore, sin red.
 */

import type {
  EmbarqueDocumento, EmbarqueProducto, TipoDocumentoLegacy,
} from '../components/shipments/EmbarquesData';
import { TIPOS_DOCUMENTO } from '../components/shipments/EmbarquesData';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import {
  ETIQUETA_DOC_EMBARQUE, ETIQUETA_GRUPO, type GrupoDocumentoEmbarque,
  type TipoDocEmbarque, type ClasificacionValidada, type EstadoDocumento,
  type PrecargaFactura, cotejarTotalConOC,
} from './clasificacionDocumentos';
import { reglaDeTipo } from './visibilidadDocumentoCliente';

// ─── Etiquetas y grupos ──────────────────────────────────────────────────────

const LEGACY = TIPOS_DOCUMENTO as Record<string, string>;

/** Etiqueta de cualquier tipo: la taxonomía nueva, la legacy, o el código. */
export function etiquetaTipoDocumento(tipo: string): string {
  return (ETIQUETA_DOC_EMBARQUE as Record<string, string>)[tipo]
    ?? LEGACY[tipo]
    ?? tipo.replace(/_/g, ' ');
}

/** A qué grupo pertenece un tipo cuando el clasificador no propuso destino. */
export function grupoPorTipo(tipo: string): GrupoDocumentoEmbarque {
  if (tipo === 'factura_proveedor') return 'facturas_proveedor';
  if (tipo === 'factura_cliente') return 'facturas_cliente';
  return 'documentos';
}

/**
 * El grupo que se propone en la revisión: el destino sugerido por n8n si
 * es válido, si no el que dicta el tipo. El usuario puede cambiarlo.
 */
export function grupoPropuesto(
  tipo: string,
  destinoSugerido: GrupoDocumentoEmbarque | null,
): GrupoDocumentoEmbarque {
  return destinoSugerido ?? grupoPorTipo(tipo);
}

/** Grupo de un documento guardado: el suyo, o derivado del tipo si es legacy. */
export function grupoDe(doc: Pick<EmbarqueDocumento, 'tipo' | 'grupo'>): GrupoDocumentoEmbarque {
  return doc.grupo ?? grupoPorTipo(doc.tipo);
}

export const ORDEN_GRUPOS: GrupoDocumentoEmbarque[] = ['documentos', 'facturas_proveedor', 'facturas_cliente'];

export interface GrupoDeDocumentos {
  grupo: GrupoDocumentoEmbarque;
  etiqueta: string;
  tipos: { tipo: string; etiqueta: string; documentos: EmbarqueDocumento[] }[];
  total: number;
}

/**
 * Agrupa por destino y, dentro, por tipo. Solo los grupos con algo: una
 * sección vacía con rótulo es ruido. El orden de los tipos es el de la
 * taxonomía, para que el BL salga antes que el packing list.
 */
export function agruparDocumentos(docs: readonly EmbarqueDocumento[]): GrupoDeDocumentos[] {
  const ordenTipos = [...Object.keys(ETIQUETA_DOC_EMBARQUE), ...Object.keys(LEGACY)];
  const indice = (t: string) => { const i = ordenTipos.indexOf(t); return i === -1 ? 999 : i; };

  return ORDEN_GRUPOS.map(grupo => {
    const delGrupo = docs.filter(d => grupoDe(d) === grupo);
    const porTipo = new Map<string, EmbarqueDocumento[]>();
    delGrupo.forEach(d => porTipo.set(d.tipo, [...(porTipo.get(d.tipo) ?? []), d]));
    const tipos = [...porTipo.entries()]
      .sort((a, b) => indice(a[0]) - indice(b[0]))
      .map(([tipo, documentos]) => ({
        tipo,
        etiqueta: etiquetaTipoDocumento(tipo),
        documentos: [...documentos].sort((a, b) => b.fechaCarga.localeCompare(a.fechaCarga)),
      }));
    return { grupo, etiqueta: ETIQUETA_GRUPO[grupo], tipos, total: delGrupo.length };
  }).filter(g => g.total > 0);
}

/** Los tipos de la taxonomía, para el select de la revisión. */
export const TIPOS_DOC_EMBARQUE: { tipo: TipoDocEmbarque; etiqueta: string }[] =
  (Object.keys(ETIQUETA_DOC_EMBARQUE) as TipoDocEmbarque[]).map(tipo => ({
    tipo, etiqueta: ETIQUETA_DOC_EMBARQUE[tipo],
  }));

/**
 * Las facturas NO son documentos del embarque: viven en la pestaña Facturas
 * (reunión con el cliente, 10-sep-2026). En Documentos quedan los operativos.
 */
export function esTipoFactura(tipo: string): boolean {
  return tipo === 'factura_proveedor' || tipo === 'factura_cliente' || tipo === 'factura';
}

export const TIPOS_DOC_OPERATIVOS = TIPOS_DOC_EMBARQUE.filter(t => !esTipoFactura(t.tipo));

/** Un documento es factura si su tipo o su destino lo dicen. */
export function esDocumentoFactura(doc: Pick<EmbarqueDocumento, 'tipo' | 'grupo'>): boolean {
  return esTipoFactura(doc.tipo) || grupoDe(doc) !== 'documentos';
}

/**
 * Por qué no se puede guardar en Documentos. Null = sí se puede. Se decide
 * por lo que DETECTÓ el clasificador (tipo y destino), no por lo que el
 * usuario confirme: una factura confirmada como «otro» sigue siendo factura.
 */
export function bloqueoEnDocumentos(c: Pick<ClasificacionValidada, 'tipo' | 'destinoSugerido'>): string | null {
  if (esTipoFactura(c.tipo) || (c.destinoSugerido && c.destinoSugerido !== 'documentos')) {
    return 'El clasificador lo lee como factura. Las facturas no se guardan en Documentos: súbela en la pestaña Facturas, donde se concilia contra los cargos.';
  }
  return null;
}

// ─── Contexto que se manda al clasificador ───────────────────────────────────

/**
 * Los contenedores del embarque, para que n8n coteje los del documento. Un
 * BL de otro embarque se ve idéntico a uno de este; el número de contenedor
 * es lo único que lo delata.
 */
export function contenedoresDelEmbarque(
  embarque: { productos?: Pick<EmbarqueProducto, 'datosContenedor'>[] },
): string[] {
  const vistos = new Set<string>();
  (embarque.productos ?? []).forEach(p => {
    const n = p.datosContenedor?.numeroContenedor?.trim().toUpperCase();
    if (n) vistos.add(n);
  });
  return [...vistos];
}

/** ¿El clasificador avisó que los contenedores no son de este embarque? */
export function contenedorNoCoincide(avisos: readonly string[]): boolean {
  return avisos.includes('contenedor_no_coincide');
}

// ─── Lo que se guarda ────────────────────────────────────────────────────────

export interface SubidaClasificada {
  storagePath: string;
  url: string;
  nombreOriginal: string;
  clasificacion: ClasificacionValidada;
}

export interface ConfirmacionRevision {
  tipoConfirmado: string;
  nombre: string;
  estado: EstadoDocumento;
  grupo: GrupoDocumentoEmbarque;
  ocId: string | null;
  /**
   * Bloque 2 · Lo que el usuario dejó en la casilla de visibilidad. Ausente =
   * no la tocó, y vale la regla del tipo confirmado.
   */
  visibleCliente?: boolean;
}

/**
 * El documento tal como queda en el embarque: lo confirmado manda sobre lo
 * propuesto (tipo, nombre, grupo), y lo extraído se conserva tal cual para
 * no tener que reclasificar si mañana hace falta otro dato.
 */
export function documentoDesdeRevision(
  subida: SubidaClasificada,
  confirmacion: ConfirmacionRevision,
  autor: string,
  ahora: string,
): Omit<EmbarqueDocumento, 'id'> {
  const c = subida.clasificacion;
  return {
    tipo: confirmacion.tipoConfirmado,
    nombre: confirmacion.nombre.trim() || subida.nombreOriginal,
    url: subida.url,
    storagePath: subida.storagePath,
    nombreOriginal: subida.nombreOriginal,
    grupo: confirmacion.grupo,
    confianza: c.confianza,
    estado: confirmacion.estado === 'pendiente' ? 'con_observaciones' : confirmacion.estado,
    avisos: c.avisos,
    datos: c.datos,
    ocId: confirmacion.ocId,
    /*
     * Bloque 2 · Se guarda SIEMPRE explícito, aunque sea el valor que la regla
     * ya daba. La regla puede cambiar —un tipo que hoy es interno mañana puede
     * nacer visible— y un documento que ya salió al cliente no debería cambiar
     * de visibilidad por detrás. Lo que se confirmó al subirlo es lo que vale.
     *
     * Se calcula sobre el tipo CONFIRMADO, no sobre el que propuso n8n: si el
     * usuario corrigió «otro» a «pedimento», manda la regla del pedimento.
     */
    visibleCliente: confirmacion.visibleCliente
      ?? reglaDeTipo(confirmacion.tipoConfirmado).porDefecto,
    fechaCarga: ahora.slice(0, 16).replace('T', ' '),
    cargadoPor: autor,
  };
}

// ─── La precarga en la OC ────────────────────────────────────────────────────

export interface PropuestaOC {
  /** El texto que va en `facturaAsociada`: «F-1234 · 2026-09-01 · Emisor». */
  facturaAsociada: string;
  facturaDatos: NonNullable<OrdenCompra['facturaDatos']>;
  /** null cuando cuadra; si no, qué revisar antes de mandarla a pago. */
  aviso: string | null;
}

/**
 * Lo que la factura clasificada le propone a la OC. No escribe: la pantalla
 * lo muestra y el usuario confirma. El cotejo del total va en el patch para
 * que Administración lo vea al autorizar sin volver a abrir el PDF.
 */
export function proponerParaOC(
  precarga: PrecargaFactura,
  oc: Pick<OrdenCompra, 'monto' | 'moneda'>,
  documentoId: string,
): PropuestaOC {
  const cotejo = cotejarTotalConOC(precarga, oc);
  const partes = [precarga.numeroDocumento, precarga.fecha, precarga.emisor].filter(Boolean);
  return {
    facturaAsociada: partes.join(' · ') || 'Factura sin número legible',
    facturaDatos: {
      numero: precarga.numeroDocumento,
      fecha: precarga.fecha,
      emisor: precarga.emisor,
      total: precarga.total,
      moneda: precarga.moneda || oc.moneda,
      documentoId,
      cotejo: precarga.total === null ? 'sin_total' : cotejo.coincide ? 'coincide' : 'difiere',
    },
    aviso: cotejo.mensaje,
  };
}

/** Un tipo legacy sigue siendo válido al leer, pero ya no se ofrece al subir. */
export function esTipoLegacy(tipo: string): tipo is TipoDocumentoLegacy {
  return tipo in LEGACY && !(tipo in ETIQUETA_DOC_EMBARQUE);
}
