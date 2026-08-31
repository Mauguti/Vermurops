/**
 * monedaComparativa.test.ts
 *
 * MO-1. La regla que gobierna todo: convertir para COMPARAR no es convertir
 * para COTIZAR. Y sin tasa no se inventa una — poner un 18.50 por defecto
 * sería repetir el `tasaCambio = 18.0` que quitamos de los embarques.
 */

import { describe, it, expect } from 'vitest';
import {
  aplicarReglaPricingRate, tasaUtilizable, convertir,
  totalComparable, compararColumnas, etiquetaTipoCambio,
  TipoCambioCotizacion, MontoConMoneda, TotalComparable,
} from './monedaComparativa';

const TC: TipoCambioCotizacion = {
  valor: 18.5, base: 'USD', destino: 'MXN', fuente: 'banxico', fecha: '2026-08-31',
};

// ─────────────────────────────────────────────────────────────────────────────
describe('pricing rate: una regla, no un número suelto', () => {
  it('suma un monto sobre la tasa base', () => {
    // «Ahorita el dólar está en 20, ellos cotizan en 20.50.»
    const r = aplicarReglaPricingRate(20, { baseFuente: 'banamex_venta', tipo: 'monto', valor: 0.5 }, '2026-08-31');
    expect(r.valor).toBe(20.5);
    expect(r.fuente).toBe('pricing_rate');
  });

  it('«Banamex más cuatro pesos»', () => {
    const r = aplicarReglaPricingRate(19.8, { baseFuente: 'banamex_venta', tipo: 'monto', valor: 4 }, '2026-08-31');
    expect(r.valor).toBe(23.8);
    expect(r.reglaAplicada).toBe('Banamex venta + 4.00');
  });

  it('o un porcentaje', () => {
    const r = aplicarReglaPricingRate(20, { baseFuente: 'banxico', tipo: 'porcentaje', valor: 2.5 }, '2026-08-31');
    expect(r.valor).toBe(20.5);
    expect(r.reglaAplicada).toBe('Banxico + 2.5%');
  });

  it('deja escrito de dónde salió el número', () => {
    // Un 20.50 sin explicación es indistinguible de uno tecleado al azar.
    const r = aplicarReglaPricingRate(20, { baseFuente: 'sat', tipo: 'monto', valor: 0.5 }, '2026-08-31');
    expect(etiquetaTipoCambio(r)).toContain('SAT + 0.50');
  });

  it('un colchón negativo también se lee bien', () => {
    const r = aplicarReglaPricingRate(20, { baseFuente: 'banxico', tipo: 'monto', valor: -0.3 }, '2026-08-31');
    expect(r.valor).toBe(19.7);
    expect(r.reglaAplicada).toBe('Banxico − 0.30');
  });
});

describe('tasa utilizable', () => {
  it('cero, negativa o ausente no sirven', () => {
    expect(tasaUtilizable(null)).toBe(false);
    expect(tasaUtilizable(undefined)).toBe(false);
    expect(tasaUtilizable({ ...TC, valor: 0 })).toBe(false);
    expect(tasaUtilizable({ ...TC, valor: -1 })).toBe(false);
  });

  it('una positiva sí', () => {
    expect(tasaUtilizable(TC)).toBe(true);
  });
});

describe('convertir', () => {
  it('USD a MXN multiplica', () => {
    expect(convertir(100, 'USD', 'MXN', TC)).toBe(1850);
  });

  it('MXN a USD divide', () => {
    expect(convertir(1850, 'MXN', 'USD', TC)).toBe(100);
  });

  it('la misma moneda no toca el monto', () => {
    expect(convertir(100, 'USD', 'USD', TC)).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('una sola moneda: comparable sin tasa', () => {
  const soloUSD: MontoConMoneda[] = [
    { monto: 1500, moneda: 'USD' },
    { monto: 300, moneda: 'USD' },
  ];

  it('no requiere tipo de cambio', () => {
    const t = totalComparable(soloUSD, 'USD', null);
    expect(t.requiereTipoCambio).toBe(false);
    expect(t.equivalente).toBe(1800);
  });

  it('el detalle no inventa una conversión que no hubo', () => {
    expect(totalComparable(soloUSD, 'USD', null).detalle).toBe('USD 1,800.00');
  });

  it('pero si NO es la moneda de referencia, sí hace falta la tasa', () => {
    // Comparar una columna en MXN contra otra en USD exige convertir.
    const soloMXN: MontoConMoneda[] = [{ monto: 18500, moneda: 'MXN' }];
    expect(totalComparable(soloMXN, 'USD', null).requiereTipoCambio).toBe(true);
    expect(totalComparable(soloMXN, 'USD', TC).equivalente).toBe(1000);
  });
});

describe('dos monedas', () => {
  const mixto: MontoConMoneda[] = [
    { monto: 1500, moneda: 'USD' },
    { monto: 8000, moneda: 'MXN' },
  ];

  it('SIN tasa el total no existe: null, no cero', () => {
    // Un cero haría que esta columna ganara la comparación.
    const t = totalComparable(mixto, 'USD', null);
    expect(t.equivalente).toBeNull();
    expect(t.requiereTipoCambio).toBe(true);
  });

  it('sin tasa conserva el desglose por moneda', () => {
    const t = totalComparable(mixto, 'USD', null);
    expect(t.porMoneda).toEqual({ USD: 1500, MXN: 8000 });
    expect(t.detalle).toContain('falta tipo de cambio');
  });

  it('con tasa convierte y lo DECLARA', () => {
    // §4.3: el pecado es el total del que no sabes qué mezcla.
    const t = totalComparable(mixto, 'USD', TC);
    expect(t.equivalente).toBe(1932.43);   // 1500 + 8000/18.5
    expect(t.detalle).toBe('USD 1,500.00 + MXN 8,000.00 @ 18.5');
  });

  it('el desglose original SIEMPRE sobrevive a la conversión', () => {
    const t = totalComparable(mixto, 'USD', TC);
    expect(t.porMoneda.USD).toBe(1500);
    expect(t.porMoneda.MXN).toBe(8000);
  });

  it('convertir a MXN da el otro sentido', () => {
    const t = totalComparable(mixto, 'MXN', TC);
    expect(t.equivalente).toBe(35750);   // 1500*18.5 + 8000
  });

  it('sin montos, total en cero y sin exigir tasa', () => {
    const t = totalComparable([], 'USD', null);
    expect(t.equivalente).toBe(0);
    expect(t.requiereTipoCambio).toBe(false);
    expect(t.monedasPresentes).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('comparar columnas', () => {
  const conTasa = (m: MontoConMoneda[]) => totalComparable(m, 'USD', TC);
  const sinTasa = (m: MontoConMoneda[]) => totalComparable(m, 'USD', null);

  it('elige el menor cuando todas son comparables', () => {
    const r = compararColumnas({
      a: conTasa([{ monto: 1800, moneda: 'USD' }]),
      b: conTasa([{ monto: 1700, moneda: 'USD' }]),
      c: conTasa([{ monto: 1900, moneda: 'USD' }]),
    });
    expect(r.menorId).toBe('b');
    expect(r.bloqueadaPorTipoCambio).toBe(false);
  });

  it('compara correctamente mezclando monedas con tasa', () => {
    const r = compararColumnas({
      // 1500 USD + 8000 MXN = 1932.43 USD
      mixto: conTasa([{ monto: 1500, moneda: 'USD' }, { monto: 8000, moneda: 'MXN' }]),
      // 1900 USD
      usd: conTasa([{ monto: 1900, moneda: 'USD' }]),
    });
    expect(r.menorId).toBe('usd');
  });

  it('si UNA columna requiere tasa, NO se marca menor en ninguna', () => {
    // Rankear parcialmente sería peor: el ✓ aparecería sobre un subconjunto y
    // se leería como el ganador de todos.
    const r = compararColumnas({
      a: conTasa([{ monto: 1800, moneda: 'USD' }]),
      b: sinTasa([{ monto: 1500, moneda: 'USD' }, { monto: 8000, moneda: 'MXN' }]),
    });
    expect(r.menorId).toBeNull();
    expect(r.bloqueadaPorTipoCambio).toBe(true);
    expect(r.motivo).toContain('tipo de cambio');
  });

  it('ignora columnas en cero: no cotizar no es ser barato', () => {
    const r = compararColumnas({
      vacia: conTasa([]),
      a: conTasa([{ monto: 1800, moneda: 'USD' }]),
    });
    expect(r.menorId).toBe('a');
  });

  it('sin ninguna columna con precio no hay menor', () => {
    expect(compararColumnas({ a: conTasa([]) }).menorId).toBeNull();
  });

  it('sin columnas no revienta', () => {
    expect(compararColumnas({}).menorId).toBeNull();
  });

  it('en empate gana el primero, como en la matriz', () => {
    const r = compararColumnas({
      a: conTasa([{ monto: 1800, moneda: 'USD' }]),
      b: conTasa([{ monto: 1800, moneda: 'USD' }]),
    });
    expect(r.menorId).toBe('a');
  });
});

describe('etiqueta del tipo de cambio', () => {
  it('dice el valor y la fuente', () => {
    expect(etiquetaTipoCambio(TC)).toBe('1 USD = 18.5 MXN · Banxico');
  });

  it('incluye la regla cuando viene de una', () => {
    const pr = aplicarReglaPricingRate(20, { baseFuente: 'banamex_venta', tipo: 'monto', valor: 0.5 }, '2026-08-31');
    expect(etiquetaTipoCambio(pr)).toBe('1 USD = 20.5 MXN · Pricing rate (Banamex venta + 0.50)');
  });

  it('sin tasa lo dice, no muestra un cero', () => {
    expect(etiquetaTipoCambio(null)).toBe('Sin tipo de cambio');
    expect(etiquetaTipoCambio({ ...TC, valor: 0 })).toBe('Sin tipo de cambio');
  });
});

describe('§4.3 — el dato guardado conserva su moneda', () => {
  it('la conversión NO altera los montos por moneda', () => {
    const montos: MontoConMoneda[] = [
      { monto: 1500, moneda: 'USD' },
      { monto: 8000, moneda: 'MXN' },
    ];
    const antes = JSON.parse(JSON.stringify(montos));
    totalComparable(montos, 'USD', TC);
    expect(montos).toEqual(antes);
  });

  it('el equivalente y el desglose conviven: nunca uno en lugar del otro', () => {
    const t: TotalComparable = totalComparable(
      [{ monto: 1500, moneda: 'USD' }, { monto: 8000, moneda: 'MXN' }], 'USD', TC);
    expect(t.equivalente).not.toBeNull();
    expect(t.monedasPresentes).toEqual(['USD', 'MXN']);
    expect(t.detalle).toContain('USD 1,500.00');
    expect(t.detalle).toContain('MXN 8,000.00');
  });
});
