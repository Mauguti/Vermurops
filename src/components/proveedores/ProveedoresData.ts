// ============================================================
// ProveedoresData.ts — Modelo de datos del módulo de Proveedores
//
// E9.0: Modelo enriquecido con contactos múltiples y días de
// crédito por tipo de operación.
//
// Seed: migración de los 5 proveedores de data.ts al modelo nuevo.
// ============================================================

// ─── Sub-objetos ──────────────────────────────────────────────────────────────

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
}

/** Contacto dentro de la organización del proveedor. */
export interface ContactoProveedor {
  id: string;
  nombre: string;
  puesto: string;
  email: string;
  telefono: string;
  /** Marca cuál es el contacto default / principal. */
  principal: boolean;
}

// ─── Tipos compartidos ────────────────────────────────────────────────────────

export type Modalidad = 'maritimo' | 'aereo' | 'terrestre' | 'aduanal';

// ─── Entidad principal ────────────────────────────────────────────────────────

export interface ProveedorVermur {
  /** ID del documento en Firestore. */
  id: string;

  // ── Identificación ─────────────────────────────────────────────────────────
  nombre: string;       // Razón social
  rfc: string;
  domicilio: string;
  website: string;

  // ── Contactos (1..n) ───────────────────────────────────────────────────────
  contactos: ContactoProveedor[];

  // ── Servicios que ofrece ───────────────────────────────────────────────────
  modalidades: Modalidad[];

  // ── Crédito por tipo de operación ──────────────────────────────────────────
  diasCredito: DiasCredito;

  // ── Estado ─────────────────────────────────────────────────────────────────
  activo: boolean;
  notas: string;

  // ── Auditoría ──────────────────────────────────────────────────────────────
  fechaAlta: string;    // YYYY-MM-DD
  updatedAt: string;    // ISO timestamp
}

// ─── Seed de desarrollo ────────────────────────────────────────────────────────
// Migración de los 5 proveedores de data.ts (initialProviders) al modelo
// enriquecido. El contacto único se convierte en array de 1 con principal=true.
// diasCredito usa defaults razonables del levantamiento.

const SEED_FECHA = '2026-01-15';
const SEED_TS = '2026-01-15T00:00:00.000Z';

/** Defaults del levantamiento: marítimo 45, terrestre 15, aéreo 20. */
const DIAS_CREDITO_DEFAULT: DiasCredito = {
  maritimo: 45,
  terrestre: 15,
  aereo: 20,
};

export const initialProveedores: ProveedorVermur[] = [
  {
    id: 'PRV-001',
    nombre: 'Hapag-Lloyd',
    rfc: 'HLL980101QW1',
    domicilio: 'Av. Paseo de la Reforma 250, CDMX',
    website: 'www.hapag-lloyd.com',
    contactos: [
      { id: 'cnt-001-1', nombre: 'Roberto Díaz', puesto: 'Key Account Manager', email: 'roberto.diaz@hl.com', telefono: '55 4321 8765', principal: true },
    ],
    modalidades: ['maritimo'],
    diasCredito: { ...DIAS_CREDITO_DEFAULT },
    activo: true,
    notas: 'Buenas tarifas para rutas a Asia. Tiempos de respuesta lentos los viernes.',
    fechaAlta: SEED_FECHA,
    updatedAt: SEED_TS,
  },
  {
    id: 'PRV-002',
    nombre: 'Lufthansa Cargo',
    rfc: 'LCA880222XZ2',
    domicilio: 'Terminal de Carga AICM, CDMX',
    website: 'lufthansa-cargo.com',
    contactos: [
      { id: 'cnt-002-1', nombre: 'Sandra Meyer', puesto: 'Sales Rep', email: 'smeyer@lufthansa.com', telefono: '55 1122 3344', principal: true },
    ],
    modalidades: ['aereo'],
    diasCredito: { ...DIAS_CREDITO_DEFAULT },
    activo: true,
    notas: 'Excelente para consolidados a Europa.',
    fechaAlta: SEED_FECHA,
    updatedAt: SEED_TS,
  },
  {
    id: 'PRV-003',
    nombre: 'Swift Logistics SA de CV',
    rfc: 'SWL050505AA1',
    domicilio: 'Carretera a Laredo Km 15, Monterrey',
    website: 'www.swiftlog.mx',
    contactos: [
      { id: 'cnt-003-1', nombre: 'Carlos Mendoza', puesto: 'Despachador', email: 'cmendoza@swiftlog.mx', telefono: '81 5555 9999', principal: true },
    ],
    modalidades: ['terrestre'],
    diasCredito: { ...DIAS_CREDITO_DEFAULT },
    activo: true,
    notas: 'Rutas NAFTA exclusivamente.',
    fechaAlta: SEED_FECHA,
    updatedAt: SEED_TS,
  },
  {
    id: 'PRV-004',
    nombre: 'Agencia Aduanal Torres',
    rfc: 'AAT901010BB2',
    domicilio: 'Av. Oceanía 100, Manzanillo',
    website: 'www.aatorres.com.mx',
    contactos: [
      { id: 'cnt-004-1', nombre: 'Lucía Torres', puesto: 'Agente Aduanal', email: 'lucia@aatorres.com.mx', telefono: '314 222 1111', principal: true },
    ],
    modalidades: ['aduanal'],
    diasCredito: { ...DIAS_CREDITO_DEFAULT },
    activo: true,
    notas: 'Especialistas en despacho de químicos y materiales peligrosos.',
    fechaAlta: SEED_FECHA,
    updatedAt: SEED_TS,
  },
  {
    id: 'PRV-005',
    nombre: 'Grupo Logístico Universal',
    rfc: 'GLU120304CC3',
    domicilio: 'Boulevard Puerto Aéreo 500, CDMX',
    website: 'www.gluniversal.mx',
    contactos: [
      { id: 'cnt-005-1', nombre: 'Javier Santos', puesto: 'Ejecutivo Comercial', email: 'jsantos@gluniversal.mx', telefono: '55 9876 5432', principal: true },
    ],
    modalidades: ['aereo', 'maritimo', 'terrestre'],
    diasCredito: { ...DIAS_CREDITO_DEFAULT },
    activo: false,
    notas: 'Actualmente en revisión de crédito, no usar.',
    fechaAlta: SEED_FECHA,
    updatedAt: SEED_TS,
  },
];
