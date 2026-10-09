import { describe, it, expect } from 'vitest';
import {
  calcularPesoCobrable, redondearMedioKilo, entradaDesdeCarga, problemasTarifaCobrable,
  FACTOR_VOLUMETRICO_AEREO, type EntradaPeso, type CalculoCobrable,
} from './pesoCobrable';
import type { CargaSolicitada } from '../components/quotes/QuotesData';

const aereo = (p: Partial<EntradaPeso> = {}): EntradaPeso => ({ brutoKg: 100, volumenM3: 0.5, pesoVolumetricoKg: null, aereo: true, ...p });
const terr = (p: Partial<EntradaPeso> = {}): EntradaPeso => ({ brutoKg: 1000, volumenM3: 4, pesoVolumetricoKg: null, aereo: false, ...p });
const motivoDe = (r: ReturnType<typeof calcularPesoCobrable>) => ('motivo' in r ? r.motivo : '');
const ok = (r: ReturnType<typeof calcularPesoCobrable>): CalculoCobrable => {
  if (!r.ok) throw new Error(motivoDe(r));
  return r;
};

describe('calcularPesoCobrable', () => {
  it('bruto mayor: se cobra el bruto', () => {
    const r = ok(calcularPesoCobrable(aereo({ brutoKg: 200, volumenM3: 0.5 }), { monto: 4 }));
    expect(r.gana).toBe('bruto');
    expect(r.cobrableKg).toBe(200);
    expect(r.total).toBe(800);
  });

  it('volumétrico mayor: 1 m³ × 167 gana a 100 kg', () => {
    const r = ok(calcularPesoCobrable(aereo({ brutoKg: 100, volumenM3: 1 }), { monto: 3 }));
    expect(r.gana).toBe('volumetrico');
    expect(r.volumetricoKg).toBe(FACTOR_VOLUMETRICO_AEREO);
    expect(r.cobrableKg).toBe(167);
    expect(r.total).toBe(501);
  });

  it('aéreo redondea hacia arriba al medio kilo; un medio exacto no sube', () => {
    expect(redondearMedioKilo(101.2)).toBe(101.5);
    expect(redondearMedioKilo(101.5)).toBe(101.5);
    expect(redondearMedioKilo(101.51)).toBe(102);
    expect(redondearMedioKilo(101)).toBe(101);
    const r = ok(calcularPesoCobrable(aereo({ brutoKg: 101.2, volumenM3: 0.1 }), { monto: 2 }));
    expect(r.cobrableKg).toBe(101.5);
    expect(r.redondeado).toBe(true);
    expect(r.total).toBe(203);
  });

  it('terrestre NO redondea al medio kilo', () => {
    const r = ok(calcularPesoCobrable(terr({ brutoKg: 1000.2, volumenM3: 1 }), { monto: 1, factorVolumetricoKgM3: 250 }));
    expect(r.cobrableKg).toBe(1000.2);
    expect(r.redondeado).toBe(false);
  });

  it('el mínimo gana cuando el cálculo queda debajo', () => {
    const r = ok(calcularPesoCobrable(aereo({ brutoKg: 10, volumenM3: 0.01 }), { monto: 3, minimo: 90 }));
    expect(r.subtotal).toBe(30);
    expect(r.minimoAplicado).toBe(true);
    expect(r.total).toBe(90);
  });

  it('si el cálculo pasa del mínimo, el mínimo no interviene', () => {
    const r = ok(calcularPesoCobrable(aereo({ brutoKg: 100, volumenM3: 0.1 }), { monto: 3, minimo: 90 }));
    expect(r.minimoAplicado).toBe(false);
    expect(r.total).toBe(300);
  });

  it('lee el montoMinimo anterior como respaldo del mínimo', () => {
    const r = ok(calcularPesoCobrable(aereo({ brutoKg: 10, volumenM3: 0.01 }), { monto: 3, montoMinimo: 75 }));
    expect(r.total).toBe(75);
  });

  describe('escalas: el borde cuenta', () => {
    const escalas = [{ desdeKg: 45, monto: 5 }, { desdeKg: 100, monto: 4 }, { desdeKg: 300, monto: 3 }];
    const precioPara = (kg: number) => ok(calcularPesoCobrable(aereo({ brutoKg: kg, volumenM3: 0.01 }), { monto: 6, escalas })).precioKg;

    it('debajo de la primera escala rige el monto base', () => expect(precioPara(44.5)).toBe(6));
    it('45 kg exactos ya entran a la escala de 45', () => expect(precioPara(45)).toBe(5));
    it('44.5 vs 45 cambia el precio', () => expect(precioPara(45)).not.toBe(precioPara(44.5)));
    it('99.5 sigue en la de 45 y 100 salta a la de 100', () => { expect(precioPara(99.5)).toBe(5); expect(precioPara(100)).toBe(4); });
    it('las escalas desordenadas dan lo mismo', () => {
      const r = ok(calcularPesoCobrable(aereo({ brutoKg: 350, volumenM3: 0.01 }), { monto: 6, escalas: [...escalas].reverse() }));
      expect(r.precioKg).toBe(3);
      expect(r.escalaDesdeKg).toBe(300);
    });
    it('la escala se decide con el cobrable REDONDEADO: 44.8 → 45 entra', () => expect(precioPara(44.8)).toBe(5));
  });

  describe('no inventa', () => {
    it('sin peso bruto', () => expect(calcularPesoCobrable(aereo({ brutoKg: null }), { monto: 3 }).ok).toBe(false));
    it('con peso bruto en cero', () => expect(calcularPesoCobrable(aereo({ brutoKg: 0 }), { monto: 3 }).ok).toBe(false));
    it('sin volumen ni volumétrico capturado', () => {
      const r = calcularPesoCobrable(aereo({ volumenM3: null }), { monto: 3 });
      expect(r.ok).toBe(false);
      expect(motivoDe(r)).toMatch(/volumen/);
    });
    it('terrestre sin factor en la tarifa', () => {
      const r = calcularPesoCobrable(terr(), { monto: 1 });
      expect(r.ok).toBe(false);
      expect(motivoDe(r)).toMatch(/factor/);
    });
    it('tarifa sin precio', () => expect(calcularPesoCobrable(aereo(), { monto: 0 }).ok).toBe(false));
  });

  it('aéreo: el pesoVolumetricoKg capturado se respeta aunque haya volumen', () => {
    const r = ok(calcularPesoCobrable(aereo({ brutoKg: 100, volumenM3: 9, pesoVolumetricoKg: 120 }), { monto: 2 }));
    expect(r.volumetricoKg).toBe(120);
    expect(r.origenVolumetrico).toBe('capturado');
    expect(r.cobrableKg).toBe(120);
  });

  it('aéreo con volumétrico capturado no necesita volumen', () => {
    expect(calcularPesoCobrable(aereo({ volumenM3: null, pesoVolumetricoKg: 120 }), { monto: 2 }).ok).toBe(true);
  });

  it('el factor de la tarifa manda sobre el 167', () => {
    const r = ok(calcularPesoCobrable(aereo({ brutoKg: 10, volumenM3: 1 }), { monto: 1, factorVolumetricoKgM3: 200 }));
    expect(r.volumetricoKg).toBe(200);
  });

  it('terrestre con factor propio', () => {
    const r = ok(calcularPesoCobrable(terr({ brutoKg: 500, volumenM3: 4 }), { monto: 2, factorVolumetricoKgM3: 250 }));
    expect(r.volumetricoKg).toBe(1000);
    expect(r.gana).toBe('volumetrico');
    expect(r.total).toBe(2000);
  });

  it('la fórmula dice cuál se cobró y el mínimo', () => {
    const r = ok(calcularPesoCobrable(aereo({ brutoKg: 10, volumenM3: 0.01 }), { monto: 3, minimo: 90 }));
    expect(r.formula).toContain('bruto');
    expect(r.formula).toContain('mínimo 90');
  });
});

describe('entradaDesdeCarga', () => {
  const base = { piezas: 0, bultos: [], peligrosa: { esPeligrosa: false } };
  it('LCL usa su volumen', () => {
    const c = { tipo: 'lcl', pesoBrutoKg: 800, volumenM3: 3, estibable: true, ...base } as CargaSolicitada;
    expect(entradaDesdeCarga(c)).toMatchObject({ brutoKg: 800, volumenM3: 3, aereo: false });
  });
  it('aéreo respeta el volumétrico capturado', () => {
    const c = { tipo: 'aereo', pesoBrutoKg: 100, pesoVolumetricoKg: 140, ...base } as CargaSolicitada;
    expect(entradaDesdeCarga(c)).toMatchObject({ pesoVolumetricoKg: 140, aereo: true });
  });
  it('aéreo calcula el volumen de los bultos cuando cubren todas las piezas', () => {
    const c = { tipo: 'aereo', pesoBrutoKg: 100, pesoVolumetricoKg: 0, piezas: 2, bultos: [{ largoCm: 100, anchoCm: 100, altoCm: 50 }, { largoCm: 100, anchoCm: 100, altoCm: 50 }], peligrosa: { esPeligrosa: false } } as CargaSolicitada;
    expect(entradaDesdeCarga(c).volumenM3).toBeCloseTo(1);
  });
  it('aéreo NO calcula con medidas que no cubren las piezas', () => {
    const c = { tipo: 'aereo', pesoBrutoKg: 100, pesoVolumetricoKg: 0, piezas: 5, bultos: [{ largoCm: 100, anchoCm: 100, altoCm: 50 }], peligrosa: { esPeligrosa: false } } as CargaSolicitada;
    expect(entradaDesdeCarga(c).volumenM3).toBeNull();
  });
  it('terrestre solo trae peso', () => {
    const c = { tipo: 'terrestre', tipoUnidad: 'torton', pesoBrutoKg: 900, piezas: 1, requiereManiobras: false } as CargaSolicitada;
    expect(entradaDesdeCarga(c)).toMatchObject({ brutoKg: 900, volumenM3: null });
  });
  it('sin carga: todo desconocido', () => {
    expect(entradaDesdeCarga(undefined)).toEqual({ brutoKg: null, volumenM3: null, pesoVolumetricoKg: null, aereo: false });
  });
});

describe('problemasTarifaCobrable', () => {
  it('terrestre sin factor no se guarda', () => {
    expect(problemasTarifaCobrable({ monto: 2 }, { aereo: false }).join()).toMatch(/factor/);
  });
  it('aéreo sin factor sí (rige 167)', () => {
    expect(problemasTarifaCobrable({ monto: 2 }, { aereo: true })).toEqual([]);
  });
  it('escalas repetidas o sin precio', () => {
    const p = problemasTarifaCobrable({ monto: 2, factorVolumetricoKgM3: 250, escalas: [{ desdeKg: 45, monto: 3 }, { desdeKg: 45, monto: 0 }] }, { aereo: false });
    expect(p.join()).toMatch(/dos escalas/);
    expect(p.join()).toMatch(/necesita un precio/);
  });
});
