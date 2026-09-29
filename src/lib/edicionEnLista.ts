/**
 * edicionEnLista.ts
 *
 * Editar el estado y el ejecutivo asignado desde la LISTA, sin abrir la ficha.
 *
 * ── Qué resuelve ───────────────────────────────────────────────────────────
 * Cambiar el responsable de veinte clientes obligaba a entrar y salir de
 * veinte fichas. Los dos campos que se tocan seguido son el estado y a quién
 * le toca, y ninguno necesita ver el resto del expediente para decidirse.
 *
 * ── Lo que NO hace ─────────────────────────────────────────────────────────
 * Edición masiva. Un cambio a la vez, cada uno con su confirmación y su
 * registro. Marcar cuarenta inactivos de un golpe es justo la operación que
 * nadie puede revisar antes de confirmar.
 *
 * ── El estado vive en dos campos distintos ─────────────────────────────────
 * El cliente usa `statusOperativo: 'ACTIVO' | 'INACTIVO'` (heredado de Magaya)
 * y el proveedor un `activo: boolean`. No se unifican aquí: renombrar campos
 * está fuera de lo preaprobado y tocaría 817 + 544 registros. `estaActivo` y
 * `conEstado` leen y escriben cada uno en su forma.
 *
 * Lógica pura: sin React ni Firestore.
 */

import type { UserRole } from '../auth/users';

/** Las áreas que pueden tener un ejecutivo asignado. */
export type AreaEjecutivo = 'ventas' | 'pricing' | 'operativo';

/** El campo donde vive cada una. Mismo nombre en cliente y en proveedor. */
export const CAMPO_EJECUTIVO: Record<AreaEjecutivo, string> = {
  ventas: 'responsableVentas',
  pricing: 'responsablePricing',
  operativo: 'responsableOperativo',
};

export const ETIQUETA_AREA: Record<AreaEjecutivo, string> = {
  ventas: 'Ventas',
  pricing: 'Pricing',
  operativo: 'Operaciones',
};

/**
 * El ROL cuyos usuarios se ofrecen para cada área.
 *
 * «operativo» mapea a `operaciones`: el área se llama distinto que el campo
 * porque el campo viene de Magaya. Se deja explícito en vez de derivarlo del
 * nombre, que es justo donde se cuela un error silencioso.
 */
export const ROL_DEL_AREA: Record<AreaEjecutivo, UserRole> = {
  ventas: 'ventas',
  pricing: 'pricing',
  operativo: 'operaciones',
};

// ─── Quién edita ──────────────────────────────────────────────────────────────

/**
 * Solo Administración y admin. Los demás ven las columnas en solo lectura.
 *
 * Es la misma regla de §4.1 —Administración es la única que da altas— llevada
 * a la lista: cambiar a quién le toca un cliente es una decisión de cartera.
 */
export function puedeEditarEnLista(rol: UserRole | undefined | null): boolean {
  return rol === 'admin' || rol === 'administracion';
}

// ─── Estado ───────────────────────────────────────────────────────────────────

export interface ConEstadoCliente { statusOperativo?: 'ACTIVO' | 'INACTIVO' }
export interface ConEstadoProveedor { activo?: boolean }

/**
 * ¿Está activo? Ausente cuenta como ACTIVO.
 *
 * Es deliberado: los registros anteriores a que existiera la marca son los
 * que el equipo usa todos los días, y esconderlos de los selectores por un
 * campo que nadie escribió sería una baja masiva silenciosa.
 */
export function estaActivo(e: ConEstadoCliente & ConEstadoProveedor): boolean {
  if (typeof e.activo === 'boolean') return e.activo;
  if (e.statusOperativo) return e.statusOperativo === 'ACTIVO';
  return true;
}

/** Escribe el estado en el campo que le toca a cada entidad. */
export function conEstado<T extends ConEstadoCliente & ConEstadoProveedor>(
  entidad: T, activo: boolean,
): T {
  if (typeof entidad.activo === 'boolean' || entidad.statusOperativo === undefined) {
    return { ...entidad, activo };
  }
  return { ...entidad, statusOperativo: activo ? 'ACTIVO' : 'INACTIVO' };
}

/**
 * Lo que se ofrece al crear algo NUEVO: solo los activos.
 *
 * Lo existente no cambia — un embarque en curso con un proveedor que se acaba
 * de dar de baja sigue siendo suyo—. La baja es hacia adelante, no
 * retroactiva.
 */
export function soloActivos<T extends ConEstadoCliente & ConEstadoProveedor>(
  lista: readonly T[],
): T[] {
  return lista.filter(estaActivo);
}

/**
 * Los que se ofrecen en un selector, conservando el que ya estaba elegido
 * aunque esté inactivo.
 *
 * Sin esto, abrir un registro viejo cuyo proveedor se dio de baja mostraría el
 * selector en blanco, y guardar cualquier otra cosa lo borraría sin que nadie
 * lo pidiera.
 */
export function paraSelector<T extends ConEstadoCliente & ConEstadoProveedor & { id: string }>(
  lista: readonly T[], yaElegidoId?: string | null,
): T[] {
  return lista.filter(e => estaActivo(e) || (!!yaElegidoId && e.id === yaElegidoId));
}

// ─── El registro de quién cambió qué ──────────────────────────────────────────

export interface CambioEnLista {
  campo: string;
  /** Valores legibles, no ids: el registro se lee sin resolver nada. */
  antes: string;
  despues: string;
  por: string;
  /** ISO. */
  fecha: string;
}

/**
 * Lo mínimo que la función necesita: el registro de cambios, y cualquier otro
 * campo. El índice abierto es a propósito — `aplicarCambio` recibe el nombre
 * del campo como cadena, así que el tipo no puede saber cuáles son.
 */
export interface ConCambios {
  cambios?: CambioEnLista[];
  [campo: string]: unknown;
}

const texto = (v: unknown): string =>
  v === null || v === undefined || v === '' ? '—' : String(v);

/**
 * Aplica un cambio y devuelve la entidad nueva CON su registro.
 *
 * Devuelve `null` cuando el valor no cambió: guardar un registro que dice
 * «Luis cambió X de A a A» ensucia el historial y hace que el de verdad se
 * pierda entre ruido.
 *
 * El registro se agrega al final; nunca se reescribe ni se borra uno anterior.
 */
export function aplicarCambio<T extends ConCambios>(
  entidad: T,
  campo: string,
  valorNuevo: unknown,
  autor: string,
  ahora: string,
  etiqueta?: { antes?: string; despues?: string },
): { entidad: T; cambio: CambioEnLista } | null {
  const actual = (entidad as Record<string, unknown>)[campo];
  if (texto(actual) === texto(valorNuevo)) return null;

  const cambio: CambioEnLista = {
    campo,
    antes: etiqueta?.antes ?? texto(actual),
    despues: etiqueta?.despues ?? texto(valorNuevo),
    por: autor,
    fecha: ahora,
  };

  return {
    entidad: {
      ...entidad,
      [campo]: valorNuevo,
      cambios: [...(entidad.cambios ?? []), cambio],
    },
    cambio,
  };
}

/** Una línea legible: «Responsable de Ventas: — → itzel.laurean@vermur.com». */
export function textoCambio(c: CambioEnLista, etiquetaCampo?: string): string {
  return `${etiquetaCampo ?? c.campo}: ${c.antes} → ${c.despues}`;
}
