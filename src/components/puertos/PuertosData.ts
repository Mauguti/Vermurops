// ============================================================
// PuertosData.ts — Modelo de datos del catálogo de Puertos
//
// E10.0: Catálogo de puertos marítimos para rutas estructuradas.
// Mismo patrón que ProveedoresData.ts.
//
// En E10.1 las cotizaciones marítimas referenciarán puertoOrigenId
// y puertoDestinoId de esta colección.
// ============================================================

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
  { id: 'PTO-001', codigo: 'MZO',   nombre: 'Manzanillo',       pais: 'México',        codigoPais: 'MEX', activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-002', codigo: 'LZC',   nombre: 'Lázaro Cárdenas',  pais: 'México',        codigoPais: 'MEX', activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-003', codigo: 'VER',   nombre: 'Veracruz',         pais: 'México',        codigoPais: 'MEX', activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-004', codigo: 'ATM',   nombre: 'Altamira',         pais: 'México',        codigoPais: 'MEX', activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-005', codigo: 'ENS',   nombre: 'Ensenada',         pais: 'México',        codigoPais: 'MEX', activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },

  // ── Asia ────────────────────────────────────────────────────────────────
  { id: 'PTO-006', codigo: 'SHA',   nombre: 'Shanghai',         pais: 'China',         codigoPais: 'CHN', activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-007', codigo: 'NGB',   nombre: 'Ningbo',           pais: 'China',         codigoPais: 'CHN', activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-008', codigo: 'QIN',   nombre: 'Qingdao',          pais: 'China',         codigoPais: 'CHN', activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-009', codigo: 'SHK',   nombre: 'Shekou',           pais: 'China',         codigoPais: 'CHN', activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-010', codigo: 'YTN',   nombre: 'Yantian',          pais: 'China',         codigoPais: 'CHN', activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-011', codigo: 'XMN',   nombre: 'Xiamen',           pais: 'China',         codigoPais: 'CHN', activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-012', codigo: 'BUS',   nombre: 'Busan',            pais: 'Corea del Sur', codigoPais: 'KOR', activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-013', codigo: 'TYO',   nombre: 'Tokio (Yokohama)', pais: 'Japón',         codigoPais: 'JPN', activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },

  // ── USA ─────────────────────────────────────────────────────────────────
  { id: 'PTO-014', codigo: 'LGB',   nombre: 'Long Beach',       pais: 'Estados Unidos', codigoPais: 'USA', activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-015', codigo: 'LAX',   nombre: 'Los Ángeles',      pais: 'Estados Unidos', codigoPais: 'USA', activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-016', codigo: 'HOU',   nombre: 'Houston',          pais: 'Estados Unidos', codigoPais: 'USA', activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-017', codigo: 'SAV',   nombre: 'Savannah',         pais: 'Estados Unidos', codigoPais: 'USA', activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },

  // ── Europa ──────────────────────────────────────────────────────────────
  { id: 'PTO-018', codigo: 'RTM',   nombre: 'Rotterdam',        pais: 'Países Bajos',  codigoPais: 'NLD', activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-019', codigo: 'HAM',   nombre: 'Hamburgo',         pais: 'Alemania',      codigoPais: 'DEU', activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
  { id: 'PTO-020', codigo: 'BCN',   nombre: 'Barcelona',        pais: 'España',        codigoPais: 'ESP', activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },

  // ── Frontera terrestre (Laredo — incluido como punto de referencia) ────
  { id: 'PTO-021', codigo: 'LRD',   nombre: 'Laredo',           pais: 'Estados Unidos', codigoPais: 'USA', activo: true,  fechaAlta: SEED_FECHA, updatedAt: SEED_TS },
];
