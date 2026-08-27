/**
 * TerminosPagoData.ts
 *
 * Modelo e importación del seed para el catálogo de términos de pago.
 * 25 registros iniciales — mismo patrón que ConceptosData / PuertosData.
 */

import seedData from '../../data/seeds/terminos_pago.json';

// ── Modelo ──────────────────────────────────────────────────────────────────

export interface TerminoPagoVermur {
  id: string;               // TP-001 … TP-025
  idSemantico: string;       // Clave corta: "NET30", "2-10-NET30", etc.
  descripcion: string;       // Texto legible: "Crédito a 30 días"
  diasParaPagar: number;     // 0 = contado / prepago
  porcentajeDescuento: number;   // % descuento por pronto pago (0 si no aplica)
  diasParaDescuento: number;     // Días límite para obtener el descuento (0 si no aplica)
  tieneDescuentoProntoPago: boolean;
  esContado: boolean;        // true cuando diasParaPagar === 0
  activo: boolean;
  fechaAlta: string;         // ISO date
  updatedAt: string;         // ISO date
}

// ── Seed ────────────────────────────────────────────────────────────────────

export const initialTerminosPago: TerminoPagoVermur[] = seedData as TerminoPagoVermur[];
