// ============================================================
// ConceptosData.ts — Modelo de datos del catálogo de Conceptos
//
// Un concepto es un servicio/cargo que Vermur puede cobrar o pagar.
// Cada concepto tiene atributos que definen a qué combinaciones
// de tráfico (impo/expo) y ubicación (origen/destino) aplica,
// y de ahí se DERIVA el IVA con la función calcularIVA().
//
// Seed: 105 conceptos reales depurados de Magaya.
// ============================================================

import initialConceptosJson from '../../data/seeds/conceptos.json';

// ─── Tipos ──────────────────────────────────────────────────────────────────────

export type ReglaIVA =
  | 'espejo'               // IVA derivado de tráfico × ubicación
  | 'aereo_split'          // 25% al 16% + 75% al 0%
  | 'terrestre_retencion'  // 16% + retención 4%
  | 'exento'               // siempre 0% (seguros)
  | 'fijo16'               // siempre 16% (servicio nacional)
  | 'fijo0'                // siempre 0% (servicio internacional)
  | 'revisar';             // pendiente de confirmar con Administración

export type CategoriaConcepto =
  | 'flete'
  | 'maniobras'
  | 'despacho'
  | 'almacenaje'
  | 'seguro'
  | 'demoras'
  | 'documentacion'
  | 'financiero'
  | 'transporte'
  | 'otros';

export type MonedaDefault = 'USD' | 'MXN';

// ─── Entidad principal ──────────────────────────────────────────────────────────

export interface ConceptoVermur {
  /** ID del documento en Firestore, e.g. "CON-001". */
  id: string;

  /** Identificador semántico legible, e.g. "MANEUVERS". */
  idSemantico: string;

  /** Nombre normalizado para la UI. */
  nombre: string;

  /** Nombre tal como venía en Magaya (trazabilidad). */
  nombreOriginal: string;

  /** Agrupación del concepto. */
  categoria: CategoriaConcepto;

  /** Cuenta contable para Administración. */
  cuentaContable: string;

  // ── Dimensiones (definen a qué casos aplica) ─────────────────────────────
  aplicaImpo: boolean;
  aplicaExpo: boolean;
  aplicaOrigen: boolean;
  aplicaDestino: boolean;

  // ── Par venta/costo unificado ────────────────────────────────────────────
  tieneVenta: boolean;
  tieneCosto: boolean;

  // ── IVA ──────────────────────────────────────────────────────────────────
  reglaIVA: ReglaIVA;
  notaIVA: string;

  // ── Moneda ───────────────────────────────────────────────────────────────
  monedaDefault: MonedaDefault;

  // ── Claves SAT (críticas para timbrar CFDI) ──────────────────────────────
  claveProductoSAT: string | null;
  claveUnidadSAT: string | null;

  // ── Trazabilidad con Magaya ──────────────────────────────────────────────
  codigosMagaya: string[];
  ivaEnMagaya: string[];

  // ── Estado ───────────────────────────────────────────────────────────────
  activo: boolean;
  notas: string;

  // ── Auditoría ────────────────────────────────────────────────────────────
  fechaAlta: string;   // YYYY-MM-DD
  updatedAt: string;   // ISO timestamp
}

// ─── Seed ───────────────────────────────────────────────────────────────────────

export const initialConceptos: ConceptoVermur[] =
  initialConceptosJson as ConceptoVermur[];
