/**
 * documentoTarifario.ts
 *
 * El documento del que se extrajo una tarifa ES la evidencia (Bloque 3).
 *
 * Gabi: «tiene que haber una trazabilidad de ¿de dónde saqué este costo? Ah,
 * ok, Juan Pérez me lo mandó ayer. Y luego Abril Hernández me lo mandó hasta
 * hoy.»
 *
 * Una sola subida, dos usos:
 *   se guarda en Storage → es la EVIDENCIA
 *   se manda al agente   → extrae las TARIFAS
 *
 * NO son dos sistemas de adjuntos. Cada tarifa apunta al documento del que
 * salió, y ese documento aparece como evidencia en la cotización.
 *
 * Lógica pura: sin React, sin Storage, sin red.
 */

export type TipoDocumento = 'excel' | 'pdf' | 'imagen' | 'correo' | 'otro';

export interface DocumentoTarifario {
  id: string;
  nombreArchivo: string;
  /** Ruta en Firebase Storage. */
  path: string;
  /** URL de descarga. Se resuelve al subir. */
  url: string;
  tipo: TipoDocumento;
  tipoMime: string;
  tamanoBytes: number;
  /** SHA-256, para saber si el mismo archivo ya se procesó. */
  hash: string;

  /** Quién y cuándo. Es la mitad de la trazabilidad que pidió el cliente. */
  subidoPor: string;
  subidoPorNombre: string;
  fechaSubida: string;

  /** Cotización desde la que se subió, si fue desde ahí. */
  cotizacionId?: string | null;
  /** Importación que generó, si pasó por el extractor. */
  importacionId?: string | null;
  /** Cuántas tarifas salieron de este documento. */
  tarifasExtraidas: number;
  /**
   * false = se subió solo como respaldo, sin pasar por el extractor.
   * No todo documento es un tarifario: a veces es solo la evidencia.
   */
  procesadoConIA: boolean;
}

// ─── Límites y tipos aceptados ────────────────────────────────────────────────

export const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024; // 10 MB

export const MIMES_ACEPTADOS: Record<string, TipoDocumento> = {
  'application/pdf': 'pdf',
  'application/vnd.ms-excel': 'excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'text/csv': 'excel',
  'image/jpeg': 'imagen',
  'image/png': 'imagen',
  'image/webp': 'imagen',
  'image/heic': 'imagen',
  'message/rfc822': 'correo',
  'text/plain': 'correo',
};

export function tipoDeArchivo(mime: string, nombre: string): TipoDocumento {
  const directo = MIMES_ACEPTADOS[mime];
  if (directo) return directo;

  // Windows a veces manda mimes vacíos o genéricos; la extensión salva el caso.
  const ext = nombre.toLowerCase().split('.').pop() ?? '';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'excel';
  if (ext === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext)) return 'imagen';
  if (['eml', 'msg', 'txt'].includes(ext)) return 'correo';
  return 'otro';
}

export interface ValidacionArchivo {
  valido: boolean;
  motivo?: string;
  tipo: TipoDocumento;
}

/**
 * Valida antes de subir.
 *
 * Rechazar aquí ahorra una subida y una ejecución del agente, que cuesta
 * dinero. Y el mensaje dice qué hacer, no solo que algo falló.
 */
export function validarArchivo(nombre: string, mime: string, tamano: number): ValidacionArchivo {
  const tipo = tipoDeArchivo(mime, nombre);

  if (tamano === 0) {
    return { valido: false, motivo: 'El archivo está vacío.', tipo };
  }
  if (tamano > TAMANO_MAXIMO_BYTES) {
    const mb = (tamano / 1024 / 1024).toFixed(1);
    return {
      valido: false,
      tipo,
      motivo: `El archivo pesa ${mb} MB y el máximo son 10 MB. Si es un PDF escaneado, prueba con menos páginas.`,
    };
  }
  if (tipo === 'otro') {
    return {
      valido: false,
      tipo,
      motivo: 'Formato no reconocido. Se aceptan Excel, CSV, PDF, imágenes y correos.',
    };
  }
  return { valido: true, tipo };
}

/** Ruta en Storage. Se agrupa por año y mes para que la carpeta no crezca sin fin. */
export function rutaStorage(id: string, nombreArchivo: string, fecha = new Date()): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const limpio = nombreArchivo.replace(/[^\w.\-]/g, '_');
  return `tarifarios/${anio}/${mes}/${id}-${limpio}`;
}

/** Tamaño legible. */
export function formatoTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** ¿Se puede previsualizar dentro de la ficha, sin descargar? */
export function admitePrevisualizacion(tipo: TipoDocumento): boolean {
  return tipo === 'imagen' || tipo === 'pdf';
}

/**
 * Resume qué se puede decir del documento.
 * «14 tarifas extraídas» o «Solo respaldo».
 */
export function resumenDocumento(d: DocumentoTarifario): string {
  if (!d.procesadoConIA) return 'Solo respaldo';
  if (d.tarifasExtraidas === 0) return 'Sin tarifas extraídas';
  return `${d.tarifasExtraidas} tarifa${d.tarifasExtraidas !== 1 ? 's' : ''} extraída${d.tarifasExtraidas !== 1 ? 's' : ''}`;
}
