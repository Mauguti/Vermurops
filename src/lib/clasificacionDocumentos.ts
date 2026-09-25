/**
 * clasificacionDocumentos.ts
 *
 * Lógica pura de la clasificación de documentos con IA (D-1): el expediente
 * KYC del cliente y los documentos del embarque.
 *
 * ── El principio, el mismo de importacionTarifas ───────────────────────────
 * n8n INTERPRETA Y PROPONE; la app VALIDA Y ESCRIBE. Nada de lo que llega del
 * clasificador se toma por bueno: se valida en la frontera, se muestra en una
 * pantalla de revisión, y solo lo que el usuario confirma toca Firestore.
 *
 * Sin React, sin Firestore, sin red.
 */

import type { DocsAlta } from '../components/clientes/ClientesData';
import type { NivelConfianza } from './importacionTarifas';

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Taxonomías
// ─────────────────────────────────────────────────────────────────────────────

/** Los 6 documentos del checklist de alta. 'otro' existe pero NO es checklist. */
export type TipoDocExpediente =
  | 'acta_constitutiva'
  | 'poder_notarial'
  | 'identificacion_oficial'
  | 'constancia_situacion_fiscal'
  | 'comprobante_domicilio'
  | 'caratula_bancaria';

export type TipoDocExpedienteODesconocido = TipoDocExpediente | 'otro';

export const DOCUMENTOS_EXPEDIENTE: { tipo: TipoDocExpediente; etiqueta: string }[] = [
  { tipo: 'acta_constitutiva', etiqueta: 'Acta constitutiva' },
  { tipo: 'poder_notarial', etiqueta: 'Poder notarial' },
  { tipo: 'identificacion_oficial', etiqueta: 'Identificación oficial' },
  { tipo: 'constancia_situacion_fiscal', etiqueta: 'Constancia de Situación Fiscal' },
  { tipo: 'comprobante_domicilio', etiqueta: 'Comprobante de domicilio' },
  { tipo: 'caratula_bancaria', etiqueta: 'Carátula bancaria' },
];

/** La taxonomía del clasificador de documentos de embarque. */
export type TipoDocEmbarque =
  | 'bl_maritimo' | 'awb_aereo' | 'carta_porte' | 'booking'
  | 'factura_proveedor' | 'factura_cliente' | 'pedimento'
  | 'packing_list' | 'factura_comercial' | 'certificado_origen'
  | 'notificacion_arribo' | 'carta_encomienda' | 'otro';

export const ETIQUETA_DOC_EMBARQUE: Record<TipoDocEmbarque, string> = {
  bl_maritimo: 'BL marítimo',
  awb_aereo: 'AWB aéreo',
  carta_porte: 'Carta de porte',
  booking: 'Booking',
  factura_proveedor: 'Factura de proveedor',
  factura_cliente: 'Factura al cliente',
  pedimento: 'Pedimento',
  packing_list: 'Packing list',
  factura_comercial: 'Factura comercial',
  certificado_origen: 'Certificado de origen',
  notificacion_arribo: 'Notificación de arribo',
  carta_encomienda: 'Carta de encomienda',
  otro: 'Otro documento',
};

/** Dónde cae un documento del embarque. Lo propone n8n; lo confirma el usuario. */
export type GrupoDocumentoEmbarque = 'documentos' | 'facturas_proveedor' | 'facturas_cliente';

export const ETIQUETA_GRUPO: Record<GrupoDocumentoEmbarque, string> = {
  documentos: 'Documentos del embarque',
  facturas_proveedor: 'Facturas de proveedor',
  facturas_cliente: 'Facturas al cliente',
};

// ─────────────────────────────────────────────────────────────────────────────
// 2 · La frontera con n8n
//
// El contrato es externo y puede cambiar sin avisar. Los dos flujos comparten
// forma; lo que difiere son la taxonomía de `tipo` y el contenido de `datos`.
// ─────────────────────────────────────────────────────────────────────────────

/** La respuesta ya validada, con los defaults resueltos. */
export interface ClasificacionValidada {
  /** El tipo tal como lo dijo n8n. Puede no existir en la taxonomía del flujo. */
  tipo: string;
  confianza: NivelConfianza;
  razonTipo: string;
  nombreOriginal: string;
  /** Editable en revisión. Si n8n no propuso nombre, cae al original. */
  nombrePropuesto: string;
  /** Lo extraído. Cada pantalla decide qué campos le importan. */
  datos: Record<string, unknown>;
  legible: boolean;
  vencido: boolean;
  observaciones: string;
  /** Códigos crudos. La traducción es de la UI (ver traducirAviso). */
  avisos: string[];
  requiereRevision: boolean;
  /** Solo flujo embarque. */
  destinoSugerido: GrupoDocumentoEmbarque | null;
  /** Solo flujo expediente. */
  razonSocial: string;
  rfc: string;
}

export interface ResultadoClasificacion {
  valida: boolean;
  /** Motivo del rechazo, para mostrar tal cual. */
  motivo?: string;
  datos?: ClasificacionValidada;
}

const CONFIANZAS: NivelConfianza[] = ['alta', 'media', 'baja'];
const GRUPOS: GrupoDocumentoEmbarque[] = ['documentos', 'facturas_proveedor', 'facturas_cliente'];

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Valida la respuesta cruda del clasificador. Rechaza lo malformado en vez de
 * confiar: un `tipo` ausente leído como undefined acabaría guardando un
 * documento sin clasificar como si estuviera clasificado.
 */
export function validarClasificacion(bruto: unknown): ResultadoClasificacion {
  if (bruto === null || typeof bruto !== 'object' || Array.isArray(bruto)) {
    return { valida: false, motivo: 'El clasificador devolvió una respuesta ilegible.' };
  }
  const r = bruto as Record<string, unknown>;

  if (r.ok !== true) {
    const detalle = texto(r.error);
    return {
      valida: false,
      motivo: detalle
        ? `El clasificador no pudo procesar el documento: ${detalle}`
        : 'El clasificador no pudo procesar el documento.',
    };
  }

  const tipo = texto(r.tipo);
  if (!tipo) {
    return { valida: false, motivo: 'El clasificador no devolvió el tipo de documento.' };
  }

  const nombreOriginal = texto(r.nombreOriginal);
  const nombrePropuesto = texto(r.nombrePropuesto) || nombreOriginal;

  // Confianza desconocida se degrada a 'baja', no se inventa 'alta': ante la
  // duda, más revisión y no menos.
  const confianza = CONFIANZAS.includes(r.confianza as NivelConfianza)
    ? (r.confianza as NivelConfianza)
    : 'baja';

  const destino = texto(r.destinoSugerido);

  return {
    valida: true,
    datos: {
      tipo,
      confianza,
      razonTipo: texto(r.razonTipo),
      nombreOriginal,
      nombrePropuesto,
      datos:
        r.datos !== null && typeof r.datos === 'object' && !Array.isArray(r.datos)
          ? (r.datos as Record<string, unknown>)
          : {},
      // `legible` ausente se asume true: el aviso de ilegible debe ser una
      // afirmación del clasificador, no un accidente del contrato.
      legible: r.legible !== false,
      vencido: r.vencido === true,
      observaciones: texto(r.observaciones),
      avisos: Array.isArray(r.avisos) ? r.avisos.filter((a): a is string => typeof a === 'string' && a.trim() !== '') : [],
      requiereRevision: r.requiereRevision === true,
      destinoSugerido: GRUPOS.includes(destino as GrupoDocumentoEmbarque)
        ? (destino as GrupoDocumentoEmbarque)
        : null,
      razonSocial: texto(r.razonSocial),
      rfc: texto(r.rfc),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Avisos: traducción con fallback legible
//
// Los códigos los produce n8n y pueden crecer sin avisarnos. Un código nuevo
// jamás truena la pantalla ni se oculta: se muestra humanizado.
// ─────────────────────────────────────────────────────────────────────────────

const TRADUCCION_AVISOS: Record<string, string> = {
  rfc_no_coincide: 'El RFC del documento no coincide con el del cliente.',
  razon_social_no_coincide: 'La razón social del documento no coincide con la del cliente.',
  vencido: 'El documento está vencido.',
  proximo_a_vencer: 'El documento está próximo a vencer.',
  ilegible: 'El documento es difícil de leer; los datos extraídos pueden estar incompletos.',
  incompleto: 'El documento parece estar incompleto (faltan páginas o secciones).',
  contenedor_no_coincide:
    'Los contenedores del documento no coinciden con los del embarque — puede ser de otro embarque.',
  folio_no_coincide: 'El folio del documento no corresponde a este embarque.',
  cliente_no_coincide: 'El documento menciona a otro cliente.',
  sin_fecha: 'No se encontró la fecha del documento.',
  sin_firma: 'El documento no parece estar firmado.',
  moneda_no_detectada: 'No se pudo determinar la moneda de los importes.',
  // Flujo embarque (contenedor_no_coincide ya está arriba)
  factura_sin_total: 'La factura no trae un total legible.',
  sin_numero_documento: 'No se encontró el número del documento.',
};

/** Traduce un código de aviso. Desconocido → humanizado, nunca oculto. */
export function traducirAviso(codigo: string): string {
  const conocido = TRADUCCION_AVISOS[codigo];
  if (conocido) return conocido;
  const humanizado = codigo.replace(/_/g, ' ').trim();
  return `Aviso del clasificador: «${humanizado || codigo}».`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Tipo esperado vs detectado
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolucionTipo {
  coincide: boolean;
  /** Mensaje para la revisión cuando no coinciden. */
  mensaje?: string;
}

/**
 * El usuario dijo qué documento subía (tipoEsperado) y el clasificador detectó
 * otra cosa. No es error de nadie todavía — a veces el usuario se equivoca de
 * archivo, a veces la IA se equivoca de tipo. La revisión muestra ambos y el
 * usuario corrige con un select.
 */
export function resolverTipoEsperado(
  esperado: string | null | undefined,
  detectado: string,
  etiqueta: (tipo: string) => string,
): ResolucionTipo {
  if (!esperado || esperado === detectado) return { coincide: true };
  return {
    coincide: false,
    mensaje: `Subiste esto como «${etiqueta(esperado)}», pero el clasificador lo lee como «${etiqueta(detectado)}». Confirma cuál es.`,
  };
}

export function etiquetaDocExpediente(tipo: string): string {
  const item = DOCUMENTOS_EXPEDIENTE.find(d => d.tipo === tipo);
  return item ? item.etiqueta : tipo === 'otro' ? 'Otro documento' : tipo.replace(/_/g, ' ');
}

export function etiquetaDocEmbarque(tipo: string): string {
  return ETIQUETA_DOC_EMBARQUE[tipo as TipoDocEmbarque] ?? tipo.replace(/_/g, ' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// 5 · Qué bloquea el guardado y con qué estado queda
//
// El criterio de TA-5: no dejar salir documentos a medias. Pero un documento
// con reparos NO se rechaza — se guarda marcado. Un doc legal con el RFC
// discrepante debe quedar visible en el expediente, no en el limbo.
// ─────────────────────────────────────────────────────────────────────────────

export type EstadoDocumento = 'pendiente' | 'cargado' | 'con_observaciones';

export interface RevisionParaGuardar {
  /** El tipo YA confirmado por el usuario en la revisión. */
  tipoConfirmado: string | null;
  /** El nombre con el que se guardará (editable; parte del propuesto). */
  nombre: string;
  legible: boolean;
  vencido: boolean;
  avisos: string[];
}

export interface VeredictoGuardado {
  puedeGuardar: boolean;
  /** Qué falta, en el orden en que hay que resolverlo. Vacío si puede guardar. */
  faltantes: string[];
  /** Estado con el que quedaría el documento al guardarse. */
  estadoResultante: EstadoDocumento;
}

export function estadoGuardable(rev: RevisionParaGuardar): VeredictoGuardado {
  const faltantes: string[] = [];
  if (!rev.tipoConfirmado) faltantes.push('Confirma el tipo de documento.');
  if (!rev.nombre.trim()) faltantes.push('El documento necesita un nombre.');

  // Ilegible, vencido o con avisos → se guarda, pero nunca como completo.
  const conObservaciones = !rev.legible || rev.vencido || rev.avisos.length > 0;

  return {
    puedeGuardar: faltantes.length === 0,
    faltantes,
    estadoResultante: conObservaciones ? 'con_observaciones' : 'cargado',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6 · El checklist del expediente y la derivación de DocsAlta
// ─────────────────────────────────────────────────────────────────────────────

/** Referencia guardada en el cliente por cada documento del expediente. */
export interface DocExpediente {
  nombre: string;
  nombreOriginal: string;
  storagePath: string;
  /** URL de descarga de Storage, para abrir el documento desde la ficha. */
  url: string;
  confianza: NivelConfianza;
  estado: EstadoDocumento;
  datos: Record<string, unknown>;
  avisos: string[];
  observaciones?: string;
  subidoPor: string;
  fechaSubida: string; // ISO
}

export type ExpedienteCliente = Partial<Record<TipoDocExpediente, DocExpediente>>;

export function estadoChecklist(
  expediente: ExpedienteCliente | undefined,
  tipo: TipoDocExpediente,
): EstadoDocumento {
  const doc = expediente?.[tipo];
  if (!doc) return 'pendiente';
  return doc.estado === 'con_observaciones' ? 'con_observaciones' : 'cargado';
}

export const TIPO_A_DOCSALTA: Record<TipoDocExpediente, keyof DocsAlta> = {
  acta_constitutiva: 'acta',
  poder_notarial: 'poder',
  identificacion_oficial: 'identificacion',
  constancia_situacion_fiscal: 'csf',
  comprobante_domicilio: 'comprobante',
  caratula_bancaria: 'bancaria',
};

/**
 * Deriva los booleanos legacy de `docsAlta` a partir del expediente.
 *
 * Solo ENCIENDE: un checkbox marcado a mano antes de que existiera el
 * expediente sigue valiendo — el documento físico puede estar en la oficina
 * sin haberse digitalizado, y apagárselo diría «te falta» a quien ya cumplió.
 */
export function derivarDocsAlta(
  actual: DocsAlta,
  expediente: ExpedienteCliente | undefined,
): DocsAlta {
  const resultado = { ...actual };
  if (!expediente) return resultado;
  (Object.keys(TIPO_A_DOCSALTA) as TipoDocExpediente[]).forEach(tipo => {
    if (expediente[tipo]) resultado[TIPO_A_DOCSALTA[tipo]] = true;
  });
  return resultado;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7 · Precarga de factura de proveedor (flujo embarque → OC)
// ─────────────────────────────────────────────────────────────────────────────

export interface PrecargaFactura {
  emisor: string;
  numeroDocumento: string;
  fecha: string;
  total: number | null;
  /**
   * Bloque 11a · Antes de impuestos. Es lo ÚNICO comparable contra lo que
   * Pricing cotizó, que también va antes de IVA.
   *
   * El extractor ya lo devuelve —verificado con la debit note de Asia Ship:
   * subtotal 6,197, iva 0, total 6,197— y la app simplemente lo tiraba. Sin
   * él, `margenRealConcepto` cae en `factura_con_iva` y nunca compara.
   *
   * `null` = el documento no lo declaró. No se deriva de `total − iva`
   * cuando falta alguno: un subtotal inventado se ve idéntico a uno leído.
   */
  subtotal: number | null;
  /** Lo que el documento declara de impuesto. Informativo. */
  iva: number | null;
  moneda: string;
  conceptos: string[];
}

/** Extrae de `datos` lo que la carga de factura de la OC puede precargar. */
export function precargaFacturaProveedor(datos: Record<string, unknown>): PrecargaFactura {
  const numero = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

  const total = numero(datos.total);
  /*
   * Un proveedor extranjero factura sin IVA, y ahí subtotal y total son el
   * mismo número. El extractor los devuelve iguales; si alguno faltara NO se
   * despeja del otro, porque un subtotal calculado a partir de un IVA que no
   * se leyó bien se ve igual de creíble que uno correcto.
   */
  const subtotal = numero(datos.subtotal);
  const iva = typeof datos.iva === 'number' && Number.isFinite(datos.iva) ? datos.iva : null;

  return {
    emisor: texto(datos.emisor),
    numeroDocumento: texto(datos.numeroDocumento),
    fecha: texto(datos.fecha),
    total,
    subtotal,
    iva,
    moneda: texto(datos.moneda).toUpperCase(),
    conceptos: Array.isArray(datos.conceptos)
      ? datos.conceptos.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
      : [],
  };
}

export interface CotejoFactura {
  coincide: boolean;
  /** null cuando no hay qué cotejar (sin total, o monedas distintas sin comparar). */
  mensaje: string | null;
}

/**
 * Coteja el total de la factura contra el monto de la OC. §4.3: si las
 * monedas difieren NO se comparan los números — 1,200 USD contra 1,200 MXN
 * «coinciden» solo si ignoras la moneda, que es exactamente el bug prohibido.
 */
export function cotejarTotalConOC(
  factura: PrecargaFactura,
  oc: { monto: number; moneda: string },
): CotejoFactura {
  if (factura.total === null) {
    return { coincide: false, mensaje: 'La factura no trae total legible; captura el monto a mano.' };
  }
  if (factura.moneda && factura.moneda !== oc.moneda.toUpperCase()) {
    return {
      coincide: false,
      mensaje: `La factura está en ${factura.moneda} y la orden de compra en ${oc.moneda}. Verifica antes de asociarla.`,
    };
  }
  // Tolerancia de 1 peso/dólar: redondeos de IVA producen diferencias de centavos.
  if (Math.abs(factura.total - oc.monto) <= 1) {
    return { coincide: true, mensaje: null };
  }
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return {
    coincide: false,
    mensaje: `El total de la factura (${oc.moneda} ${fmt(factura.total)}) no coincide con el de la orden de compra (${oc.moneda} ${fmt(oc.monto)}).`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8 · Adopción de datos extraídos en la ficha del cliente (D-2)
//
// La constancia trae el RFC y el domicilio; el acta trae al representante.
// Son justo los campos de la ficha — pero NADA se adopta en automático: cada
// campo se ofrece con confirmación explícita, y si la ficha ya tiene otro
// valor, se muestran lado a lado para que el usuario decida cuál es el bueno.
// ─────────────────────────────────────────────────────────────────────────────

export interface CampoAdoptable {
  /** Campo de ClienteVermur donde escribiría. */
  campo: 'rfc' | 'representante' | 'domicilio' | 'codigoPostal';
  etiqueta: string;
  valorDocumento: string;
  /** Lo que la ficha tiene hoy. Vacío si no hay nada. */
  valorActual: string;
  /** true = la ficha ya dice OTRA cosa: mostrar lado a lado, no precargar. */
  enConflicto: boolean;
}

/**
 * Cruza lo extraído contra la ficha. Solo ofrece campos donde el documento
 * trae algo; si la ficha ya tiene el mismo valor, no hay nada que adoptar.
 */
export function camposAdoptablesExpediente(
  clasificacion: Pick<ClasificacionValidada, 'rfc' | 'datos'>,
  cliente: { rfc?: string; representante?: string; domicilio?: string; codigoPostal?: string | null },
): CampoAdoptable[] {
  const candidatos: { campo: CampoAdoptable['campo']; etiqueta: string; valorDocumento: string }[] = [
    { campo: 'rfc', etiqueta: 'RFC', valorDocumento: clasificacion.rfc },
    { campo: 'representante', etiqueta: 'Representante legal', valorDocumento: texto(clasificacion.datos.representanteLegal) },
    { campo: 'domicilio', etiqueta: 'Domicilio fiscal', valorDocumento: texto(clasificacion.datos.domicilio) },
    { campo: 'codigoPostal', etiqueta: 'Código postal', valorDocumento: texto(clasificacion.datos.codigoPostal) },
  ];

  const resultado: CampoAdoptable[] = [];
  for (const c of candidatos) {
    if (!c.valorDocumento) continue;
    const valorActual = (cliente[c.campo] ?? '').trim();
    // Mismo valor (RFC compara sin mayúsculas/minúsculas): nada que adoptar.
    const iguales = c.campo === 'rfc'
      ? valorActual.toUpperCase() === c.valorDocumento.toUpperCase()
      : valorActual === c.valorDocumento;
    if (iguales) continue;
    resultado.push({
      ...c,
      valorActual,
      enConflicto: valorActual !== '',
    });
  }
  return resultado;
}
