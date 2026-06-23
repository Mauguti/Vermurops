/**
 * cotizacionCalculator.test.ts
 *
 * 3 casos numéricos diseñados para verificarse a mano contra el Excel de Vermur.
 * Todos los valores están redondeados a 2 decimales donde aplique.
 *
 * Ejecutar: npm test
 */

import { describe, it, expect } from 'vitest';
import {
  calcLinea,
  calcTotales,
  calcProfitFaltante,
  COSTO_OPE_DEFAULT,
} from './cotizacionCalculator';

// ─── Utilidad ──────────────────────────────────────────────────────────────────

/** Redondea a n decimales para comparaciones flotantes. */
const r = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

// ─────────────────────────────────────────────────────────────────────────────
// calcLinea
// ─────────────────────────────────────────────────────────────────────────────

describe('calcLinea', () => {
  it('calcula venta y margen sobre venta (no markup)', () => {
    //  costo=5000, profit=2000
    //  venta  = 5000 + 2000 = 7000
    //  margen = 2000 / 7000 = 0.2857 (28.57 %)   ← sobre VENTA
    const res = calcLinea(5000, 2000);
    expect(res.venta).toBe(7000);
    expect(r(res.margen)).toBe(r(2000 / 7000));
  });

  it('margen 0 cuando costo=0 y profit=0 (no divide por cero)', () => {
    const res = calcLinea(0, 0);
    expect(res.venta).toBe(0);
    expect(res.margen).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CASO 1 — Sin días de crédito (contado)
//
// Líneas:
//   L1: costo=5000, profit=2000  → venta=7000, margen≈28.57%
//   L2: costo=3000, profit=1500  → venta=4500, margen≈33.33%
//
// Totales:
//   costo_total  = 8000
//   profit_total = 3500
//   venta_total  = 11500
//   margen_real  = 3500/11500 ≈ 30.43%
//
//   financiamiento_pct   = 0/2000 = 0
//   financiamiento_monto = 0
//
//   comision_pct   = 10%
//   comision_monto = 3500 * 0.10 = 350
//
//   profit_real_monto = 3500 - 350 - 0   = 3150
//   profit_real_pct   = 3150 / 11500     ≈ 27.39%
//   ganancia_real     = 3150 - 1500      = 1650
// ─────────────────────────────────────────────────────────────────────────────

describe('CASO 1 – Contado (0 días de crédito)', () => {
  const lineas = [
    { costo: 5000, profit: 2000 },
    { costo: 3000, profit: 1500 },
  ];
  const t = calcTotales(lineas, 0);

  it('acumulados base', () => {
    expect(t.costo_total).toBe(8000);
    expect(t.profit_total).toBe(3500);
    expect(t.venta_total).toBe(11500);
    expect(r(t.margen_real)).toBe(r(3500 / 11500));
  });

  it('financiamiento = 0 (contado)', () => {
    expect(t.financiamiento_pct).toBe(0);
    expect(t.financiamiento_monto).toBe(0);
  });

  it('comisión interna 10%', () => {
    expect(t.comision_pct).toBe(0.10);
    expect(t.comision_monto).toBe(350);
  });

  it('profit real y ganancia', () => {
    expect(t.profit_real_monto).toBe(3150);
    expect(r(t.profit_real_pct)).toBe(r(3150 / 11500));
    expect(t.ganancia_real).toBe(1650);          // 3150 - 1500 (costo_ope)
  });

  it('costo_ope default es $1,500', () => {
    expect(COSTO_OPE_DEFAULT).toBe(1500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CASO 2 — Con 30 días de crédito
//
// Mismas líneas que Caso 1.
//
//   financiamiento_pct   = 30 / 2000  = 0.015  (1.5%)
//   financiamiento_monto = 11500 * 0.015 = 172.50
//
//   comision_monto = 350  (igual)
//
//   profit_real_monto = 3500 - 350 - 172.50 = 2977.50
//   profit_real_pct   = 2977.50 / 11500     ≈ 25.89%
//   ganancia_real     = 2977.50 - 1500      = 1477.50
// ─────────────────────────────────────────────────────────────────────────────

describe('CASO 2 – 30 días de crédito', () => {
  const lineas = [
    { costo: 5000, profit: 2000 },
    { costo: 3000, profit: 1500 },
  ];
  const t = calcTotales(lineas, 30);

  it('financiamiento 1.5% sobre venta_total', () => {
    expect(t.financiamiento_pct).toBe(0.015);
    expect(t.financiamiento_monto).toBe(172.5);
  });

  it('profit real descontando comisión y financiamiento', () => {
    expect(t.profit_real_monto).toBe(2977.5);
    expect(r(t.profit_real_pct)).toBe(r(2977.5 / 11500));
  });

  it('ganancia real neta de costo de operación', () => {
    expect(t.ganancia_real).toBe(1477.5);          // 2977.5 - 1500
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CASO 3 — calcProfitFaltante
//
// ¿Cuánto profit le falta a esta cotización para llegar a margen 35%?
//
//   costoTotal  = 8000   (mismo Caso 1)
//   ventaTotal  = 11500  (mismo Caso 1)
//   margenDeseado = 0.35
//
//   venta_objetivo  = 8000 / (1 - 0.35) = 8000 / 0.65 ≈ 12307.6923
//   profit_faltante = 12307.6923 - 11500 ≈ 807.6923
// ─────────────────────────────────────────────────────────────────────────────

describe('CASO 3 – calcProfitFaltante (margen objetivo 35%)', () => {
  it('calcula el profit adicional necesario', () => {
    const faltante = calcProfitFaltante(8000, 11500, 0.35);
    // venta_objetivo = 8000 / 0.65 = 12307.692...
    const esperado = 8000 / 0.65 - 11500;
    expect(r(faltante)).toBe(r(esperado));
    // Verificación manual: ≈ 807.69
    expect(faltante).toBeCloseTo(807.69, 1);
  });

  it('negativo si ya superaste el margen deseado', () => {
    // Con margen_real ≈ 30.43% y margenDeseado=0.20, sobra profit
    const faltante = calcProfitFaltante(8000, 11500, 0.20);
    expect(faltante).toBeLessThan(0);
  });

  it('devuelve Infinity si margenDeseado >= 1 (imposible)', () => {
    expect(calcProfitFaltante(8000, 11500, 1)).toBe(Infinity);
  });
});
