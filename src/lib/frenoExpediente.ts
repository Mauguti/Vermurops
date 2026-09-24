/**
 * frenoExpediente.ts
 *
 * El freno del expediente del cliente (Bloque 2b, 25-sep-2026), junto al
 * de «sin cliente vinculado» (frenoCliente.ts).
 *
 * ── La regla, en palabras de Mau ───────────────────────────────────────────
 *   - Sin cliente vinculado: freno duro, sin salto para nadie.
 *   - Los clientes importados de Magaya cuentan como validados de origen:
 *     `origenDatos === 'magaya' || numeroEntidadMagaya`. Se LEEN así, sin
 *     migración. En la ficha: «Validado · heredado de Magaya».
 *   - Los creados en VermurOps pasan por validación formal
 *     (`expedienteValidado`, que escribe Administración en la ficha).
 *   - Cliente vinculado con expediente sin validar: solo admin puede
 *     continuar, con justificación obligatoria (ni vacía ni solo espacios).
 *     El salto queda registrado para siempre en la cotización y en el
 *     embarque (`saltoExpediente`); nunca se borra. El aviso «expediente
 *     pendiente» se CALCULA: hay salto Y el cliente sigue sin validar.
 *
 * Lógica pura. Los tres puntos que escriben —marcar ganada, la ruta
 * automática y la ruta manual de «Abrir embarque»— llaman a
 * `exigirExpediente`; la máquina de estados y la franja llaman a
 * `razonExpediente` para explicar antes de intentar.
 */

import type { ClienteVermur } from '../components/clientes/ClientesData';
import type { UserRole } from '../auth/users';
import { razonSinCliente } from './frenoCliente';

export interface SaltoExpediente {
  por: string;
  /** ISO. */
  fecha: string;
  justificacion: string;
}

export interface ValidacionExpediente {
  por: string;
  /** ISO. */
  fecha: string;
  notas?: string;
}

export type EstadoValidacion = 'validado' | 'heredado_magaya' | 'sin_validar';

/** ¿Este cliente vino de Magaya? Se lee, no se escribe. */
export function esClienteDeMagaya(c: Pick<ClienteVermur, 'origenDatos' | 'numeroEntidadMagaya'>): boolean {
  return c.origenDatos === 'magaya' || !!c.numeroEntidadMagaya;
}

export function estadoValidacion(
  c: Pick<ClienteVermur, 'origenDatos' | 'numeroEntidadMagaya' | 'expedienteValidado'> | null | undefined,
): EstadoValidacion {
  if (!c) return 'sin_validar';
  if (c.expedienteValidado) return 'validado';
  if (esClienteDeMagaya(c)) return 'heredado_magaya';
  return 'sin_validar';
}

export function etiquetaValidacion(
  c: Pick<ClienteVermur, 'origenDatos' | 'numeroEntidadMagaya' | 'expedienteValidado'> | null | undefined,
): string {
  switch (estadoValidacion(c)) {
    case 'validado': {
      const v = c!.expedienteValidado!;
      return `Validado por ${v.por} el ${v.fecha.slice(0, 10)}`;
    }
    case 'heredado_magaya': return 'Validado · heredado de Magaya';
    default: return 'Expediente sin validar';
  }
}

export const RAZON_CLIENTE_NO_ENCONTRADO =
  'La cotización apunta a un cliente que no está en Altas. Vincula uno que exista antes de continuar.';
export const RAZON_EXPEDIENTE_SIN_VALIDAR =
  'El expediente de este cliente no está validado. Administración lo valida en Altas; solo admin puede continuar, con justificación.';
export const RAZON_JUSTIFICACION_OBLIGATORIA =
  'Para continuar con un expediente sin validar, escribe la justificación.';

export interface ContextoExpediente {
  /** null = no existe en Altas; undefined = no se buscó (no cuenta como válido). */
  cliente: ClienteVermur | null | undefined;
  rol: UserRole | undefined | null;
  /** La del salto que se está intentando ahora. */
  justificacion?: string;
  /** Un salto ya registrado en la cotización: la ruta manual lo hereda. */
  saltoPrevio?: SaltoExpediente | null;
  /** Quién salta, para el registro. */
  por?: string;
  /** ISO. Inyectable para pruebas. */
  ahora?: string;
}

export type ResultadoExpediente =
  | { ok: true; salto: SaltoExpediente | null }
  | { ok: false; razon: string };

/**
 * ¿Se puede ganar / abrir embarque con el expediente de este cliente?
 *
 *   sin cliente             → no, sin salto para nadie
 *   cliente inexistente     → no
 *   heredado de Magaya      → sí
 *   validado                → sí
 *   sin validar + salto previo registrado en la cotización → sí, hereda el salto
 *   sin validar + admin + justificación → sí, con salto nuevo
 *   sin validar + admin sin justificación → no
 *   sin validar + otro rol  → no
 */
export function frenoExpediente(
  quote: { clienteId?: string | null },
  ctx: ContextoExpediente,
): ResultadoExpediente {
  const sinCliente = razonSinCliente(quote);
  if (sinCliente) return { ok: false, razon: sinCliente };
  if (!ctx.cliente) return { ok: false, razon: RAZON_CLIENTE_NO_ENCONTRADO };

  if (estadoValidacion(ctx.cliente) !== 'sin_validar') return { ok: true, salto: null };
  if (ctx.saltoPrevio) return { ok: true, salto: ctx.saltoPrevio };
  if (ctx.rol !== 'admin') return { ok: false, razon: RAZON_EXPEDIENTE_SIN_VALIDAR };

  const justificacion = (ctx.justificacion ?? '').trim();
  if (!justificacion) return { ok: false, razon: RAZON_JUSTIFICACION_OBLIGATORIA };

  return {
    ok: true,
    salto: { por: ctx.por ?? 'admin', fecha: ctx.ahora ?? new Date().toISOString(), justificacion },
  };
}

/** Solo la razón, para la máquina de estados y la franja. */
export function razonExpediente(quote: { clienteId?: string | null }, ctx: ContextoExpediente): string | null {
  const r = frenoExpediente(quote, ctx);
  return 'razon' in r ? r.razon : null;
}

/** Para los puntos que escriben: detiene o devuelve el salto a registrar. */
export function exigirExpediente(quote: { clienteId?: string | null }, ctx: ContextoExpediente): SaltoExpediente | null {
  const r = frenoExpediente(quote, ctx);
  if ('razon' in r) throw new Error(r.razon);
  return r.salto;
}

export function esRazonExpediente(razon: string | null | undefined): boolean {
  return razon === RAZON_EXPEDIENTE_SIN_VALIDAR || razon === RAZON_JUSTIFICACION_OBLIGATORIA;
}

/**
 * «Expediente pendiente» en el embarque: se calcula, no se guarda. Hay un
 * salto registrado Y el cliente sigue sin validar. Al validar al cliente el
 * aviso desaparece solo; el registro del salto se queda.
 */
export function expedientePendiente(
  embarque: { saltoExpediente?: SaltoExpediente | null },
  cliente: ClienteVermur | null | undefined,
): boolean {
  return !!embarque.saltoExpediente && estadoValidacion(cliente) === 'sin_validar';
}

/** Texto para la nota de actividades y la bitácora del embarque. */
export function textoSalto(s: SaltoExpediente): string {
  return `Salto de expediente sin validar, autorizado por ${s.por}: ${s.justificacion}`;
}
