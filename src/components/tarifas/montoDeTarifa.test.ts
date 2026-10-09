import { describe, it, expect } from 'vitest';
import { montoDeTarifa, formulaCobrable, fmtPrecio } from './tarifaMatching';
import type { TarifaVermur } from './TarifasData';
import type { CargaSolicitada } from '../quotes/QuotesData';

const tarifa = (precios: TarifaVermur['precios']): TarifaVermur => ({ id: 'T', moneda: 'USD', precios } as TarifaVermur);
const aerea = (bruto: number, vol: number): CargaSolicitada =>
  ({ tipo: 'aereo', pesoBrutoKg: bruto, pesoVolumetricoKg: vol, piezas: 0, bultos: [], peligrosa: { esPeligrosa: false } }) as CargaSolicitada;

describe('montoDeTarifa (tarea 100)', () => {
  const cobrable = tarifa({ monto: 3, unidad: 'KG_COBRABLE', minimo: 90 });

  it('kg cobrable: devuelve el TOTAL con la carga, no el precio por kg', () => {
    expect(montoDeTarifa(cobrable, undefined, aerea(100, 140))).toBe(420);
  });
  it('kg cobrable sin carga que alcance: null, nunca el precio por kg', () => {
    expect(montoDeTarifa(cobrable, undefined, undefined)).toBeNull();
  });
  it('lo que cuenta peso por TON o WM no cambia', () => {
    expect(montoDeTarifa(tarifa({ monto: 55, unidad: 'TON' }), undefined, aerea(100, 140))).toBe(55);
    expect(montoDeTarifa(tarifa({ monto: 40, unidad: 'WM' }), undefined, undefined)).toBe(40);
  });
  it('contenedor sigue resolviendo por tamaño', () => {
    expect(montoDeTarifa(tarifa({ monto: 1000, unidad: 'CONTENEDOR', montoPor40: 1800 }), '40 GP')).toBe(1800);
  });
  it('la fórmula solo existe para kg cobrable calculable', () => {
    expect(formulaCobrable(cobrable, aerea(100, 140))).toContain('kg cobrable');
    expect(formulaCobrable(cobrable, undefined)).toBeUndefined();
    expect(formulaCobrable(tarifa({ monto: 5, unidad: 'TON' }), aerea(1, 1))).toBeUndefined();
  });
  it('fmtPrecio la nombra', () => {
    expect(fmtPrecio(tarifa({ monto: 3, unidad: 'KG_COBRABLE', escalas: [{ desdeKg: 45, monto: 2 }] }))).toBe('$3/kg cobrable USD · 1 escalas');
  });
});
