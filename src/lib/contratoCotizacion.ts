/**
 * contratoCotizacion.ts (tarea 102, 9-oct-2026)
 *
 * Reglas puras del contrato de una cotización ganada. Vermur no ha dado su
 * contrato: aquí NO hay texto legal, solo el archivo que sube la gente, su
 * marca de «firmado» y el aviso cuando falta. No bloquea nada.
 */
import type { KanbanQuote } from '../components/quotes/QuotesData';

export const TIPOS_CONTRATO = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'] as const;
export const EXTENSIONES_CONTRATO = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif'] as const;
export const MAX_BYTES_CONTRATO = 20 * 1024 * 1024;
export const LEYENDA_SIN_PLANTILLA = 'Falta la plantilla de Vermur';

function extension(nombre: string): string {
  const i = nombre.lastIndexOf('.');
  return i < 0 ? '' : nombre.slice(i + 1).toLowerCase();
}

/** null si el archivo sirve; si no, el motivo en palabras de quien sube. */
export function problemaArchivoContrato(archivo: { name: string; size: number; type?: string }): string | null {
  if (archivo.size <= 0) return 'El archivo está vacío.';
  if (archivo.size > MAX_BYTES_CONTRATO) return 'El archivo pesa más de 20 MB.';
  const ext = extension(archivo.name);
  const tipoOk = !!archivo.type && (TIPOS_CONTRATO as readonly string[]).includes(archivo.type.toLowerCase());
  const extOk = (EXTENSIONES_CONTRATO as readonly string[]).includes(ext);
  // Algunos navegadores no informan el tipo de un HEIC: se acepta por extensión.
  if (!tipoOk && !extOk) return 'Solo se aceptan PDF, JPG, PNG o HEIC.';
  return null;
}

function limpiarNombre(nombre: string): string {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
}

/** Cada subida tiene su ruta: la regla prohíbe pisar, así que nunca se repite. */
export function rutaStorageContrato(cotizacionId: string, nombreArchivo: string, ahora: string): string {
  const stamp = ahora.replace(/[-:.TZ]/g, '').slice(0, 14);
  return `cotizaciones/${cotizacionId}/contrato/${stamp}-${limpiarNombre(nombreArchivo)}`;
}

type ConContrato = Pick<KanbanQuote, 'etapa' | 'contrato'>;

/** Ganada y sin contrato marcado como firmado (ausente = sin contrato). */
export function sinContratoFirmado(q: ConContrato): boolean {
  return q.etapa === 'ganada' && !(q.contrato && q.contrato.firmado === true);
}

/** Estado en palabras para la ficha. null si la cotización no está ganada. */
export function estadoContrato(q: ConContrato): 'sin_contrato' | 'sin_firmar' | 'firmado' | null {
  if (q.etapa !== 'ganada') return null;
  if (!q.contrato) return 'sin_contrato';
  return q.contrato.firmado ? 'firmado' : 'sin_firmar';
}

/** Texto del aviso ámbar, o null si no hay nada que avisar. */
export function avisoContrato(q: ConContrato): string | null {
  switch (estadoContrato(q)) {
    case 'sin_contrato': return 'Sin contrato firmado';
    case 'sin_firmar': return 'Sin contrato firmado: el archivo está subido pero no se marcó como firmado';
    default: return null;
  }
}

/**
 * Entrada de Historial / Notas cuando un contrato reemplaza a otro. El
 * archivo anterior sigue en Storage (la regla no deja borrar) y aquí queda
 * dicho cuál era.
 */
export function textoReemplazoContrato(anterior: NonNullable<KanbanQuote['contrato']>, nuevoNombre: string): string {
  return `Contrato reemplazado: «${anterior.nombreArchivo}» (subido por ${anterior.subidoPor}, ${anterior.subidoEn.slice(0, 10)}`
    + `${anterior.firmado ? ', firmado' : ', sin firmar'}) por «${nuevoNombre}». `
    + `El archivo anterior se conserva en ${anterior.storagePath}.`;
}
