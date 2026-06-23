/**
 * cotizacionCalculator.ts
 *
 * Función pura que porta la lógica de CotizacionCalculator.php (repo Luis).
 *
 * REGLAS DE NEGOCIO (pendientes de confirmación con Vermur — brief §1):
 *   - Financiamiento : 0.05% por día de crédito  (diasCredito / 2000)
 *   - Comisión       : 10% fijo sobre profit_total
 *   - Costo de ope   : $1,500 MXN por defecto (configurable vía parámetro)
 *   - Margen         : profit / venta  (sobre VENTA, NO markup sobre costo)
 *
 * AISLAMIENTO: este módulo NO importa nada de React ni Firebase.
 * Conéctalo a UI solo a partir de E2.
 */

// ─── Tipos públicos ────────────────────────────────────────────────────────────

/** Datos que Pricing captura manualmente por cada concepto/línea. */
export interface LineaInput {
  costo: number;   // Costo del proveedor (sin profit)
  profit: number;  // Profit absoluto en la misma moneda. Input manual, no calculado.
}

/** Resultado calculado para una sola línea. */
export interface LineaCalc extends LineaInput {
  venta: number;   // costo + profit
  margen: number;  // profit / venta  (0–1, e.g. 0.25 = 25 %)
}

/** Totales consolidados de una cotización completa. */
export interface TotalesCalc {
  // Acumulados
  costo_total: number;
  profit_total: number;
  venta_total: number;
  margen_real: number;          // profit_total / venta_total

  // Financiamiento (por días de crédito del cliente)
  financiamiento_pct: number;   // diasCredito / 2000
  financiamiento_monto: number; // venta_total * financiamiento_pct

  // Comisión interna
  comision_pct: number;         // 0.10 (fijo)
  comision_monto: number;       // profit_total * comision_pct

  // Profit real (neto de comisión y financiamiento)
  profit_real_monto: number;    // profit_total - comision_monto - financiamiento_monto
  profit_real_pct: number;      // profit_real_monto / venta_total

  // Ganancia final (profit real menos costo de operación)
  ganancia_real: number;        // profit_real_monto - costo_ope
}

// ─── Constantes de negocio ────────────────────────────────────────────────────

/** Factor de financiamiento por día de crédito: 0.05 % / día = 1/2000 */
const FACTOR_FINANCIAMIENTO = 1 / 2000;

/** Porcentaje de comisión interna sobre el profit total. */
const COMISION_PCT = 0.10;

/** Costo de operación default (MXN). Vermur debe confirmar si aplica en USD también. */
export const COSTO_OPE_DEFAULT = 1_500;

// ─── calcLinea ────────────────────────────────────────────────────────────────

/**
 * Calcula los campos derivados de una sola línea/concepto.
 *
 * @param costo  - Costo del proveedor (input)
 * @param profit - Profit absoluto capturado por Pricing (input)
 * @returns LineaCalc con venta y margen calculados
 *
 * @example
 * calcLinea(5000, 2000)
 * // → { costo: 5000, profit: 2000, venta: 7000, margen: 0.2857 }
 */
export function calcLinea(costo: number, profit: number): LineaCalc {
  const venta = costo + profit;
  const margen = venta === 0 ? 0 : profit / venta;
  return { costo, profit, venta, margen };
}

// ─── calcTotales ──────────────────────────────────────────────────────────────

/**
 * Consolida n líneas y calcula todos los totales de la cotización.
 *
 * @param lineas      - Array de LineaInput (o LineaCalc — los campos extra se ignoran)
 * @param diasCredito - Días de crédito del cliente (0 = contado)
 * @param costoOpe    - Costo de operación a descontar (default $1,500)
 * @returns TotalesCalc con todos los campos calculados
 */
export function calcTotales(
  lineas: LineaInput[],
  diasCredito: number,
  costoOpe: number = COSTO_OPE_DEFAULT,
): TotalesCalc {
  const costo_total = lineas.reduce((acc, l) => acc + l.costo, 0);
  const profit_total = lineas.reduce((acc, l) => acc + l.profit, 0);
  const venta_total = costo_total + profit_total;

  const margen_real = venta_total === 0 ? 0 : profit_total / venta_total;

  const financiamiento_pct = diasCredito * FACTOR_FINANCIAMIENTO;
  const financiamiento_monto = venta_total * financiamiento_pct;

  const comision_pct = COMISION_PCT;
  const comision_monto = profit_total * comision_pct;

  const profit_real_monto = profit_total - comision_monto - financiamiento_monto;
  const profit_real_pct = venta_total === 0 ? 0 : profit_real_monto / venta_total;

  const ganancia_real = profit_real_monto - costoOpe;

  return {
    costo_total,
    profit_total,
    venta_total,
    margen_real,
    financiamiento_pct,
    financiamiento_monto,
    comision_pct,
    comision_monto,
    profit_real_monto,
    profit_real_pct,
    ganancia_real,
  };
}

// ─── calcProfitFaltante ───────────────────────────────────────────────────────

/**
 * ¿Cuánto profit adicional necesito para alcanzar un margen deseado?
 *
 * Fórmula inversa del margen sobre venta:
 *   venta_objetivo = costo_total / (1 - margenDeseado)
 *   profit_faltante = venta_objetivo - venta_total
 *
 * @param costoTotal     - Suma de costos de todas las líneas
 * @param ventaTotal     - Suma de ventas actuales (costo + profit actuales)
 * @param margenDeseado  - Margen objetivo en decimal (e.g. 0.35 para 35 %)
 * @returns Monto de profit que falta para alcanzar el margen.
 *          Negativo = ya superaste el margen deseado.
 *
 * @example
 * calcProfitFaltante(8000, 11500, 0.35)
 * // venta_objetivo = 8000 / 0.65 ≈ 12307.69
 * // profit_faltante ≈ 807.69
 */
export function calcProfitFaltante(
  costoTotal: number,
  ventaTotal: number,
  margenDeseado: number,
): number {
  if (margenDeseado >= 1) return Infinity;
  const venta_objetivo = costoTotal / (1 - margenDeseado);
  return venta_objetivo - ventaTotal;
}
