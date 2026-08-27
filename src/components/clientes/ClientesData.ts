// ============================================================
// ClientesData.ts — Modelo de datos del módulo de Clientes
//
// Adoptado del modelo kyc_vermur de Luis (repo kyc_vermur):
//   seed_clientes.json + contratos_store.py
//
// Incluye los 3 sub-objetos: docsAlta / contrato / pagare.
// Soporta clientes legacy (internos) y clientes importados de Magaya.
//
// Validadores RFC/CLABE = E7 (no aquí).
// ============================================================

import type { DiasCredito } from '../proveedores/ProveedoresData';

// ─── Sub-objetos ──────────────────────────────────────────────────────────────

/** Checklist de documentos de alta del cliente. */
export interface DocsAlta {
  acta: boolean;           // Acta constitutiva
  poder: boolean;          // Poder notarial del representante
  identificacion: boolean; // Identificación oficial vigente
  csf: boolean;            // Constancia de Situación Fiscal
  comprobante: boolean;    // Comprobante de domicilio fiscal
  bancaria: boolean;       // Carátula de cuenta bancaria (para CLABE)
}

/** Estado del contrato de servicios con el cliente. */
export interface ContratoCliente {
  enviado: boolean;
  firmadoCorreo: boolean;  // Firmado y devuelto por correo
  fisicoArchivado: boolean; // Físico firmado archivado en oficina
  fechaEnvio: string;      // 'YYYY-MM-DD' o vacío
}

/** Estado del pagaré (si aplica al cliente). */
export interface PagareCliente {
  aplica: boolean;
  enviado: boolean;
  firmado: boolean;
  fisico: boolean;         // Físico archivado
  monto: number;
  vencimiento: string;     // 'YYYY-MM-DD' o vacío
}

/** Contacto dentro de la organización del cliente (Magaya). */
export interface ContactoCliente {
  nombre: string;
  tipo?: string | null;
  email?: string | null;
  telefono?: string | null;
  principal?: boolean;
}

// ─── Entidad principal ────────────────────────────────────────────────────────

export interface ClienteVermur {
  /** ID del documento en Firestore (asignado por setDoc con id generado). */
  id: string;

  // ── Identificación ─────────────────────────────────────────────────────────
  nombre: string;          // Razón social
  comercial?: string;      // Nombre comercial / marca
  representante?: string;  // Representante legal
  /** RFC (texto libre en E6; validación algoritmo SAT = E7). */
  rfc?: string;
  domicilio?: string;      // Domicilio fiscal
  telefono?: string;
  correo?: string;

  // ── Identificación Magaya ─────────────────────────────────────────────────
  /** ID semántico legible (ej. CLI-MULLER_TECHNOPLASTICS). */
  idSemantico?: string;
  /** Referencia numérica en Magaya. */
  referenciaMagaya?: string | null;
  /** Número de entidad en Magaya. */
  numeroEntidadMagaya?: string | null;

  // ── Condiciones de crédito ─────────────────────────────────────────────────
  tipoCredito?: 'credito' | 'contado';
  /** Monto de la línea de crédito aprobada (campo interno). */
  monto?: number;
  /** Límite de crédito en MXN (campo Magaya). */
  limiteCreditoMXN?: number;
  divisa?: 'MXN' | 'USD';
  /**
   * Plazo de crédito en días: 0 = contado.
   * Alimenta el cálculo de financiamiento del profit real.
   * En E14 se desglosará a diasCreditoPorTipo.
   */
  dias: number;
  /**
   * Días de crédito desglosados por modalidad (importado de Magaya).
   * Se almacena desde ahora; E14 cambiará la lectura para usarlo.
   */
  diasCreditoPorTipo?: DiasCredito;
  /** Tasa de interés moratorio (%). Default 3. */
  interesMoratorio?: number;

  // ── Estado operativo ───────────────────────────────────────────────────────
  statusOperativo: 'ACTIVO' | 'INACTIVO';
  /**
   * Estado del seguro de crédito Atradius.
   * '✔' = aprobado | 'X' = rechazado | 'NA' | 'SOLICITADO' | 'RECHAZADO' | 'RETIRADO' | ''
   */
  atradius?: '✔' | 'X' | 'NA' | 'SOLICITADO' | 'RECHAZADO' | 'RETIRADO' | '';
  /** Monto aprobado por Atradius (string porque puede incluir moneda/formato). */
  montoAprobado?: string;

  // ── Administrativo ────────────────────────────────────────────────────────
  /** ¿Tiene carpeta de expediente en Google Drive? */
  expedienteDrive?: boolean;
  comentarios?: string;
  /** Fecha de alta del cliente. Formato 'YYYY-MM-DD'. */
  fechaAlta: string;

  // ── Contactos (Magaya) ───────────────────────────────────────────────────
  contactos?: ContactoCliente[];

  // ── Calidad de datos / trazabilidad ──────────────────────────────────────
  /** Estado fiscal del cliente (Magaya). */
  estado?: string | null;
  codigoPostal?: string | null;
  validadoFiscalmente?: boolean;
  tuvoTransacciones?: boolean;
  duplicadoEnMagaya?: boolean;
  origenDatos?: 'manual' | 'magaya';
  fechaAltaMagaya?: string;
  updatedAt?: string;

  // ── Preferencias de proveedores (CP-1: comparativa de pricing) ────────────
  /** IDs de ProveedorVermur que el cliente prefiere. */
  proveedoresPreferidos?: string[];
  /** IDs de ProveedorVermur vetados por el cliente. */
  proveedoresVetados?: string[];

  // ── Sub-objetos KYC ───────────────────────────────────────────────────────
  docsAlta?: DocsAlta;
  contrato?: ContratoCliente;
  pagare?: PagareCliente;
}

// ─── Seed de desarrollo (3 clientes ficticios) ────────────────────────────────
// Solo para sembrar la colección en un proyecto nuevo.
// Los 70 clientes reales del seed_clientes.json de Luis = E8 (migración).

const SEED_FECHA = '2026-01-15';

export const initialClientes: ClienteVermur[] = [
  {
    id: 'CLI-SEED-001',
    nombre: 'Importadora del Golfo S.A. de C.V.',
    comercial: 'ImpGolfo',
    representante: 'Elena Ruiz Sandoval',
    rfc: 'IGS890315AB2',
    domicilio: 'Av. Industriales 450, Parque Industrial Veracruz, CP 91700',
    telefono: '229 910 1122',
    correo: 'eruiz@impgolfo.com',
    tipoCredito: 'credito',
    monto: 250000,
    divisa: 'USD',
    dias: 30,
    interesMoratorio: 3,
    statusOperativo: 'ACTIVO',
    atradius: '✔',
    montoAprobado: 'USD 100,000',
    expedienteDrive: true,
    comentarios: 'Cliente frecuente — flete marítimo y aduanal. Prioridad alta.',
    fechaAlta: SEED_FECHA,
    docsAlta: { acta: true, poder: true, identificacion: true, csf: true, comprobante: true, bancaria: true },
    contrato: { enviado: true, firmadoCorreo: true, fisicoArchivado: true, fechaEnvio: '2026-01-20' },
    pagare: { aplica: false, enviado: false, firmado: false, fisico: false, monto: 0, vencimiento: '' },
  },
  {
    id: 'CLI-SEED-002',
    nombre: 'Distribuidora Nacional de Refacciones S.A.',
    comercial: 'DistriRefac',
    representante: 'Ana Gómez Herrera',
    rfc: 'DNR910722CD5',
    domicilio: 'Blvd. Constitución 3300, Col. Industrial, Querétaro, CP 76120',
    telefono: '442 881 9090',
    correo: 'agomez@distrRefac.com',
    tipoCredito: 'credito',
    monto: 150000,
    divisa: 'MXN',
    dias: 45,
    interesMoratorio: 3,
    statusOperativo: 'ACTIVO',
    atradius: 'NA',
    montoAprobado: '',
    expedienteDrive: true,
    comentarios: 'Transporte terrestre cross-border Laredo-Querétaro principalmente.',
    fechaAlta: SEED_FECHA,
    docsAlta: { acta: true, poder: true, identificacion: true, csf: true, comprobante: false, bancaria: false },
    contrato: { enviado: true, firmadoCorreo: false, fisicoArchivado: false, fechaEnvio: '2026-02-01' },
    pagare: { aplica: true, enviado: true, firmado: false, fisico: false, monto: 50000, vencimiento: '2026-12-31' },
  },
  {
    id: 'CLI-SEED-003',
    nombre: 'Plásticos Ramírez S.A. de C.V.',
    comercial: 'PlastRamírez',
    representante: 'Arturo Ramírez Vega',
    rfc: 'PRA750610EF8',
    domicilio: 'Calle Pino Suárez 88, Zona Industrial, Guadalajara, CP 44490',
    telefono: '33 5555 4444',
    correo: 'arturo@plasticosramirez.com',
    tipoCredito: 'contado',
    monto: 0,
    divisa: 'USD',
    dias: 0,
    interesMoratorio: 0,
    statusOperativo: 'ACTIVO',
    atradius: '',
    montoAprobado: '',
    expedienteDrive: false,
    comentarios: 'Pago de contado. Embarques marítimos Rotterdam-Veracruz.',
    fechaAlta: SEED_FECHA,
    docsAlta: { acta: true, poder: false, identificacion: true, csf: true, comprobante: false, bancaria: false },
    contrato: { enviado: false, firmadoCorreo: false, fisicoArchivado: false, fechaEnvio: '' },
    pagare: { aplica: false, enviado: false, firmado: false, fisico: false, monto: 0, vencimiento: '' },
  },
];
