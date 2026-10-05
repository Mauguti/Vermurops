/**
 * loteDocumentos.ts — Tarea 63
 *
 * Un solo botón «Subir documentos» que acepta varios archivos a la vez, los
 * manda al clasificador y arma una lista para confirmar de un jalón.
 *
 * ── El problema que resuelve ───────────────────────────────────────────────
 * Gaby: «se vuelven 15 documentos… me equivoqué, puse la constancia en el
 * acta». Un botón por casilla obliga a acertar la casilla ANTES de subir, y
 * el error queda guardado con cara de correcto: la constancia aparece como
 * acta y el checklist dice que el acta está. Con un solo botón, el tipo lo
 * propone el clasificador DESPUÉS de leer el documento, y se corrige en la
 * misma pantalla antes de que nada se guarde.
 *
 * ── El principio, el de §4.10 ──────────────────────────────────────────────
 * n8n PROPONE; la app DECIDE y ESCRIBE. La lista del lote ES la pantalla de
 * revisión: nada toca Firestore hasta que se confirma ahí. Y la clasificación
 * es de MEJOR ESFUERZO: si el agente no contesta, se equivoca o devuelve un
 * tipo que no existe en este contexto, el renglón queda «Sin clasificar» y lo
 * resuelve la persona. Un lote de 15 archivos no se cae porque uno falle.
 *
 * Sin React, sin Firestore, sin red.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Catálogos
// ─────────────────────────────────────────────────────────────────────────────

/** Un tipo de documento posible en un contexto (expediente, orden de compra…). */
export interface TipoDocLote {
  tipo: string;
  etiqueta: string;
}

/**
 * Documentos de la orden de compra (modelo aprobado de la tarea 63).
 *
 * `complemento_pago` es el que no tenía dónde cargarse: el proveedor lo emite
 * DESPUÉS de cobrar y hoy se quedaba en el correo de Administración.
 */
export type TipoDocOC =
  | 'factura'
  | 'complemento_pago'
  | 'comprobante_pago'
  | 'cotizacion_proveedor'
  | 'otro';

export const DOCUMENTOS_OC: TipoDocLote[] = [
  { tipo: 'factura', etiqueta: 'Factura del proveedor' },
  { tipo: 'complemento_pago', etiqueta: 'Complemento de pago' },
  { tipo: 'comprobante_pago', etiqueta: 'Comprobante de pago' },
  { tipo: 'cotizacion_proveedor', etiqueta: 'Cotización del proveedor' },
  { tipo: 'otro', etiqueta: 'Otro documento' },
];

export const ETIQUETA_DOC_OC: Record<string, string> = Object.fromEntries(
  DOCUMENTOS_OC.map(d => [d.tipo, d.etiqueta]),
);

export function etiquetaDocOC(tipo: string): string {
  return ETIQUETA_DOC_OC[tipo] ?? tipo.replace(/_/g, ' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Normalización del tipo que devolvió el agente
//
// El clasificador es externo: puede contestar 'csf', 'constancia fiscal',
// 'CONSTANCIA_SITUACION_FISCAL' o 'rep' para lo mismo, y puede contestar un
// tipo que en ESTE contexto no existe (un BL en el expediente del cliente).
// Un tipo que no se reconoce NO se fuerza al más parecido: queda sin
// clasificar. Adivinar la casilla es exactamente el error de Gaby, con la
// diferencia de que nadie lo escribió.
// ─────────────────────────────────────────────────────────────────────────────

/** Quita acentos, mayúsculas y separadores para comparar. */
function clave(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s.\-/]+/g, '_')
    .replace(/_+/g, '_');
}

/**
 * Sinónimos conocidos → tipo canónico. Crece sin tocar la lógica.
 *
 * Incluye los tipos de las otras taxonomías que ya existen (la del embarque
 * manda `factura_proveedor`), porque el mismo documento se sube desde varios
 * lados y el agente puede contestar con el vocabulario de otro flujo.
 */
const SINONIMOS: Record<string, string> = {
  // Expediente KYC
  csf: 'constancia_situacion_fiscal',
  constancia: 'constancia_situacion_fiscal',
  constancia_fiscal: 'constancia_situacion_fiscal',
  constancia_de_situacion_fiscal: 'constancia_situacion_fiscal',
  situacion_fiscal: 'constancia_situacion_fiscal',
  acta: 'acta_constitutiva',
  acta_constitutiva_y_estatutos: 'acta_constitutiva',
  poder: 'poder_notarial',
  poder_notarial_representante: 'poder_notarial',
  identificacion: 'identificacion_oficial',
  ine: 'identificacion_oficial',
  pasaporte: 'identificacion_oficial',
  comprobante_de_domicilio: 'comprobante_domicilio',
  domicilio: 'comprobante_domicilio',
  caratula_banco: 'caratula_bancaria',
  caratula_de_estado_de_cuenta: 'caratula_bancaria',
  estado_de_cuenta: 'caratula_bancaria',
  estado_cuenta: 'caratula_bancaria',
  estado_de_cuenta_bancario: 'caratula_bancaria',
  // Orden de compra
  factura_proveedor: 'factura',
  factura_de_proveedor: 'factura',
  cfdi: 'factura',
  cfdi_ingreso: 'factura',
  rep: 'complemento_pago',
  complemento_de_pago: 'complemento_pago',
  complemento_de_recepcion_de_pagos: 'complemento_pago',
  recepcion_de_pagos: 'complemento_pago',
  cfdi_pago: 'complemento_pago',
  comprobante_de_pago: 'comprobante_pago',
  transferencia: 'comprobante_pago',
  comprobante_transferencia: 'comprobante_pago',
  spei: 'comprobante_pago',
  cotizacion: 'cotizacion_proveedor',
  cotizacion_de_proveedor: 'cotizacion_proveedor',
};

/**
 * Traduce lo que dijo el agente a un tipo del catálogo de este contexto.
 *
 * Devuelve `null` cuando no se puede afirmar el tipo: vacío, 'otro', o un
 * tipo que este contexto no tiene. `null` = «Sin clasificar», que la pantalla
 * pide resolver a mano. 'otro' sí se respeta cuando el catálogo lo ofrece
 * (la orden de compra lo ofrece; el checklist del expediente no).
 */
export function normalizarTipoClasificado(
  crudo: string | null | undefined,
  catalogo: TipoDocLote[],
): string | null {
  const k = clave(crudo ?? '');
  if (!k) return null;

  const existe = (t: string) => catalogo.some(c => clave(c.tipo) === clave(t));

  if (existe(k)) return catalogo.find(c => clave(c.tipo) === k)!.tipo;

  const sinonimo = SINONIMOS[k];
  if (sinonimo && existe(sinonimo)) {
    return catalogo.find(c => clave(c.tipo) === clave(sinonimo))!.tipo;
  }

  // Última pasada: el agente pudo contestar con la etiqueta en vez del id
  // («Complemento de pago» en lugar de 'complemento_pago').
  const porEtiqueta = catalogo.find(c => clave(c.etiqueta) === k);
  if (porEtiqueta) return porEtiqueta.tipo;

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Los renglones del lote
// ─────────────────────────────────────────────────────────────────────────────

export type EstadoLinea = 'procesando' | 'listo' | 'error';

export interface LineaLote {
  /** Id local del renglón; no se guarda. */
  id: string;
  nombreArchivo: string;
  estado: EstadoLinea;
  /** Por qué falló (subida o clasificador). Solo con estado 'error'. */
  error?: string;
  /** Lo que contestó el agente, literal. Vacío si no contestó. */
  tipoCrudo: string;
  /** El tipo que el agente propuso, ya traducido. null = sin clasificar. */
  tipoPropuesto: string | null;
  /** El tipo con el que se guardará. Arranca en el propuesto. */
  tipoElegido: string | null;
  /** true si la persona lo cambió respecto a lo que propuso el agente. */
  corregidoAMano: boolean;
  /** Nivel de confianza del agente, tal como lo devolvió. */
  confianza?: 'alta' | 'media' | 'baja';
  /** Avisos crudos del clasificador (se traducen en la UI). */
  avisos: string[];
  /** Texto libre del clasificador. */
  observaciones?: string;
  /** Lo que el agente extrajo; cada contexto decide qué usa. */
  datos?: Record<string, unknown>;
  /** D-2 · RFC y razón social que leyó el agente, para ofrecer adopción. */
  rfc?: string;
  razonSocial?: string;
  /** Dónde quedó el archivo en Storage. Vacío si la subida falló. */
  storagePath: string;
  url: string;
  /** Nombre con el que se guarda (el propuesto por el agente o el original). */
  nombre: string;
}

export interface ResumenLote {
  total: number;
  /** Renglones con tipo resuelto (por el agente o a mano). */
  conTipo: number;
  /** Renglones que esperan que alguien elija el tipo. */
  sinClasificar: number;
  conError: number;
  procesando: number;
  /** Cuántos cambió la persona. Va al registro de auditoría. */
  corregidos: number;
  puedeGuardar: boolean;
  /** Qué falta para poder guardar, en una línea. Vacío si ya se puede. */
  faltante: string;
}

/**
 * Qué se puede guardar del lote.
 *
 * Los renglones en error NO bloquean: se quitan del lote y los demás se
 * guardan. Los que esperan tipo SÍ bloquean — guardar un documento sin tipo
 * lo dejaría invisible en el expediente, que es el modo de fallo que la
 * tarea 63 viene a cerrar.
 */
export function resumenLote(lineas: LineaLote[]): ResumenLote {
  const utiles = lineas.filter(l => l.estado === 'listo');
  const conTipo = utiles.filter(l => l.tipoElegido).length;
  const sinClasificar = utiles.length - conTipo;
  const procesando = lineas.filter(l => l.estado === 'procesando').length;
  const conError = lineas.filter(l => l.estado === 'error').length;

  let faltante = '';
  if (procesando > 0) {
    faltante = procesando === 1
      ? 'Falta que termine de procesarse un archivo.'
      : `Faltan ${procesando} archivos por procesarse.`;
  } else if (utiles.length === 0) {
    faltante = 'No hay documentos que guardar.';
  } else if (sinClasificar > 0) {
    faltante = sinClasificar === 1
      ? 'Elige el tipo del documento sin clasificar.'
      : `Elige el tipo de los ${sinClasificar} documentos sin clasificar.`;
  }

  return {
    total: lineas.length,
    conTipo,
    sinClasificar,
    conError,
    procesando,
    corregidos: utiles.filter(l => l.corregidoAMano).length,
    puedeGuardar: faltante === '',
    faltante,
  };
}

/**
 * Dos archivos del mismo lote con el mismo tipo.
 *
 * Importa cuando el destino guarda UN documento por tipo —el expediente del
 * cliente y el del proveedor son mapas indexados por tipo— porque el segundo
 * pisaría al primero sin decirlo. En la orden de compra, que guarda una
 * lista, conviven: no se avisa de lo que no es un problema.
 */
export function conflictosDeTipo(lineas: LineaLote[]): { tipo: string; archivos: string[] }[] {
  const porTipo = new Map<string, string[]>();
  for (const l of lineas) {
    if (l.estado !== 'listo' || !l.tipoElegido) continue;
    const lista = porTipo.get(l.tipoElegido) ?? [];
    lista.push(l.nombreArchivo);
    porTipo.set(l.tipoElegido, lista);
  }
  return [...porTipo.entries()]
    .filter(([, archivos]) => archivos.length > 1)
    .map(([tipo, archivos]) => ({ tipo, archivos }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 · El registro de la corrección (punto 5 de la tarea)
//
// «Se puede corregir el tipo a mano; queda registrado quién lo cambió.»
//
// Se redacta como texto porque es donde cabe sin tocar el modelo: el
// expediente del cliente ya tiene `observaciones` en cada documento, y la
// orden de compra lo guarda en el campo homónimo de su lista nueva. Un campo
// estructurado sería más limpio y está propuesto en el reporte de la tarea.
// ─────────────────────────────────────────────────────────────────────────────

export interface CorreccionTipo {
  /** Lo que propuso el agente (crudo, como lo dijo). Vacío = no propuso nada. */
  tipoCrudo: string;
  /** El tipo que quedó. */
  tipoFinal: string;
  /** Quién lo cambió: correo o nombre. */
  por: string;
  /** ISO. */
  fecha: string;
  etiqueta: (tipo: string) => string;
}

/**
 * La línea que queda en el documento cuando alguien corrige el tipo.
 *
 * Dice las dos cosas: qué leyó el agente y qué decidió la persona. Guardar
 * solo lo segundo escondería que el clasificador se equivocó, que es
 * justamente lo que hay que poder ver para arreglar el flujo de n8n.
 */
export function textoCorreccionTipo(c: CorreccionTipo): string {
  const dia = c.fecha.slice(0, 10);
  const leido = c.tipoCrudo.trim()
    ? `el clasificador lo leyó como «${c.etiqueta(c.tipoCrudo)}»`
    : 'el clasificador no pudo determinar el tipo';
  return `Tipo corregido a mano a «${c.etiqueta(c.tipoFinal)}» por ${c.por || 'un usuario'} el ${dia}: ${leido}.`;
}

/** Junta la observación del agente con la nota de corrección, sin perder ninguna. */
export function observacionesConCorreccion(
  observacionesAgente: string | undefined,
  correccion: string | null,
): string | undefined {
  const partes = [observacionesAgente?.trim(), correccion?.trim()].filter(
    (p): p is string => !!p,
  );
  return partes.length > 0 ? partes.join(' · ') : undefined;
}
