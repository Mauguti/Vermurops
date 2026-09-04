// ============================================================
// PuertosData.ts — Modelo de datos del catálogo de Puertos
//
// E10.0: Catálogo de puertos marítimos para rutas estructuradas.
// Mismo patrón que ProveedoresData.ts.
//
// En E10.1 las cotizaciones marítimas referenciarán puertoOrigenId
// y puertoDestinoId de esta colección.
// ============================================================

// ─── Sub-objetos ────────────────────────────────────────────────────────────

/** Terminal dentro de un puerto. Solo algunos puertos tienen terminales. */
export interface Terminal {
  id: string;
  nombre: string;
}

// ─── Tipo de punto ──────────────────────────────────────────────────────────

/**
 * El catálogo dejó de ser solo marítimo (sep-2026): es un catálogo de PUNTOS
 * de origen y destino. El aéreo llega a aeropuerto, no a puerto, y el
 * formulario de solicitud filtra por el tipo que corresponde a la modalidad.
 */
export type TipoPunto = 'maritimo' | 'aereo' | 'terrestre';

export const ETIQUETA_TIPO_PUNTO: Record<TipoPunto, string> = {
  maritimo: 'Puerto marítimo',
  aereo: 'Aeropuerto',
  terrestre: 'Punto terrestre',
};

/**
 * ⚠ Backward compat: los 21 puertos originales no tienen `tipo` y son todos
 * marítimos. Leer SIEMPRE por esta función, nunca por `p.tipo` directo.
 */
export const tipoDePunto = (p: Pick<PuertoVermur, 'tipo'>): TipoPunto => p.tipo ?? 'maritimo';

// ─── Entidad principal ──────────────────────────────────────────────────────

export interface PuertoVermur {
  /** ID del documento en Firestore. */
  id: string;

  /** Código del puerto (ej. MZO, SHA, USLGB). Único, uppercase. */
  codigo: string;

  /** Nombre completo (ej. "Manzanillo", "Shanghai"). */
  nombre: string;

  /** País (ej. "México", "China"). */
  pais: string;

  /** Código ISO 3166-1 alpha-3 del país (ej. MEX, CHN, USA). */
  codigoPais: string;

  /**
   * Terminales del puerto (opcional, la mayoría de puertos no tiene).
   * Array embebido en el documento, mismo patrón que contactos de proveedor.
   */
  terminales: Terminal[];

  /** Tipo de punto. Ausente = marítimo (legacy). Leer con tipoDePunto(). */
  tipo?: TipoPunto;

  /** Baja lógica: los inactivos no aparecen en dropdowns. */
  activo: boolean;

  // ── Auditoría ──────────────────────────────────────────────────────────
  fechaAlta: string;   // YYYY-MM-DD
  updatedAt: string;   // ISO timestamp
}

// ─── Seed de desarrollo ─────────────────────────────────────────────────────
// Puertos frecuentes de Vermur: México + principales de Asia, Europa, USA.

const SEED_FECHA = '2026-01-15';
const SEED_TS = '2026-01-15T00:00:00.000Z';

export const initialPuertos: PuertoVermur[] = [
  // ── México ──────────────────────────────────────────────────────────────
  { id: 'PTO-001', codigo: 'MZO',   nombre: 'Manzanillo',       pais: 'México',        codigoPais: 'MEX', terminales: [], activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-002', codigo: 'LZC',   nombre: 'Lázaro Cárdenas',  pais: 'México',        codigoPais: 'MEX', terminales: [
    { id: 'trm-lzc-1', nombre: 'Terminal 1 (placeholder)' },
    { id: 'trm-lzc-2', nombre: 'Terminal 2 (placeholder)' },
    { id: 'trm-lzc-3', nombre: 'Terminal 3 (placeholder)' },
  ], activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-003', codigo: 'VER',   nombre: 'Veracruz',         pais: 'México',        codigoPais: 'MEX', terminales: [], activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-004', codigo: 'ATM',   nombre: 'Altamira',         pais: 'México',        codigoPais: 'MEX', terminales: [], activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-005', codigo: 'ENS',   nombre: 'Ensenada',         pais: 'México',        codigoPais: 'MEX', terminales: [], activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },

  // ── Asia ────────────────────────────────────────────────────────────────
  { id: 'PTO-006', codigo: 'SHA',   nombre: 'Shanghai',         pais: 'China',         codigoPais: 'CHN', terminales: [], activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-007', codigo: 'NGB',   nombre: 'Ningbo',           pais: 'China',         codigoPais: 'CHN', terminales: [], activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-008', codigo: 'QIN',   nombre: 'Qingdao',          pais: 'China',         codigoPais: 'CHN', terminales: [], activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-009', codigo: 'SHK',   nombre: 'Shekou',           pais: 'China',         codigoPais: 'CHN', terminales: [], activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-010', codigo: 'YTN',   nombre: 'Yantian',          pais: 'China',         codigoPais: 'CHN', terminales: [], activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-011', codigo: 'XMN',   nombre: 'Xiamen',           pais: 'China',         codigoPais: 'CHN', terminales: [], activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-012', codigo: 'BUS',   nombre: 'Busan',            pais: 'Corea del Sur', codigoPais: 'KOR', terminales: [], activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-013', codigo: 'TYO',   nombre: 'Tokio (Yokohama)', pais: 'Japón',         codigoPais: 'JPN', terminales: [], activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },

  // ── USA ─────────────────────────────────────────────────────────────────
  { id: 'PTO-014', codigo: 'LGB',   nombre: 'Long Beach',       pais: 'Estados Unidos', codigoPais: 'USA', terminales: [], activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-015', codigo: 'LAX',   nombre: 'Los Ángeles',      pais: 'Estados Unidos', codigoPais: 'USA', terminales: [], activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-016', codigo: 'HOU',   nombre: 'Houston',          pais: 'Estados Unidos', codigoPais: 'USA', terminales: [], activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-017', codigo: 'SAV',   nombre: 'Savannah',         pais: 'Estados Unidos', codigoPais: 'USA', terminales: [], activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },

  // ── Europa ──────────────────────────────────────────────────────────────
  { id: 'PTO-018', codigo: 'RTM',   nombre: 'Rotterdam',        pais: 'Países Bajos',  codigoPais: 'NLD', terminales: [], activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-019', codigo: 'HAM',   nombre: 'Hamburgo',         pais: 'Alemania',      codigoPais: 'DEU', terminales: [], activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-020', codigo: 'BCN',   nombre: 'Barcelona',        pais: 'España',        codigoPais: 'ESP', terminales: [], activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },

  // ── Frontera terrestre (Laredo — incluido como punto de referencia) ────
  { id: 'PTO-021', codigo: 'LRD',   nombre: 'Laredo',           pais: 'Estados Unidos', codigoPais: 'USA', terminales: [], activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
];

// ─── Seed de aeropuertos (sep-2026) ─────────────────────────────────────────
// Los que Vermur usa con más frecuencia, por código IATA. Ids fijos PTO-Ann
// para que la siembra aditiva sea idempotente: volver a escribirlos no crea
// duplicados. Si falta alguno, Administración lo agrega desde Configuración.

const SEED_AEREO_FECHA = '2026-09-04';
const SEED_AEREO_TS = '2026-09-04T00:00:00.000Z';

export const initialAeropuertos: PuertoVermur[] = [
  { id: 'PTO-A01', codigo: 'MEX', nombre: 'Ciudad de México', pais: 'México', codigoPais: 'MEX', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A02', codigo: 'GDL', nombre: 'Guadalajara', pais: 'México', codigoPais: 'MEX', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A03', codigo: 'MTY', nombre: 'Monterrey', pais: 'México', codigoPais: 'MEX', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A04', codigo: 'QRO', nombre: 'Querétaro', pais: 'México', codigoPais: 'MEX', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A05', codigo: 'TIJ', nombre: 'Tijuana', pais: 'México', codigoPais: 'MEX', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A06', codigo: 'BJX', nombre: 'Bajío (León)', pais: 'México', codigoPais: 'MEX', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A07', codigo: 'CUN', nombre: 'Cancún', pais: 'México', codigoPais: 'MEX', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A08', codigo: 'NLU', nombre: 'Felipe Ángeles (CDMX)', pais: 'México', codigoPais: 'MEX', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A09', codigo: 'LAX', nombre: 'Los Ángeles', pais: 'Estados Unidos', codigoPais: 'USA', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A10', codigo: 'JFK', nombre: 'Nueva York JFK', pais: 'Estados Unidos', codigoPais: 'USA', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A11', codigo: 'MIA', nombre: 'Miami', pais: 'Estados Unidos', codigoPais: 'USA', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A12', codigo: 'ORD', nombre: 'Chicago O\'Hare', pais: 'Estados Unidos', codigoPais: 'USA', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A13', codigo: 'DFW', nombre: 'Dallas-Fort Worth', pais: 'Estados Unidos', codigoPais: 'USA', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A14', codigo: 'IAH', nombre: 'Houston', pais: 'Estados Unidos', codigoPais: 'USA', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A15', codigo: 'ATL', nombre: 'Atlanta', pais: 'Estados Unidos', codigoPais: 'USA', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A16', codigo: 'FRA', nombre: 'Frankfurt', pais: 'Alemania', codigoPais: 'DEU', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A17', codigo: 'AMS', nombre: 'Ámsterdam', pais: 'Países Bajos', codigoPais: 'NLD', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A18', codigo: 'CDG', nombre: 'París Charles de Gaulle', pais: 'Francia', codigoPais: 'FRA', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A19', codigo: 'MAD', nombre: 'Madrid', pais: 'España', codigoPais: 'ESP', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A20', codigo: 'LHR', nombre: 'Londres Heathrow', pais: 'Reino Unido', codigoPais: 'GBR', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A21', codigo: 'PVG', nombre: 'Shanghái Pudong', pais: 'China', codigoPais: 'CHN', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A22', codigo: 'HKG', nombre: 'Hong Kong', pais: 'Hong Kong', codigoPais: 'HKG', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A23', codigo: 'ICN', nombre: 'Seúl Incheon', pais: 'Corea del Sur', codigoPais: 'KOR', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A24', codigo: 'NRT', nombre: 'Tokio Narita', pais: 'Japón', codigoPais: 'JPN', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A25', codigo: 'TPE', nombre: 'Taipéi Taoyuan', pais: 'Taiwán', codigoPais: 'TWN', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
  { id: 'PTO-A26', codigo: 'SIN', nombre: 'Singapur Changi', pais: 'Singapur', codigoPais: 'SGP', tipo: 'aereo', terminales: [], activo: true, fechaAlta: SEED_AEREO_FECHA, updatedAt: SEED_AEREO_TS },
];
