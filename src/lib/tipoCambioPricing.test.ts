import { describe, it, expect } from 'vitest';
import {
  FUENTE_OPERATIVA_POR_DEFECTO,
  FUENTES_OPERATIVAS,
  FUENTES_REFERENCIA,
  esFuenteOperativa,
  fuenteInicial,
  modoInicial,
  avisoFuenteReferencia,
  etiquetaReferenciaBanxico,
} from './tipoCambioPricing';
import { aplicarReglaPricingRate, type TipoCambioCotizacion } from './monedaComparativa';

const tc = (p: Partial<TipoCambioCotizacion>): TipoCambioCotizacion => ({
  valor: 20.5, base: 'USD', destino: 'MXN', fuente: 'pricing_rate', fecha: '2026-10-05', ...p,
});

// ─────────────────────────────────────────────────────────────────────────────
describe('la tasa operativa es la de Pricing', () => {
  it('una cotización nueva abre con la de Pricing, no con Banxico', () => {
    // «Que no se use el TC del SAT o de Banamex, que se use el de pricing.»
    expect(fuenteInicial(null)).toBe('pricing_rate');
    expect(fuenteInicial(undefined)).toBe('pricing_rate');
    expect(FUENTE_OPERATIVA_POR_DEFECTO).toBe('pricing_rate');
  });

  it('una cotización que ya tiene tasa abre con la suya', () => {
    // Editar no es volver a empezar: la congelada manda.
    expect(fuenteInicial(tc({ fuente: 'banxico' }))).toBe('banxico');
    expect(fuenteInicial(tc({ fuente: 'manual' }))).toBe('manual');
  });

  it('las de mercado NO son tasa operativa', () => {
    FUENTES_REFERENCIA.forEach(f => expect(esFuenteOperativa(f)).toBe(false));
  });

  it('el de Pricing y el capturado a mano sí lo son', () => {
    FUENTES_OPERATIVAS.forEach(f => expect(esFuenteOperativa(f)).toBe(true));
  });

  it('sin fuente no hay tasa operativa', () => {
    expect(esFuenteOperativa(undefined)).toBe(false);
    expect(esFuenteOperativa(null)).toBe(false);
  });

  it('ninguna fuente está en los dos grupos a la vez', () => {
    const cruce = FUENTES_OPERATIVAS.filter(f => FUENTES_REFERENCIA.includes(f));
    expect(cruce).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('la pestaña con la que abre la captura', () => {
  it('con regla aplicada abre en «regla», para que se vea de dónde salió', () => {
    const pr = aplicarReglaPricingRate(19.8, { baseFuente: 'banamex_venta', tipo: 'monto', valor: 4 }, '2026-10-05');
    expect(modoInicial(pr)).toBe('regla');
  });

  it('un valor directo abre en «directo»', () => {
    expect(modoInicial(tc({}))).toBe('directo');
    expect(modoInicial(null)).toBe('directo');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('aviso de fuente de referencia', () => {
  it('lo dice cuando la tasa congelada vino del SAT o de Banxico', () => {
    expect(avisoFuenteReferencia(tc({ fuente: 'banxico' }))).toContain('Banxico');
    expect(avisoFuenteReferencia(tc({ fuente: 'sat' }))).toContain('SAT');
    expect(avisoFuenteReferencia(tc({ fuente: 'banamex_venta' }))).toContain('Banamex venta');
  });

  it('dice explícitamente que la tasa no se cambia', () => {
    // §4.3: recalcular una congelada reordenaría agentes ya decididos.
    expect(avisoFuenteReferencia(tc({ fuente: 'sat' }))).toContain('se queda como está');
  });

  it('calla cuando la tasa ya es la operativa', () => {
    expect(avisoFuenteReferencia(tc({ fuente: 'pricing_rate' }))).toBeNull();
    expect(avisoFuenteReferencia(tc({ fuente: 'manual' }))).toBeNull();
  });

  it('calla cuando todavía no hay tasa: no hay nada que advertir', () => {
    expect(avisoFuenteReferencia(null)).toBeNull();
    expect(avisoFuenteReferencia(undefined)).toBeNull();
  });

  it('una regla con base de mercado NO dispara el aviso', () => {
    // «Banamex venta + 4.00» ES el de Pricing: la base es insumo, no fuente.
    const pr = aplicarReglaPricingRate(19.8, { baseFuente: 'banamex_venta', tipo: 'monto', valor: 4 }, '2026-10-05');
    expect(avisoFuenteReferencia(pr)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('la referencia de Banxico es informativa', () => {
  it('se lee con su fecha y su valor completo, para poder teclearlo', () => {
    expect(etiquetaReferenciaBanxico({ valor: 18.1903, fechaDeterminacion: '2026-10-02' }))
      .toBe('FIX Banxico del 2 oct 2026: 18.1903');
  });

  it('sin dato no pinta nada: un cero no es un tipo de cambio', () => {
    expect(etiquetaReferenciaBanxico(null)).toBeNull();
    expect(etiquetaReferenciaBanxico(undefined)).toBeNull();
    expect(etiquetaReferenciaBanxico({ valor: 0, fechaDeterminacion: '2026-10-02' })).toBeNull();
    expect(etiquetaReferenciaBanxico({ valor: NaN, fechaDeterminacion: '2026-10-02' })).toBeNull();
  });

  it('sin fecha se muestra el valor solo, no una fecha inventada', () => {
    expect(etiquetaReferenciaBanxico({ valor: 18.19, fechaDeterminacion: '' }))
      .toBe('FIX Banxico: 18.19');
  });
});
