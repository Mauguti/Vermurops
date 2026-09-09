/**
 * Tests de facturacionEmbarque.ts (2.1).
 *
 * Vermur no tiene PAC: esto registra facturas ya emitidas. Lo que se fija
 * aquí es que el IVA se DERIVE (§4.2) y que cuando no se pueda derivar se
 * diga, en vez de inventar una tasa que se ve idéntica a una correcta.
 */

import { describe, it, expect } from 'vitest';
import {
  lineaDeFactura, proponerFactura, diasCreditoDe, vencimientoFactura, saldoDeFactura,
} from './facturacionEmbarque';
import type { CargoDetalle } from '../components/shipments/EmbarquesData';
import type { ConceptoVermur } from '../components/conceptos/ConceptosData';

const concepto = (over: Partial<ConceptoVermur> = {}): ConceptoVermur => ({
  id: 'CON-001', idSemantico: 'ocean_freight', nombre: 'Ocean Freight',
  categoria: 'flete', activo: true,
  aplicaImpo: true, aplicaExpo: true, aplicaOrigen: true, aplicaDestino: true,
  tieneVenta: true, tieneCosto: true,
  reglaIVA: 'espejo', monedaDefault: 'USD',
  ...over,
} as ConceptoVermur);

const cargo = (over: Partial<CargoDetalle> = {}): CargoDetalle => ({
  id: 'c1', concepto: 'Ocean Freight', tipo: 'ingreso', monto: 1000, moneda: 'MXN',
  conceptoId: 'CON-001', ubicacionIVA: 'destino', facturaId: null,
  ...over,
});

const CATALOGO = [
  concepto(),
  concepto({ id: 'CON-EXENTO', nombre: 'Seguro', reglaIVA: 'exento' }),
  concepto({ id: 'CON-REVISAR', nombre: 'Otros', reglaIVA: 'revisar' }),
];

const ctx = { trafico: 'impo' as const, conceptos: CATALOGO };

// ─── A · El IVA se deriva ────────────────────────────────────────────────────

describe('lineaDeFactura — el IVA se deriva, no se captura', () => {
  it('impo + destino ocurre en México: 16%', () => {
    const l = lineaDeFactura(cargo({ monto: 1000 }), ctx);
    expect(l.tasaIVA).toBe(16);
    expect(l.montoIVA).toBe(160);
    expect(l.avisoIVA).toBeUndefined();
  });

  it('impo + origen ocurre fuera: 0%', () => {
    const l = lineaDeFactura(cargo({ ubicacionIVA: 'origen' }), ctx);
    expect(l.tasaIVA).toBe(0);
    expect(l.montoIVA).toBe(0);
  });

  it('expo + origen ocurre en México: 16%', () => {
    const l = lineaDeFactura(cargo({ ubicacionIVA: 'origen' }), { ...ctx, trafico: 'expo' });
    expect(l.tasaIVA).toBe(16);
  });

  it('un concepto exento va en cero sin aviso: es una regla, no una falta', () => {
    const l = lineaDeFactura(cargo({ conceptoId: 'CON-EXENTO' }), ctx);
    expect(l.tasaIVA).toBe(0);
    expect(l.avisoIVA).toBeUndefined();
  });
});

// ─── B · Cuando NO se puede derivar, se dice ─────────────────────────────────

describe('sin datos para derivar, se avisa en vez de inventar', () => {
  it('sin ubicación: tasa 0 y aviso que pide comparar contra la factura', () => {
    const l = lineaDeFactura(cargo({ ubicacionIVA: undefined }), ctx);
    expect(l.tasaIVA).toBe(0);
    expect(l.avisoIVA).toContain('origen o en destino');
  });

  it('sin tráfico del embarque, tampoco se asume', () => {
    const l = lineaDeFactura(cargo(), { ...ctx, trafico: null });
    expect(l.avisoIVA).toContain('tráfico');
  });

  it('una línea fuera del catálogo lo dice', () => {
    const l = lineaDeFactura(cargo({ conceptoId: undefined }), ctx);
    expect(l.avisoIVA).toContain('catálogo');
  });

  it('la regla «revisar» exige capturarlo a mano y lo nombra', () => {
    const l = lineaDeFactura(cargo({ conceptoId: 'CON-REVISAR' }), ctx);
    expect(l.avisoIVA).toContain('Otros');
  });
});

// ─── C · La propuesta de factura ─────────────────────────────────────────────

describe('proponerFactura', () => {
  it('suma subtotal, IVA y total', () => {
    const r = proponerFactura([cargo({ id: 'a', monto: 1000 }), cargo({ id: 'b', monto: 500 })], ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.propuesta.subtotal).toBe(1500);
    expect(r.propuesta.iva).toBe(240);
    expect(r.propuesta.total).toBe(1740);
  });

  it('§4.3: se niega a mezclar monedas en una factura', () => {
    const r = proponerFactura([cargo({ id: 'a', moneda: 'MXN' }), cargo({ id: 'b', moneda: 'USD' })], ctx);
    expect(r.ok).toBe(false);
    expect('error' in r ? r.error : '').toContain('una sola moneda');
  });

  it('sin líneas facturables, lo dice', () => {
    const r = proponerFactura([], ctx);
    expect(r.ok).toBe(false);
  });

  it('avisa cuántas líneas quedaron sin IVA derivado', () => {
    const r = proponerFactura([cargo({ id: 'a' }), cargo({ id: 'b', ubicacionIVA: undefined })], ctx);
    if (!r.ok) return;
    expect(r.propuesta.avisos[0]).toContain('1 de 2');
  });

  it('la retención se RESTA del total: es impuesto que entera el cliente', () => {
    const conRetencion = concepto({ id: 'CON-TERR', nombre: 'Flete terrestre', reglaIVA: 'terrestre_retencion' });
    const r = proponerFactura(
      [cargo({ conceptoId: 'CON-TERR', monto: 1000 })],
      { ...ctx, conceptos: [...CATALOGO, conRetencion] },
    );
    if (!r.ok) return;
    expect(r.propuesta.retencion).toBe(40);          // 4%
    expect(r.propuesta.total).toBe(1000 + 160 - 40); // 1,120
  });
});

// ─── D · Crédito y vencimiento ───────────────────────────────────────────────

describe('el crédito del cliente es POR MODALIDAD (§4.6)', () => {
  const credito = { maritimo: 45, terrestre: 15, aereo: 20, general: 30 };

  it('usa el desglose de la modalidad del embarque', () => {
    expect(diasCreditoDe(credito, 'maritimo')).toBe(45);
    expect(diasCreditoDe(credito, 'terrestre')).toBe(15);
    expect(diasCreditoDe(credito, 'aereo')).toBe(20);
  });

  it('cae al general cuando la modalidad no está desglosada', () => {
    expect(diasCreditoDe({ general: 30 }, 'maritimo')).toBe(30);
  });

  it('sin crédito conocido es contado, no un plazo inventado', () => {
    expect(diasCreditoDe(null, 'maritimo')).toBe(0);
  });

  it('el vencimiento cuenta días naturales y aterriza en hábil', () => {
    // 30 días desde el 13-ago-2026 = 12-sep, sábado → lunes 14
    expect(vencimientoFactura('2026-08-13', 30)).toBe('2026-09-14');
  });
});

// ─── E · Saldo ───────────────────────────────────────────────────────────────

describe('saldoDeFactura — se deriva de los cobros', () => {
  const factura = { total: 10000, estado: 'emitida' as const, moneda: 'MXN' as const };

  it('sin cobros, se debe todo', () => {
    expect(saldoDeFactura(factura, [])).toMatchObject({ cobrado: 0, saldo: 10000, estado: 'emitida' });
  });

  it('un cobro parcial deja la factura en cobrada_parcial', () => {
    expect(saldoDeFactura(factura, [{ monto: 4000 }]))
      .toMatchObject({ cobrado: 4000, saldo: 6000, estado: 'cobrada_parcial' });
  });

  it('varios cobros que suman el total la cierran', () => {
    expect(saldoDeFactura(factura, [{ monto: 4000 }, { monto: 6000 }]).estado).toBe('cobrada');
  });

  it('un cobro ANULADO deja de contar: por eso se deriva', () => {
    const s = saldoDeFactura(factura, [{ monto: 10000, activo: false }]);
    expect(s.cobrado).toBe(0);
    expect(s.estado).toBe('emitida');
  });

  it('un peso de diferencia por redondeo no deja la factura abierta', () => {
    expect(saldoDeFactura(factura, [{ monto: 9999.5 }]).estado).toBe('cobrada');
  });

  it('§4.3: un cobro en OTRA moneda no liquida la factura, y se avisa', () => {
    const s = saldoDeFactura(factura, [{ monto: 10000, moneda: 'USD' }]);
    expect(s.cobrado).toBe(0);
    expect(s.estado).toBe('emitida');
    expect(s.avisoMoneda).toContain('otra moneda');
  });

  it('un cobro sin moneda se asume de la factura (cobros anteriores al campo)', () => {
    expect(saldoDeFactura(factura, [{ monto: 10000 }]).estado).toBe('cobrada');
  });

  it('una factura cancelada lo sigue estando aunque tenga cobros', () => {
    expect(saldoDeFactura({ total: 10000, estado: 'cancelada', moneda: 'MXN' }, [{ monto: 10000 }]).estado)
      .toBe('cancelada');
  });
});

// ─── F · El tráfico sale del folio, no de un campo duplicado ─────────────────

import { traficoDeFolio } from './facturacionEmbarque';

describe('traficoDeFolio', () => {
  it('lee el tráfico de las series reales', () => {
    expect(traficoDeFolio('VLIM-0001')).toBe('impo');
    expect(traficoDeFolio('VLEM-0001')).toBe('expo');
    expect(traficoDeFolio('VLIT-0042')).toBe('impo');
    expect(traficoDeFolio('VLET-0042')).toBe('expo');
  });

  it('la serie provisional no dice el tráfico: null, no una suposición', () => {
    expect(traficoDeFolio('VL-0001')).toBeNull();
    expect(traficoDeFolio('SHP-0001')).toBeNull();
    expect(traficoDeFolio('')).toBeNull();
  });
});
