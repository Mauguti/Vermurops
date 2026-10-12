/**
 * estiba.ts (tarea 99, 9-oct-2026)
 *
 * ¿La mercancía se puede estibar (apilar) y cuántos niveles? Cambia cómo se
 * carga la unidad y cuánto cabe, así que viaja de la solicitud al embarque.
 *
 * ── Dónde vive cada cosa ────────────────────────────────────────────────────
 *  - `estibable?: boolean` y `nivelesEstiba?: number | null` en cada tipo de
 *    carga y en los productos del embarque. Opcionales y aditivos.
 *  - El tope por modalidad vive AQUÍ y en ningún otro lado.
 *
 * ── Lo viejo no se reescribe ────────────────────────────────────────────────
 *  `lcl_estibable` y `ter_estibable` (E4) y el `estibable` del LCL se siguen
 *  leyendo. Estibable sin niveles es «Estibable (niveles sin indicar)»: no se
 *  inventa un número. Sin valor de `estibable` (aéreo, terrestre, FCL viejos)
 *  es «sin indicar», que no es lo mismo que «no estibable».
 *
 * Sin React, sin Firestore, sin red.
 */

export type ModalidadEstiba = 'maritimo' | 'aereo' | 'terrestre' | 'despacho_aduanal';

/**
 * Niveles máximos por modalidad. `null` = sin tope. Marítimo queda sin tope
 * (solo mínimo 1) hasta que Mau confirme el número.
 */
export const TOPE_NIVELES_ESTIBA: Record<ModalidadEstiba, number | null> = {
  terrestre: 5,
  aereo: 3,
  maritimo: null,
  despacho_aduanal: null,
};

const NOMBRE_MODALIDAD: Record<ModalidadEstiba, string> = {
  terrestre: 'terrestre',
  aereo: 'aéreo',
  maritimo: 'marítimo',
  despacho_aduanal: 'despacho',
};

/**
 * La modalidad de un embarque es texto libre («maritimo», «Aéreo»…). Lo que
 * no se reconoce como aéreo o terrestre cae a marítimo, la única sin tope:
 * un tope de más sobre una modalidad desconocida bloquearía capturas válidas.
 */
export function modalidadEstibaDeTexto(texto: string | undefined | null): ModalidadEstiba {
  const t = (texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (t.startsWith('aer')) return 'aereo';
  if (t.startsWith('terr')) return 'terrestre';
  return 'maritimo';
}

export function topeNivelesEstiba(modalidad: ModalidadEstiba): number | null {
  return TOPE_NIVELES_ESTIBA[modalidad];
}

/** Lo que se lee de Firestore: solo un entero ≥ 1 es un número de niveles. */
export function leerNivelesEstiba(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 ? valor : null;
}

/**
 * ¿Es válido este número de niveles para la modalidad? Devuelve el motivo para
 * mostrarlo, o null si pasa. Vacío (null/undefined) pasa: los niveles son
 * opcionales aun con la casilla marcada.
 */
export function problemaNivelesEstiba(
  modalidad: ModalidadEstiba,
  niveles: number | null | undefined,
): string | null {
  if (niveles == null) return null;
  if (!Number.isInteger(niveles) || niveles < 1) return 'Indica un número entero de 1 o más.';
  const tope = topeNivelesEstiba(modalidad);
  if (tope !== null && niveles > tope) {
    return `El máximo en ${NOMBRE_MODALIDAD[modalidad]} es ${tope}.`;
  }
  return null;
}

/** Texto del tope para el campo: «Máximo 5» o «Sin tope». */
export function textoTopeEstiba(modalidad: ModalidadEstiba): string {
  const tope = topeNivelesEstiba(modalidad);
  return tope === null ? 'Sin tope' : `Máximo ${tope}`;
}

export interface EstibaLeida {
  /** undefined = sin indicar. */
  estibable: boolean | undefined;
  niveles: number | null;
}

export interface CampoEstiba {
  estibable?: boolean;
  nivelesEstiba?: number | null;
}

/** La estiba de una carga o producto. No estibable ⇒ sin niveles, siempre. */
export function leerEstiba(fuente: CampoEstiba | null | undefined): EstibaLeida {
  const estibable = typeof fuente?.estibable === 'boolean' ? fuente.estibable : undefined;
  return { estibable, niveles: estibable === true ? leerNivelesEstiba(fuente?.nivelesEstiba) : null };
}

/**
 * Estiba de un servicio legacy (E4): `lcl_estibable` / `ter_estibable`.
 * Solo se mira el campo que corresponde a la modalidad.
 */
export function estibaLegacy(
  servicio: { lcl_estibable?: boolean; ter_estibable?: boolean },
  modalidad: 'lcl' | 'terrestre',
): boolean | undefined {
  const v = modalidad === 'lcl' ? servicio.lcl_estibable : servicio.ter_estibable;
  return typeof v === 'boolean' ? v : undefined;
}

/**
 * Texto completo para pantallas de detalle:
 * «Estibable ×3» · «No estibable» · «Estibable (niveles sin indicar)» · «Sin indicar».
 */
export function etiquetaEstiba(fuente: CampoEstiba | null | undefined): string {
  const { estibable, niveles } = leerEstiba(fuente);
  if (estibable === undefined) return 'Sin indicar';
  if (!estibable) return 'No estibable';
  return niveles ? `Estibable ×${niveles}` : 'Estibable (niveles sin indicar)';
}

/**
 * Texto corto para resúmenes de una línea y el PDF. Solo dice lo que se
 * DECIDIÓ: «no estibable» o «estibable ×3». Estibable sin niveles y sin
 * indicar no ensucian el resumen (el LCL viejo trae estibable=true por
 * omisión y todos dirían lo mismo).
 */
export function textoCortoEstiba(fuente: CampoEstiba | null | undefined): string | null {
  const { estibable, niveles } = leerEstiba(fuente);
  if (estibable === false) return 'no estibable';
  if (estibable === true && niveles) return `estibable ×${niveles}`;
  return null;
}

/**
 * La estiba con casilla y niveles puestos. Devuelve una carga NUEVA y BORRA
 * las claves vacías (Firestore rechaza `undefined`). No estibable ⇒ se quita
 * `nivelesEstiba`; `estibable` queda siempre escrito (false o true), que el LCL lo exige.
 */
export function conEstiba<T extends CampoEstiba>(
  fuente: T,
  estibable: boolean,
  niveles: number | null,
): T {
  const { estibable: _e, nivelesEstiba: _n, ...resto } = fuente;
  const base = resto as T;
  if (!estibable) return { ...base, estibable: false } as T;
  const n = leerNivelesEstiba(niveles);
  return { ...base, estibable: true, ...(n ? { nivelesEstiba: n } : {}) } as T;
}

/** Quita la estiba por completo (vuelve a «sin indicar»). */
export function sinEstiba<T extends CampoEstiba>(fuente: T): T {
  const { estibable: _e, nivelesEstiba: _n, ...resto } = fuente;
  return resto as T;
}
