/**
 * estadoValidacion.ts
 *
 * Función compartida para determinar el estado de validación de una entidad
 * (cliente o proveedor). Extrae la lógica que antes vivía solo en
 * frenoExpediente.ts para que proveedores usen el mismo patrón sin
 * duplicar código.
 *
 * El estado se CALCULA a partir de los campos, no se guarda como string:
 *
 *   aprobado_formal   → expedienteValidado !== null
 *   heredado_magaya   → !expedienteValidado && (origenDatos === 'magaya' || !!numeroEntidadMagaya)
 *   en_revision       → !expedienteValidado && !esDeMagaya && origenDatos === 'manual'
 *
 * Para clientes, `en_revision` equivale a lo que frenoExpediente llama
 * `sin_validar`. Los nombres se conservan en frenoExpediente para no
 * romper los tests existentes; esta función usa los del PLAN-APROBACION.
 */

export interface ValidacionExpediente {
  por: string;
  /** ISO. */
  fecha: string;
  notas?: string;
}

/**
 * Interfaz mínima que cumplen tanto ClienteVermur como ProveedorVermur.
 * Se usa para parametrizar las funciones de validación.
 */
export interface EntidadValidable {
  origenDatos?: string;
  numeroEntidadMagaya?: string | null;
  expedienteValidado?: ValidacionExpediente | null;
}

export type EstadoValidacion = 'validado' | 'heredado_magaya' | 'sin_validar';

/** ¿Esta entidad vino de Magaya? Se lee, no se escribe. */
export function esEntidadDeMagaya(e: Pick<EntidadValidable, 'origenDatos' | 'numeroEntidadMagaya'>): boolean {
  return e.origenDatos === 'magaya' || !!e.numeroEntidadMagaya;
}

/**
 * Estado de validación de una entidad (cliente o proveedor).
 *
 * Devuelve los mismos tres valores que usaba frenoExpediente:
 *   'validado'        → expedienteValidado presente
 *   'heredado_magaya' → viene de Magaya (cuenta como válido de origen)
 *   'sin_validar'     → creado manualmente, sin validar
 */
export function estadoValidacion(e: EntidadValidable | null | undefined): EstadoValidacion {
  if (!e) return 'sin_validar';
  if (e.expedienteValidado) return 'validado';
  if (esEntidadDeMagaya(e)) return 'heredado_magaya';
  return 'sin_validar';
}

/**
 * Etiqueta legible del estado de validación, para badges y fichas.
 * Genérica: funciona para clientes y proveedores.
 */
export function etiquetaValidacion(e: EntidadValidable | null | undefined): string {
  switch (estadoValidacion(e)) {
    case 'validado': {
      const v = e!.expedienteValidado!;
      return `Validado por ${v.por} el ${v.fecha.slice(0, 10)}`;
    }
    case 'heredado_magaya': return 'Validado · heredado de Magaya';
    default: return 'Expediente sin validar';
  }
}
