import { describe, it, expect } from 'vitest';
import {
  calcularPesoCobrable, entradaDesdeCarga, problemasTarifaCobrable, MOTIVO_MARITIMO_NO_APLICA,
  type CalculoCobrable,
} from './pesoCobrable';
import type { CargaSolicitada } from '../components/quotes/QuotesData';
import { validarCarga, resumenCarga } from './cargaSolicitud';

// Tarea 103: volumen en la carga terrestre y modalidad en la tarifa.

const terrestre = (p: Record<string, unknown> = {}) =>
  ({ tipo: 'terrestre', tipoUnidad: 'torton', pesoBrutoKg: 900, piezas: 1, requiereManiobras: false, ...p }) as CargaSolicitada;
const ok = (r: ReturnType<typeof calcularPesoCobrable>): CalculoCobrable => {
  if (!r.ok) throw new Error(r.motivo);
  return r;
};

describe('entradaDesdeCarga · terrestre con volumen', () => {
  it('lee el volumen capturado', () => {
    expect(entradaDesdeCarga(terrestre({ volumenM3: 12.5 })).volumenM3).toBe(12.5);
  });
  it('sin volumen, null (no cero)', () => {
    expect(entradaDesdeCarga(terrestre()).volumenM3).toBeNull();
    expect(entradaDesdeCarga(terrestre({ volumenM3: null })).volumenM3).toBeNull();
    expect(entradaDesdeCarga(terrestre({ volumenM3: 0 })).volumenM3).toBeNull();
  });
});

describe('calcularPesoCobrable · terrestre', () => {
  const tarifa = { monto: 2, factorVolumetricoKgM3: 250 };

  it('con volumen el volumétrico puede ganar: 12 m³ × 250 = 3,000 kg', () => {
    const r = ok(calcularPesoCobrable(entradaDesdeCarga(terrestre({ volumenM3: 12 })), tarifa, 'terrestre'));
    expect(r.gana).toBe('volumetrico');
    expect(r.cobrableKg).toBe(3000);
    expect(r.total).toBe(6000);
    expect(r.redondeado).toBe(false);
  });
  it('el bruto gana cuando pesa más', () => {
    const r = ok(calcularPesoCobrable(entradaDesdeCarga(terrestre({ volumenM3: 1 })), tarifa, 'terrestre'));
    expect(r.gana).toBe('bruto');
    expect(r.cobrableKg).toBe(900);
  });
  it('sin volumen: «Sin cálculo» con la razón, no un total', () => {
    const r = calcularPesoCobrable(entradaDesdeCarga(terrestre()), tarifa, 'terrestre');
    expect(r.ok).toBe(false);
    expect('motivo' in r && r.motivo).toMatch(/volumen/);
  });
  it('terrestre sin factor en la tarifa: no hay default', () => {
    const r = calcularPesoCobrable(entradaDesdeCarga(terrestre({ volumenM3: 5 })), { monto: 2 }, 'terrestre');
    expect(r.ok).toBe(false);
    expect('motivo' in r && r.motivo).toMatch(/factor/);
  });
});

describe('modalidad de la tarifa', () => {
  const aereoEntrada = { brutoKg: 100, volumenM3: 1, pesoVolumetricoKg: null, aereo: true };

  it('aéreo declarado: 167 por default y medio kilo', () => {
    const r = ok(calcularPesoCobrable({ ...aereoEntrada, brutoKg: 100 }, { monto: 1 }, 'aereo'));
    expect(r.cobrableKg).toBe(167);
    expect(r.factor).toBe(167);
  });
  it('aéreo declarado aunque la carga sea terrestre: 167 y medio kilo', () => {
    const r = ok(calcularPesoCobrable(entradaDesdeCarga(terrestre({ volumenM3: 1 })), { monto: 1 }, 'aereo'));
    expect(r.cobrableKg).toBe(900);
    const r2 = ok(calcularPesoCobrable(entradaDesdeCarga(terrestre({ pesoBrutoKg: 100.2, volumenM3: 0.1 })), { monto: 1 }, 'aereo'));
    expect(r2.cobrableKg).toBe(100.5);
  });
  it('marítimo: no aplica, con la razón', () => {
    const r = calcularPesoCobrable(aereoEntrada, { monto: 1, factorVolumetricoKgM3: 250 }, 'maritimo');
    expect(r).toEqual({ ok: false, motivo: MOTIVO_MARITIMO_NO_APLICA });
  });
  it('terrestre declarado sobre una carga aérea: el default 167 NO se aplica', () => {
    const r = calcularPesoCobrable(aereoEntrada, { monto: 1 }, 'terrestre');
    expect(r.ok).toBe(false);
  });
  it('respaldo: sin modalidad rige la lógica anterior (la carga decide)', () => {
    expect(ok(calcularPesoCobrable(aereoEntrada, { monto: 1 })).factor).toBe(167);
    expect(calcularPesoCobrable({ ...aereoEntrada, aereo: false }, { monto: 1 }).ok).toBe(false);
    expect(calcularPesoCobrable(aereoEntrada, { monto: 1 }, null).ok).toBe(true);
  });
});

describe('problemasTarifaCobrable · modalidad', () => {
  it('terrestre exige factor aunque declare servicio aéreo', () => {
    expect(problemasTarifaCobrable({ monto: 2 }, { aereo: true, modalidad: 'terrestre' }).join()).toMatch(/factor/);
  });
  it('terrestre con factor pasa', () => {
    expect(problemasTarifaCobrable({ monto: 2, factorVolumetricoKgM3: 250 }, { aereo: false, modalidad: 'terrestre' })).toEqual([]);
  });
  it('aéreo no exige factor aunque no declare servicio', () => {
    expect(problemasTarifaCobrable({ monto: 2 }, { aereo: false, modalidad: 'aereo' })).toEqual([]);
  });
  it('marítimo no se guarda', () => {
    expect(problemasTarifaCobrable({ monto: 2, factorVolumetricoKgM3: 250 }, { aereo: false, modalidad: 'maritimo' })).toEqual([MOTIVO_MARITIMO_NO_APLICA]);
  });
  it('sin modalidad: igual que antes', () => {
    expect(problemasTarifaCobrable({ monto: 2 }, { aereo: false }).join()).toMatch(/factor/);
    expect(problemasTarifaCobrable({ monto: 2 }, { aereo: true })).toEqual([]);
  });
});

describe('carga terrestre: validación y resumen', () => {
  it('volumen ausente, null o positivo es válido', () => {
    for (const v of [undefined, null, 8]) {
      expect(validarCarga(terrestre({ volumenM3: v }), 'terrestre' as never)).toEqual(validarCarga(terrestre(), 'terrestre' as never));
    }
  });
  it('volumen negativo se rechaza', () => {
    expect(JSON.stringify(validarCarga(terrestre({ volumenM3: -2 }), 'terrestre' as never))).toMatch(/volumen/);
  });
  it('el resumen incluye los m³ solo si hay', () => {
    expect(resumenCarga(terrestre({ volumenM3: 12 }))).toMatch(/12 m³/);
    expect(resumenCarga(terrestre())).not.toMatch(/m³/);
  });
});
