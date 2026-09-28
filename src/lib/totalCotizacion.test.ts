import { describe, it, expect } from 'vitest';
import { totalDeCotizacion, tieneTotal } from './totalCotizacion';
import type { LineaPlana } from './lineasCotizacion';

const l = (venta: number, moneda: 'USD' | 'MXN'): LineaPlana =>
  ({ venta, moneda } as LineaPlana);

describe('B · el caso de COT-2026-0034', () => {
  /*
   * El encabezado decía «USD 26,550.00 + MXN 70.00» y el desglose «$26,660
   * USD». Ni el número ni la moneda coincidían, y la diferencia —110— no
   * cuadraba con los 70 pesos: eran dos defectos encadenados.
   */
  const LINEAS = [l(26_550, 'USD'), l(70, 'MXN')];

  it('los dos lugares dan el MISMO número, por moneda', () => {
    const t = totalDeCotizacion(LINEAS, 26_660);
    expect(t.porMoneda.USD).toBe(26_550);
    expect(t.porMoneda.MXN).toBe(70);
    expect(t.monedas).toEqual(['USD', 'MXN']);
  });

  it('los 70 pesos NO se suman a los dólares', () => {
    const t = totalDeCotizacion(LINEAS);
    expect(t.porMoneda.USD).not.toBe(26_620);
    expect(t.texto).toContain('26,550');
    expect(t.texto).toContain('70');
  });

  it('el total guardado deja de mandar, y se declara aparte', () => {
    const t = totalDeCotizacion(LINEAS, 26_660);
    expect(t.guardadoDistinto).toBe(26_660);
  });

  it('con dos divisas el pie lo dice', () => {
    expect(totalDeCotizacion(LINEAS).variasMonedas).toBe(true);
  });
});

describe('cuándo se avisa del total guardado', () => {
  it('una sola moneda y coincide: no se avisa', () => {
    expect(totalDeCotizacion([l(1000, 'USD')], 1000).guardadoDistinto).toBeNull();
  });

  it('una sola moneda y difiere: se avisa', () => {
    expect(totalDeCotizacion([l(1000, 'USD')], 1100).guardadoDistinto).toBe(1100);
  });

  it('diferencias de centavos no cuentan como divergencia', () => {
    expect(totalDeCotizacion([l(1000, 'USD')], 1000.004).guardadoDistinto).toBeNull();
  });

  it('con VARIAS monedas se avisa siempre que haya guardado', () => {
    // Ese escalar por fuerza mezcló divisas: no hay contra qué compararlo sin
    // inventar una tasa, y callarlo lo dejaría pasando por actual.
    expect(totalDeCotizacion([l(100, 'USD'), l(50, 'MXN')], 150).guardadoDistinto).toBe(150);
  });

  it('sin guardado, o guardado en cero, no se avisa', () => {
    expect(totalDeCotizacion([l(1000, 'USD')]).guardadoDistinto).toBeNull();
    expect(totalDeCotizacion([l(1000, 'USD')], 0).guardadoDistinto).toBeNull();
    expect(totalDeCotizacion([l(1000, 'USD')], null).guardadoDistinto).toBeNull();
  });
});

describe('sin líneas', () => {
  it('no hay total que enseñar', () => {
    const t = totalDeCotizacion([]);
    expect(tieneTotal(t)).toBe(false);
    expect(t.texto).toBe('');
    expect(t.variasMonedas).toBe(false);
  });

  it('pero un guardado huérfano se sigue declarando', () => {
    // Una cotización que se quedó sin líneas y conserva el total viejo es
    // justo el caso donde el número engaña más.
    expect(totalDeCotizacion([], 5000).guardadoDistinto).toBe(5000);
  });
});
