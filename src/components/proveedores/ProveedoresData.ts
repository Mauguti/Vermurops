// ============================================================
// ProveedoresData.ts — Modelo de datos del módulo de Proveedores
//
// Paso 1.4: Modelo actualizado para 544 proveedores reales de Magaya.
//
// Campos legacy (rfc, domicilio, modalidades, notas) se mantienen
// como opcionales para backward compat con registros creados por
// el formulario interno antes de la migración.
// ============================================================

import seedData from '../../data/seeds/proveedores.json';

// ─── Sub-objetos ──────────────────────────────────────────────────────────────

export type TipoProveedor = 'proveedor' | 'transportista' | 'agente_carga';

/**
 * Días de crédito que el proveedor otorga a Vermur, por tipo de operación.
 *
 * NOTA: Esto es distinto de ClienteVermur.dias (los días que el CLIENTE
 * tarda en pagar a Vermur, y que alimentan el cálculo de financiamiento
 * del profit real). Los diasCredito del proveedor son para visibilidad
 * de cash flow: cuánto tiempo tiene Vermur para pagarle al proveedor.
 *
 * En E14 el ClienteVermur también se desglosará con esta misma forma
 * {maritimo, terrestre, aereo}.
 */
export interface DiasCredito {
  maritimo: number;
  terrestre: number;
  aereo: number;
  /** Crédito general cuando no aplica desglose por modalidad. */
  general: number;
}

/** Contacto dentro de la organización del proveedor. */
export interface ContactoProveedor {
  id: string;
  nombre: string;
  email: string;
  /** Tipo de contacto según Magaya: "general", "ventas", etc. */
  tipo?: string;
  /** Marca cuál es el contacto default / principal. */
  principal: boolean;
  // Legacy — presentes en registros creados por el formulario interno.
  puesto?: string;
  telefono?: string;
}

/** Dirección del proveedor (Magaya). */
export interface DireccionProveedor {
  calle: string | null;
  ciudad: string | null;
  estado: string | null;
  pais: string | null;
  codigoPostal: string | null;
}

// ─── Tipos compartidos (legacy — usado en filtros de formulario) ──────────────

export type Modalidad = 'maritimo' | 'aereo' | 'terrestre' | 'aduanal';

// ─── Cuenta bancaria del proveedor ────────────────────────────────────────────

/** Cuenta bancaria tipada del proveedor (reemplaza unknown[] legacy). */
export interface CuentaBancariaProveedor {
  id: string;                       // UUID
  banco: string;                    // "BBVA", "Banamex", etc.
  clabe: string;                    // 18 dígitos CLABE
  numeroCuenta: string;
  moneda: 'MXN' | 'USD';
  /** SWIFT/BIC para transferencias internacionales. */
  swift: string | null;
  /** FK → conceptos/ — para sugerir cuenta por concepto al autorizar OC. */
  conceptoAsociadoId: string | null;
  activo: boolean;
}

// ─── Entidad principal ────────────────────────────────────────────────────────

export interface ProveedorVermur {
  /** ID del documento en Firestore. */
  id: string;

  // ── Identificación (Magaya) ──────────────────────────────────────────────
  /** Clave semántica derivada del nombre: "PRV-HAPAG_LLOYD", etc. */
  idSemantico: string;
  nombre: string;

  // ── Clasificación ────────────────────────────────────────────────────────
  /** Roles del proveedor: proveedor, transportista, agente_carga. */
  tipos: TipoProveedor[];
  esAgenteDeCarga: boolean;
  /** true cuando este proveedor también figura como cliente en Magaya. */
  esTambienCliente: boolean;

  // ── Contactos (0..n) ─────────────────────────────────────────────────────
  contactos: ContactoProveedor[];

  // ── Crédito por tipo de operación ────────────────────────────────────────
  diasCredito: DiasCredito;
  /** Término de pago literal de Magaya: "Net 30", "Due on receipt", etc. */
  terminoPagoMagaya: string | null;

  // ── Datos fiscales / Magaya ──────────────────────────────────────────────
  telefono: string | null;
  website: string | null;
  direccion: DireccionProveedor;
  /** Código IATA (aerolíneas). */
  codigoIATA: string | null;
  referenciaMagaya: string | null;
  /** Tax ID / RFC / EIN del proveedor en Magaya. */
  numeroEntidadMagaya: string | null;

  // ── Bancario ─────────────────────────────────────────────────────────────
  cuentasBancarias: CuentaBancariaProveedor[];

  // ── Flags de calidad de datos ────────────────────────────────────────────
  validadoFiscalmente: boolean;
  tuvoTransacciones: boolean;
  multiRegistroEnMagaya: boolean;

  // ── Estado ───────────────────────────────────────────────────────────────
  activo: boolean;
  origenDatos: string;

  // ── Auditoría ────────────────────────────────────────────────────────────
  fechaAlta: string;    // YYYY-MM-DD
  updatedAt: string;    // ISO timestamp

  // ── Legacy (opcionales — registros creados antes de la migración) ────────
  rfc?: string;
  domicilio?: string;
  modalidades?: Modalidad[];
  notas?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Devuelve el contacto marcado como principal, o el primero del array. */
export function contactoPrincipal(p: ProveedorVermur): ContactoProveedor | undefined {
  // Bloque 4: un proveedor sin arreglo de contactos (edición a mano) tiraba Altas.
  const contactos = p.contactos ?? [];
  return contactos.find(c => c.principal) ?? contactos[0];
}

// ─── Seed ─────────────────────────────────────────────────────────────────────
// 544 proveedores reales importados de Magaya.

export const initialProveedores: ProveedorVermur[] = seedData as ProveedorVermur[];
