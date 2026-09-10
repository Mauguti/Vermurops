/**
 * entidadesEmbarque.ts
 *
 * Los roles del embarque —shipper, consignatario, agente aduanal, cliente a
 * cobrar…— y su enlace al catálogo.
 *
 * ── La regla ───────────────────────────────────────────────────────────────
 * El NOMBRE es lo que se imprime en el BL y siempre es texto: un shipper de
 * Shanghai no está en el catálogo ni tiene por qué estarlo. El ENLACE es
 * aparte y opcional: existe solo cuando la entidad se eligió del catálogo, y
 * es lo único que da a dónde ir. Un nombre sin enlace es una excepción no
 * validada y se ve como texto.
 *
 * Elegir del catálogo escribe las dos cosas; teclear un nombre distinto
 * borra el enlace, porque un enlace a una ficha cuyo nombre ya no coincide es
 * una mentira que se ve creíble.
 *
 * Sin React, sin Firestore.
 */

import type {
  EmbarqueEntidades, EntidadesRef, RefEntidad, RolEnlazable, ModalidadEmbarque,
} from '../components/shipments/EmbarquesData';

// ─── Qué catálogo le toca a cada rol ─────────────────────────────────────────

/**
 * Cliente a cobrar e importador de registro son el cliente; el resto son
 * proveedores (§4.5: agentes, navieras y aduanales viven en una sola
 * colección con `tipos[]`). Decisión de Mau (10-sep-2026).
 */
export const COLECCION_POR_ROL: Record<RolEnlazable, RefEntidad['coleccion']> = {
  clienteCobrar: 'clientes',
  importador: 'clientes',
  expedidor: 'proveedores',
  consignatario: 'proveedores',
  notificar: 'proveedores',
  agenteAduanal: 'proveedores',
  agenteCarga: 'proveedores',
  agenteDestino: 'proveedores',
  transportista: 'proveedores',
};

/**
 * Modalidad que ORDENA el selector de proveedores para ese rol (no filtra:
 * el catálogo no tiene tipo «agente aduanal» ni «naviera»; agregarlos toca
 * los 544 proveedores y quedó como deuda). Null = sin orden especial.
 */
export function modalidadRelevantePara(
  rol: RolEnlazable,
  modalidadEmbarque: ModalidadEmbarque | string | undefined,
): 'maritimo' | 'aereo' | 'terrestre' | 'aduanal' | undefined {
  if (rol === 'agenteAduanal') return 'aduanal';
  if (rol === 'transportista' || rol === 'agenteCarga' || rol === 'agenteDestino') {
    return modalidadEmbarque === 'maritimo' || modalidadEmbarque === 'aereo' || modalidadEmbarque === 'terrestre'
      ? modalidadEmbarque
      : undefined;
  }
  return undefined;
}

// ─── Lectura ──────────────────────────────────────────────────────────────────

export function refDe(refs: EntidadesRef | undefined, rol: RolEnlazable): RefEntidad | null {
  return refs?.[rol] ?? null;
}

/** ¿El rol salió del catálogo? Solo entonces hay ficha a la que ir. */
export function estaValidada(refs: EntidadesRef | undefined, rol: RolEnlazable): boolean {
  return refDe(refs, rol) !== null;
}

// ─── Escritura ────────────────────────────────────────────────────────────────

export interface EleccionCatalogo {
  id: string;
  nombre: string;
  coleccion: RefEntidad['coleccion'];
}

/**
 * Eligió del catálogo: nombre Y enlace, juntos.
 *
 * Se rechaza una entidad de la colección equivocada —un proveedor como
 * cliente a cobrar— en vez de guardarla: el enlace llevaría a la ficha
 * equivocada y Facturación leería crédito de quien no es.
 */
export function vincular(
  refs: EntidadesRef | undefined,
  rol: RolEnlazable,
  eleccion: EleccionCatalogo,
): { refs: EntidadesRef; nombre: string } {
  if (eleccion.coleccion !== COLECCION_POR_ROL[rol]) {
    throw new Error(
      `«${rol}» se elige de ${COLECCION_POR_ROL[rol]}, no de ${eleccion.coleccion}.`,
    );
  }
  return {
    refs: { ...(refs ?? {}), [rol]: { id: eleccion.id, coleccion: eleccion.coleccion } },
    nombre: eleccion.nombre,
  };
}

/**
 * Tecleó un nombre: se queda el texto y se suelta el enlace.
 *
 * Si el nombre es idéntico al vinculado no se toca nada —reabrir el campo y
 * salir sin cambios no debe desvalidar la entidad.
 */
export function escribirNombre(
  refs: EntidadesRef | undefined,
  rol: RolEnlazable,
  nombreNuevo: string,
  nombreActual: string,
): { refs: EntidadesRef; nombre: string } {
  const copia: EntidadesRef = { ...(refs ?? {}) };
  if (nombreNuevo.trim() !== nombreActual.trim()) delete copia[rol];
  return { refs: copia, nombre: nombreNuevo };
}

export function desvincular(refs: EntidadesRef | undefined, rol: RolEnlazable): EntidadesRef {
  const copia: EntidadesRef = { ...(refs ?? {}) };
  delete copia[rol];
  return copia;
}

// ─── El cliente del embarque ─────────────────────────────────────────────────

/**
 * Por enlace primero; por nombre como fallback para los embarques anteriores
 * al enlace. El fallback es exacto, no aproximado: un «contiene» apuntaría a
 * la matriz cuando el embarque es de la filial, y de ahí sale el crédito.
 */
export function clienteDelEmbarque<T extends { id: string; nombre: string }>(
  embarque: { entidades?: Partial<EmbarqueEntidades>; entidadesRef?: EntidadesRef },
  clientes: readonly T[],
): T | null {
  const ref = refDe(embarque.entidadesRef, 'clienteCobrar');
  if (ref) {
    const porId = clientes.find(c => c.id === ref.id);
    if (porId) return porId;
  }
  const nombre = embarque.entidades?.clienteCobrar?.trim();
  if (!nombre) return null;
  return clientes.find(c => c.nombre.trim() === nombre) ?? null;
}

/**
 * Los enlaces que un embarque hereda de su cotización: el cliente vinculado
 * (E6) es el cliente a cobrar. El consignatario NO se enlaza aunque hoy se
 * copie el mismo nombre: es rol de proveedor y no siempre es el cliente.
 */
export function refsDesdeCotizacion(quote: { clienteId?: string | null }): EntidadesRef {
  if (!quote.clienteId) return {};
  return { clienteCobrar: { id: quote.clienteId, coleccion: 'clientes' } };
}
