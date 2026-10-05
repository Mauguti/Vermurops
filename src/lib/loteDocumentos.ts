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
 * Grupos de nombres que significan LO MISMO.
 *
 * Son grupos y no un mapa dirigido porque el mismo documento se llama
 * distinto en cada catálogo: el expediente del cliente lo indexa como
 * `constancia_situacion_fiscal` y el del proveedor como `csf` (su clave en
 * `DocsAlta`). Con grupos, los dos resuelven sin duplicar el mapa al revés.
 *
 * Incluye el vocabulario de las taxonomías que ya existen —la del embarque
 * manda `factura_proveedor`— porque el mismo documento se sube desde varios
 * lados y el agente puede contestar con el nombre de otro flujo.
 *
 * Lo que NO está aquí es lo ambiguo: «comprobante» a secas es comprobante de
 * domicilio en el expediente y comprobante de pago en la orden. Juntarlos
 * pondría un comprobante de pago en el checklist de alta.
 */
const GRUPOS_EQUIVALENTES: string[][] = [
  // ── Expediente KYC (nombres largos y claves de DocsAlta) ──
  ['constancia_situacion_fiscal', 'csf', 'constancia', 'constancia_fiscal',
   'constancia_de_situacion_fiscal', 'situacion_fiscal', 'documento_fiscal'],
  ['acta_constitutiva', 'acta', 'acta_constitutiva_y_estatutos'],
  ['poder_notarial', 'poder', 'poder_notarial_representante'],
  ['identificacion_oficial', 'identificacion', 'ine', 'pasaporte'],
  ['comprobante_domicilio', 'comprobante', 'comprobante_de_domicilio', 'domicilio'],
  ['caratula_bancaria', 'bancaria', 'caratula', 'caratula_banco',
   'caratula_de_estado_de_cuenta', 'estado_de_cuenta', 'estado_cuenta',
   'estado_de_cuenta_bancario'],
  // ── Orden de compra ──
  ['factura', 'factura_proveedor', 'factura_de_proveedor', 'cfdi', 'cfdi_ingreso'],
  ['complemento_pago', 'rep', 'complemento_de_pago', 'cfdi_pago',
   'complemento_de_recepcion_de_pagos', 'recepcion_de_pagos'],
  ['comprobante_pago', 'comprobante_de_pago', 'transferencia',
   'comprobante_transferencia', 'spei'],
  ['cotizacion_proveedor', 'cotizacion', 'cotizacion_de_proveedor'],
];

/** Todos los nombres equivalentes a uno dado, él incluido. */
function equivalentes(k: string): string[] {
  const grupo = GRUPOS_EQUIVALENTES.find(g => g.includes(k));
  return grupo ?? [k];
}

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

  // Exacto primero: el catálogo manda sobre cualquier equivalencia.
  const exacto = catalogo.find(c => clave(c.tipo) === k);
  if (exacto) return exacto.tipo;

  const grupo = equivalentes(k);
  const porGrupo = catalogo.find(c => grupo.includes(clave(c.tipo)));
  if (porGrupo) return porGrupo.tipo;

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
