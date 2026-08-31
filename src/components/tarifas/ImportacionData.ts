/**
 * ImportacionData.ts
 *
 * Modelo del borrador de importación de tarifarios (TA-2).
 *
 * ── Por qué se persiste en Firestore y no en el navegador ──────────────────
 * Tres razones:
 *
 *  1. La extracción ya costó una ejecución de n8n y una llamada de IA.
 *  2. Revisar cuarenta líneas es trabajo real que puede tomar más de una
 *     sentada, y a veces hay que consultarle algo al proveedor.
 *  3. Guardar la respuesta CRUDA junto a lo que finalmente se guardó deja la
 *     evidencia que va a hacer falta el día que la IA se equivoque. Sin eso,
 *     una tarifa mal cargada es indistinguible de una mal capturada a mano.
 *
 * localStorage se descartó: se pierde al cambiar de máquina y no deja rastro.
 */

import { LineaEnRevision, RespuestaN8N, NivelConfianza } from '../../lib/importacionTarifas';

export type EstadoImportacion =
  /** El archivo se subió y el agente está trabajando. */
  | 'extrayendo'
  /** Hay líneas propuestas esperando que Pricing las revise. */
  | 'en_revision'
  /** Confirmada: las tarifas ya están en el catálogo. */
  | 'guardada'
  /** Se abandonó a propósito. No se borra: queda el rastro. */
  | 'descartada'
  /** El agente falló o la respuesta no pasó la validación. */
  | 'error';

export interface ArchivoImportado {
  nombreArchivo: string;
  /** Ruta en Firebase Storage. Es la evidencia de dónde salió el costo. */
  path: string;
  /** SHA-256 del contenido, para detectar que el mismo archivo ya se procesó. */
  hash: string;
  tamanoBytes: number;
  tipoMime: string;
}

export interface ImportacionTarifario {
  id: string;
  estado: EstadoImportacion;

  archivo: ArchivoImportado;

  // ── Lo que propuso el agente ────────────────────────────────────────────
  /**
   * Respuesta cruda de n8n, tal como llegó.
   *
   * Se guarda aunque ya esté normalizada en `lineas` porque son cosas
   * distintas: esto es lo que la IA dijo, `lineas` es lo que quedó después de
   * que un humano lo revisó. Comparar ambas es la única forma de saber si el
   * agente está mejorando o empeorando.
   */
  respuestaCruda: RespuestaN8N | null;
  /** Reparos del validador de frontera. */
  reparos: string[];
  confianza: NivelConfianza;
  observaciones: string;

  // ── Cabecera del tarifario ──────────────────────────────────────────────
  proveedorId: string | null;
  proveedorNombre: string;
  vigenciaTexto: string;
  fechaInicio: string;
  fechaFin: string | null;

  // ── La revisión ─────────────────────────────────────────────────────────
  lineas: LineaEnRevision[];

  // ── Resultado ───────────────────────────────────────────────────────────
  /** Ids de las tarifas creadas al confirmar. Vacío mientras no se guarde. */
  tarifasCreadasIds: string[];
  /** Mensaje de error cuando estado === 'error'. */
  mensajeError: string | null;

  /**
   * Desde dónde se subió. Una tarifa importada entra al catálogo GENERAL —
   * sirve para todas las cotizaciones— pero se registra su procedencia.
   */
  origenCotizacionId: string | null;

  // ── Auditoría ───────────────────────────────────────────────────────────
  creadoPor: string;
  creadoPorEmail: string;
  createdAt: string;
  updatedAt: string;
}

/** Etiquetas para la UI. */
export const ESTADO_LABEL: Record<EstadoImportacion, string> = {
  extrayendo:  'Procesando',
  en_revision: 'Por revisar',
  guardada:    'Guardada',
  descartada:  'Descartada',
  error:       'Con error',
};

/** ¿El borrador sigue vivo, o ya terminó su ciclo? */
export function estaAbierta(imp: ImportacionTarifario): boolean {
  return imp.estado === 'extrayendo' || imp.estado === 'en_revision';
}
