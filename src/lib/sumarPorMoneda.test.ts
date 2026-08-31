/**
 * sumarPorMoneda.test.ts
 *
 * §4.3: los totales nunca se mezclan.
 *
 * Lo que protegen: este helper existe porque el mismo bug apareció cuatro
 * veces. Si se rompe, vuelve por la quinta — y su forma de romperse es
 * producir un número que se ve bien.
 */

import { describe, it, expect } from 'vitest';
import {
  sumarPorMoneda, sumarPorMonedaConDescartes, monedasConMonto,
  mezclaMonedas, totalDeUnaMoneda, formatearPorMoneda, totalVacio,
} from './sumarPorMoneda';

const item = (monto: number, moneda: string) => ({ monto, moneda });
const M = (x: { monto: number }) => x.monto;
const C = (x: { moneda: string }) => x.moneda;

// ─── A · La suma ─────────────────────────────────────────────────────────────

describe('A · sumarPorMoneda', () => {
  it('separa pesos de dólares', () => {
    expect(sumarPorMoneda([item(2000, 'USD'), item(40000, 'MXN')], M, C))
      .toEqual({ USD: 2000, MXN: 40000 });
  });

  it('NUNCA produce un solo número con dos monedas', () => {
    const t = sumarPorMoneda([item(2000, 'USD'), item(40000, 'MXN')], M, C);
    // El bug que este helper previene daba 42000 en un solo campo.
    expect(t.USD + t.MXN).not.toBe(t.USD);
    expect(monedasConMonto(t)).toHaveLength(2);
  });

  it('acumula varios de la misma moneda', () => {
    expect(sumarPorMoneda([item(100, 'USD'), item(250.5, 'USD')], M, C).USD).toBe(350.5);
  });

  it('redondea a centavos, sin arrastrar el error de punto flotante', () => {
    expect(sumarPorMoneda([item(0.1, 'USD'), item(0.2, 'USD')], M, C).USD).toBe(0.3);
  });

  it('una lista vacía da ceros, no undefined', () => {
    expect(sumarPorMoneda([], M, C)).toEqual(totalVacio());
  });

  it('trata el importe ausente como cero', () => {
    const items = [{ monto: null, moneda: 'USD' }, { monto: 50, moneda: 'USD' }];
    expect(sumarPorMoneda(items, x => x.monto, C).USD).toBe(50);
  });
});

// ─── B · Lo que no se reconoce ───────────────────────────────────────────────

describe('B · monedas desconocidas', () => {
  it('se dejan fuera en vez de caer en USD', () => {
    expect(sumarPorMoneda([item(100, 'EUR'), item(50, 'USD')], M, C))
      .toEqual({ USD: 50, MXN: 0 });
  });

  it('se puede saber cuántas quedaron fuera', () => {
    const r = sumarPorMonedaConDescartes([item(100, 'EUR'), item(9, ''), item(50, 'USD')], M, C);
    expect(r.descartados).toBe(2);
    expect(r.total.USD).toBe(50);
  });
});

// ─── C · Detección de mezcla ─────────────────────────────────────────────────

describe('C · mezclaMonedas', () => {
  it('detecta la mezcla', () => {
    expect(mezclaMonedas([item(1, 'USD'), item(1, 'MXN')], C)).toBe(true);
  });

  it('una sola moneda no es mezcla', () => {
    expect(mezclaMonedas([item(1, 'USD'), item(2, 'USD')], C)).toBe(false);
  });

  it('una lista vacía no es mezcla', () => {
    expect(mezclaMonedas([], C)).toBe(false);
  });

  it('las desconocidas no cuentan como una moneda más', () => {
    expect(mezclaMonedas([item(1, 'USD'), item(1, 'EUR')], C)).toBe(false);
  });
});

// ─── D · El escalar, solo cuando es legítimo ─────────────────────────────────

describe('D · totalDeUnaMoneda', () => {
  it('devuelve el total y su moneda cuando hay una sola', () => {
    expect(totalDeUnaMoneda([item(100, 'MXN'), item(50, 'MXN')], M, C))
      .toEqual({ total: 150, moneda: 'MXN' });
  });

  it('devuelve null si mezcla: obliga a resolver el caso, no lo suma', () => {
    expect(totalDeUnaMoneda([item(100, 'USD'), item(50, 'MXN')], M, C)).toBeNull();
  });

  it('devuelve null si no hay nada', () => {
    expect(totalDeUnaMoneda([], M, C)).toBeNull();
  });

  it('una sola moneda con total cero también es null: no hay importe que dar', () => {
    expect(totalDeUnaMoneda([item(0, 'USD')], M, C)).toBeNull();
  });
});

// ─── E · Presentación ────────────────────────────────────────────────────────

describe('E · formatearPorMoneda', () => {
  it('separa las dos monedas con un más, nunca las suma', () => {
    const t = sumarPorMoneda([item(1500, 'USD'), item(8000, 'MXN')], M, C);
    expect(formatearPorMoneda(t)).toBe('USD 1,500.00 + MXN 8,000.00');
  });

  it('con una sola moneda no inventa la otra', () => {
    expect(formatearPorMoneda(sumarPorMoneda([item(1500, 'USD')], M, C)))
      .toBe('USD 1,500.00');
  });

  it('sin importes dice lo que se le pida, no «0»', () => {
    expect(formatearPorMoneda(totalVacio(), { vacio: 'Sin cargos' })).toBe('Sin cargos');
  });
});
