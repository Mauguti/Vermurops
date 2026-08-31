/**
 * TarifasData.ts — Modelo de datos del módulo de Tarifas (TA-1)
 *
 * Una tarifa es el precio de un CONCEPTO, con un PROVEEDOR, para una RUTA
 * (cuando aplica), vigente por un periodo.
 *
 * Tipos:
 *  - tarifario: pactado con el proveedor, vigencia amplia (semestre).
 *  - spot: precio especial para una operación puntual.
 *
 * Decisiones de diseño:
 *  - Vigencia doble: vigenciaTexto (legible/PDF) + fechaInicio/fechaFin (filtrable).
 *  - Precio objeto: monto + unidad, con campos opcionales por tamaño de contenedor.
 *  - Lookup en memoria: onSnapshot acotado (activo + vigente ± 60d), filtrado client-side.
 *  - Spot inverso: captura manual en cotización puede guardarse como tarifa spot.
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type TipoTarifa = 'tarifario' | 'spot';

export type UnidadTarifa =
  | 'CONTENEDOR'   // FCL, maniobras — monto = 20', montoPor40/montoPor40HC opcionales
  | 'CBM'          // LCL, aéreo por volumen
  | 'TON'          // Por peso
  | 'WM'           // Weight/Measure (el mayor de CBM o TON)
  | 'PEDIMENTO'    // Despacho aduanal
  | 'VIAJE'        // Flete terrestre por viaje
  | 'BL'           // Por Bill of Lading
  | 'FIJO'         // Monto fijo (sin unidad variable)
  | 'DIA';         // Almacenaje, demoras

// ─── Sub-objetos ─────────────────────────────────────────────────────────────

export interface PreciosTarifa {
  /** Precio principal (siempre presente). Para CONTENEDOR = precio del 20'. */
  monto: number;
  /** Qué representa el monto. */
  unidad: UnidadTarifa;
  /** Precio para contenedor 40' (solo cuando unidad = CONTENEDOR). */
  montoPor40?: number;
  /** Precio para contenedor 40' HC (solo si difiere del 40'). */
  montoPor40HC?: number;
  /** Cargo mínimo (LCL, aéreo). */
  montoMinimo?: number;
}

// ─── Entidad principal ───────────────────────────────────────────────────────

export interface TarifaVermur {
  /** ID del documento en Firestore: TAR-0001, etc. */
  id: string;

  // ── Clasificación ────────────────────────────────────────────────────────
  tipo: TipoTarifa;

  // ── Qué ──────────────────────────────────────────────────────────────────
  /** FK → ConceptoVermur.id */
  conceptoId: string;
  /** FK → ProveedorVermur.id */
  proveedorId: string;

  // ── Dónde (todo opcional — hay conceptos sin ruta) ───────────────────────
  /** FK → PuertoVermur.id (marítimo origen) */
  puertoOrigenId: string | null;
  /** FK → PuertoVermur.id (marítimo destino) */
  puertoDestinoId: string | null;
  /** ID de terminal dentro del puerto (para maniobras por terminal). */
  terminalId: string | null;
  /** Texto libre para rutas no portuarias (terrestre, aéreo). */
  rutaTexto: string | null;

  // ── Cuánto ───────────────────────────────────────────────────────────────
  precios: PreciosTarifa;
  moneda: 'USD' | 'MXN';

  // ── Vigencia ─────────────────────────────────────────────────────────────
  /** Texto legible: "Semestre 2026-B", "Solo salida 15 mar", etc. Sale en el PDF. */
  vigenciaTexto: string;
  /** Inicio de vigencia (YYYY-MM-DD). */
  fechaInicio: string;
  /** Fin de vigencia (YYYY-MM-DD). null = indefinida / hasta nuevo aviso. */
  fechaFin: string | null;

  // ── Operativo ────────────────────────────────────────────────────────────
  /** Tiempo de tránsito en días naturales. null si no aplica. */
  tiempoTransitoDias: number | null;
  /** Días libres de demora (solo FCL marítimo). null si no aplica. */
  freeTimeDias: number | null;
  /** Notas, condiciones especiales. */
  condiciones: string;

  // ── Estado ───────────────────────────────────────────────────────────────
  activo: boolean;
  /**
   * Cómo se creó el registro.
   *  - 'manual':     capturada a mano en el catálogo
   *  - 'cotizacion': tarifa spot nacida dentro de una cotización
   *  - 'ocr':        extraída de un tarifario con IA y confirmada por Pricing
   */
  origenDatos: 'manual' | 'cotizacion' | 'ocr';

  /**
   * Documento del que salió esta tarifa (Storage).
   *
   * Responde a la trazabilidad que pidió el cliente: «tiene que haber una
   * trazabilidad de ¿de dónde saqué este costo?». Convierte «esta tarifa dice
   * 1,200 USD» en «aquí está el PDF del proveedor donde lo dice».
   */
  documentoOrigen?: {
    /** Ruta en Firebase Storage. */
    path: string;
    nombreArchivo: string;
    /** Id de la importación que la generó (importacionesTarifas/{id}). */
    importacionId: string;
  };

  // ── Auditoría ────────────────────────────────────────────────────────────
  /** UID del usuario que creó la tarifa. */
  creadoPor: string;
  fechaAlta: string;    // YYYY-MM-DD
  updatedAt: string;    // ISO timestamp
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Formato ISO de hoy: YYYY-MM-DD. */
export function hoyISO(): string {
  return new Date().toISOString().split('T')[0];
}

/** Resta N días a una fecha ISO y devuelve YYYY-MM-DD. */
export function restarDias(fechaISO: string, dias: number): string {
  const d = new Date(fechaISO + 'T00:00:00');
  d.setDate(d.getDate() - dias);
  return d.toISOString().split('T')[0];
}

/** ¿La tarifa está vigente en la fecha dada (default: hoy)? */
export function esTarifaVigente(t: TarifaVermur, fecha?: string): boolean {
  const ref = fecha ?? hoyISO();
  if (!t.activo) return false;
  if (t.fechaInicio > ref) return false;           // Aún no inicia
  if (t.fechaFin === null) return true;             // Indefinida
  return t.fechaFin >= ref;                         // Dentro del rango
}

/**
 * Estado visual de vigencia para badges en el catálogo.
 *  - 'vigente':    fechaFin > hoy + 30d  o  indefinida
 *  - 'por_vencer': fechaFin ≤ hoy + 30d  y  fechaFin ≥ hoy
 *  - 'vencida':    fechaFin < hoy
 *  - 'indefinida': fechaFin === null
 */
export type EstadoVigencia = 'vigente' | 'por_vencer' | 'vencida' | 'indefinida';

export function estadoVigencia(t: TarifaVermur): EstadoVigencia {
  if (t.fechaFin === null) return 'indefinida';
  const hoy = hoyISO();
  if (t.fechaFin < hoy) return 'vencida';
  // Calcular hoy + 30 días
  const d = new Date(hoy + 'T00:00:00');
  d.setDate(d.getDate() + 30);
  const umbral = d.toISOString().split('T')[0];
  if (t.fechaFin <= umbral) return 'por_vencer';
  return 'vigente';
}

// ─── Filtros para buscarTarifasVigentes ──────────────────────────────────────

export interface FiltroTarifas {
  conceptoId?: string;
  proveedorId?: string;
  puertoOrigenId?: string;
  puertoDestinoId?: string;
  tipo?: TipoTarifa;
  /** Fecha de referencia para vigencia (default: hoy). */
  fecha?: string;
}

/**
 * Filtra y ordena un array de tarifas según los criterios dados.
 * Devuelve solo tarifas vigentes (activo + dentro de rango de fechas),
 * ordenadas por monto ascendente.
 *
 * Para MANIOBRAS en puerto con múltiples terminales: la regla del
 * "costo más caro por terminal" se aplica en la capa de UI (TA-4),
 * no aquí. Esta función devuelve TODAS las tarifas que matchean
 * para que la UI pueda agrupar por terminal y aplicar la regla.
 */
export function buscarTarifasVigentes(
  tarifas: TarifaVermur[],
  filtros: FiltroTarifas,
): TarifaVermur[] {
  const ref = filtros.fecha ?? hoyISO();

  return tarifas
    .filter(t => {
      // Vigencia
      if (!esTarifaVigente(t, ref)) return false;
      // Concepto
      if (filtros.conceptoId && t.conceptoId !== filtros.conceptoId) return false;
      // Proveedor
      if (filtros.proveedorId && t.proveedorId !== filtros.proveedorId) return false;
      // Ruta (puerto origen)
      if (filtros.puertoOrigenId && t.puertoOrigenId !== filtros.puertoOrigenId) return false;
      // Ruta (puerto destino)
      if (filtros.puertoDestinoId && t.puertoDestinoId !== filtros.puertoDestinoId) return false;
      // Tipo
      if (filtros.tipo && t.tipo !== filtros.tipo) return false;
      return true;
    })
    .sort((a, b) => a.precios.monto - b.precios.monto);
}
