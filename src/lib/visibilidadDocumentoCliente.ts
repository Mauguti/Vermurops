/**
 * visibilidadDocumentoCliente.ts
 *
 * Qué documentos del embarque puede ver el cliente.
 *
 * ── Por qué la regla es por TIPO y no una palomita ─────────────────────────
 * Textual de la junta: «se les olvida». Un check opcional que alguien tiene
 * que acordarse de palomear falla en la dirección peligrosa: el documento que
 * NO debía salir sale, porque nadie lo despalomeó.
 *
 * El clasificador ya dice de qué tipo es cada documento, así que el tipo
 * decide el valor inicial y nadie tiene que recordar nada. Marcar a mano sigue
 * existiendo, pero como excepción declarada, no como paso obligatorio.
 *
 * ── Las tres clases ────────────────────────────────────────────────────────
 *   visible    La factura al cliente es suya: la está esperando.
 *   sensible   Factura de proveedor, carta de encomienda y pedimento. Nunca
 *              salen solas. La de proveedor es la más delicada de las tres:
 *              dice lo que Vermur paga, o sea el margen. Se pueden marcar a
 *              mano, pero la pantalla tiene que decir qué se está enseñando.
 *   interno    Todo lo demás: nace oculto y se marca sin ceremonia.
 *
 * ── La salvedad que hay que decir en voz alta ──────────────────────────────
 * Hoy los archivos se guardan con `getDownloadURL()`, que devuelve una URL
 * con token: abre el archivo SIN sesión y sin pasar por las reglas. Mientras
 * eso siga así, esta marca es una convención de la interfaz, no un control de
 * acceso: sirve para decidir qué se le enseña al cliente en el portal, no para
 * impedir que alguien abra lo que no debía. Se cierra con URLs firmadas con
 * vencimiento generadas por una Function.
 *
 * Lógica pura: sin React ni Firestore.
 */

import type { EmbarqueDocumento } from '../components/shipments/EmbarquesData';

export type ClaseVisibilidad = 'visible' | 'interno' | 'sensible';

/**
 * Nunca salen por defecto, y marcarlas a mano se avisa.
 *
 * No es una lista de «documentos feos»: cada una filtra algo concreto.
 */
const SENSIBLES: Record<string, string> = {
  factura_proveedor:
    'Dice cuánto le paga Vermur al proveedor: enseñarla revela el margen del embarque.',
  carta_encomienda:
    'Es el poder que el cliente le da al agente aduanal. Va firmada y no se reparte.',
  pedimento:
    'Documento fiscal del despacho. Se entrega cuando Administración lo libera, no al subirlo.',
};

/** Nacen visibles: son del cliente y los está esperando. */
const VISIBLES = new Set<string>([
  'factura_cliente',
  // Legacy: los documentos anteriores a D-3 usan `factura` para la del cliente.
  'factura',
]);

export interface ReglaVisibilidad {
  clase: ClaseVisibilidad;
  /** Con qué valor nace el documento si nadie lo marca. */
  porDefecto: boolean;
  /** Por qué. Se enseña en la pantalla; nunca es una cadena vacía. */
  razon: string;
}

/** La regla de un tipo. Un tipo desconocido cae en interno, que es lo seguro. */
export function reglaDeTipo(tipo: string): ReglaVisibilidad {
  const sensible = SENSIBLES[tipo];
  if (sensible) return { clase: 'sensible', porDefecto: false, razon: sensible };

  if (VISIBLES.has(tipo)) {
    return {
      clase: 'visible',
      porDefecto: true,
      razon: 'Es la factura del cliente: la está esperando.',
    };
  }

  return {
    clase: 'interno',
    porDefecto: false,
    razon: 'Los documentos del embarque nacen internos. Márcalo si el cliente debe verlo.',
  };
}

/**
 * ¿Este documento lo ve el cliente?
 *
 * Respaldo del valor viejo: los documentos guardados antes de este bloque no
 * traen `visibleCliente`, y se leen con la regla de su tipo. Nada se reescribe.
 */
export function esVisibleParaCliente(doc: EmbarqueDocumento): boolean {
  if (typeof doc.visibleCliente === 'boolean') return doc.visibleCliente;
  return reglaDeTipo(doc.tipo).porDefecto;
}

/** ¿Se marcó a mano, contra lo que dictaba su tipo? */
export function esExcepcion(doc: EmbarqueDocumento): boolean {
  if (typeof doc.visibleCliente !== 'boolean') return false;
  return doc.visibleCliente !== reglaDeTipo(doc.tipo).porDefecto;
}

/**
 * Lo que hay que advertir antes de marcarlo visible. `null` = adelante.
 *
 * Se responde con el texto y no con un booleano: un aviso sin motivo se
 * vuelve un paso que la gente aprende a saltarse.
 */
export function advertenciaAlMostrar(tipo: string): string | null {
  const r = reglaDeTipo(tipo);
  return r.clase === 'sensible' ? r.razon : null;
}

/** Los que el cliente vería hoy. El portal leerá exactamente esto. */
export function documentosParaCliente(docs: EmbarqueDocumento[]): EmbarqueDocumento[] {
  return docs.filter(esVisibleParaCliente);
}

export const ETIQUETA_CLASE: Record<ClaseVisibilidad, string> = {
  visible: 'Visible para el cliente',
  interno: 'Interno',
  sensible: 'Interno · sensible',
};
