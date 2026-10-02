/**
 * documentosOperativos.ts — tipos y helpers para la generación de documentos
 * operativos del embarque (tarea 40).
 *
 * Los documentos se generan en una Cloud Function (generarDocumento), se
 * guardan en Storage, y se registran en el embarque con arrayUnion. Este
 * archivo define los tipos compartidos y la llamada desde la app.
 */

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Los seis documentos del PLAN-C, más un tipo de prueba. */
export type TipoDocEmbarque =
  | 'booking'
  | 'notificacion_arribo'
  | 'carta_encomienda'
  | 'carta_porte'
  | 'formato_318'
  | 'hbl'
  | 'prueba';

/** Etiquetas legibles por tipo de documento. */
export const ETIQUETAS_DOC: Record<TipoDocEmbarque, string> = {
  booking: 'Booking Confirmation',
  notificacion_arribo: 'Notificación de arribo',
  carta_encomienda: 'Carta de encomienda',
  carta_porte: 'Carta de porte',
  formato_318: 'Formato 318 / NOM',
  hbl: 'House Bill of Lading',
  prueba: 'Documento de prueba',
};

/**
 * Un documento generado que se guarda en el embarque (§5 del PLAN-C).
 *
 * Inmutable: corregir = generar la versión siguiente. Se agrega con
 * `arrayUnion` para que dos generaciones simultáneas no se pisen.
 */
export interface DocumentoGenerado {
  tipo: TipoDocEmbarque;
  version: number;
  storagePath: string;
  url: string;
  generadoPor: string;
  generadoPorNombre: string;
  fechaGeneracion: string;
  /** Para la carta de encomienda: {aduana, patente}. */
  parametros?: Record<string, unknown>;
}

// ── Configuración de la empresa ──────────────────────────────────────────────

/**
 * Documento `configuracion/empresa` en Firestore.
 *
 * Los datos de Vermur que van en TODOS los documentos generados. Se editan
 * en Configuración → Mi empresa.
 */
export interface ConfiguracionEmpresa {
  razonSocial: string;
  rfc: string;
  direccion: string;
  telefono: string;
  email: string;
  logoUrl: string;
  apoderadoLegal: string;
  firmaUrl?: string | null;
  updatedAt?: string;
  updatedBy?: string;
}

/** Valores por defecto de la empresa de Vermur (datos reales de las plantillas). */
export const EMPRESA_DEFAULT: ConfiguracionEmpresa = {
  razonSocial: 'Importaciones y Logística Vermur, S. de R.L. de C.V.',
  rfc: 'ILV190723FN1',
  direccion: 'Paseo de la República Km 13020 Int. 609, Juriquilla, Querétaro, C.P. 76230',
  telefono: '', // Vermur tiene dos números en sus plantillas; está por confirmar cuál (pregunta G11)
  email: '',
  logoUrl: '',
  apoderadoLegal: 'Gabriela Huerta Rodríguez',
};
