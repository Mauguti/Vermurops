import { describe, it, expect } from 'vitest';
import {
  diasEntre, evaluarFactura, cartera, resumenCartera, agruparPorCliente, resumenDeCliente, montoCobrable,
} from './cuentasPorCobrar';
import type { FacturaCliente, CobroCliente } from '../components/facturas/FacturasData';

const HOY = '2026-09-10';

const factura = (over: Partial<FacturaCliente>): FacturaCliente => ({
  id: 'F1', numero: 'A-1', fechaEmision: '2026-08-01', embarqueId: 'E1', embarqueFolio: 'VLIM-1',
  clienteId: 'CLI-1', clienteNombre: 'Alfa', grupoFacturacion: null, lineas: [],
  moneda: 'MXN', subtotal: 10000, iva: 1600, retencion: 0, total: 11600,
  fechaVencimiento: '2026-09-01', diasCredito: 30, estado: 'emitida',
  registradaPor: { uid: 'u', nombre: 'n' }, activo: true, createdAt: '', updatedAt: '',
  ...over,
} as FacturaCliente);

const cobro = (over: Partial<CobroCliente>): CobroCliente => ({
  id: 'C1', facturaId: 'F1', facturaNumero: 'A-1', embarqueId: 'E1', embarqueFolio: 'VLIM-1',
  clienteId: 'CLI-1', clienteNombre: 'Alfa', monto: 5000, moneda: 'MXN', fechaCobro: '2026-09-05',
  banco: 'Santander', referencia: 'REF', registradoPor: { uid: 'u', nombre: 'n' }, activo: true,
  createdAt: '', updatedAt: '', ...over,
});

describe('estado de cobro', () => {
  it('diasEntre en UTC, sin sorpresas de zona horaria', () => {
    expect(diasEntre('2026-09-01', '2026-09-10')).toBe(9);
    expect(diasEntre('2026-09-10', '2026-09-01')).toBe(-9);
  });

  it('vencida: con saldo y fecha pasada', () => {
    const e = evaluarFactura(factura({}), [], HOY);
    expect(e.estado).toBe('vencido');
    expect(e.diasVencido).toBe(9);
    expect(e.saldo).toBe(11600);
  });

  it('por vencer: dentro de los 7 días; por cobrar: con más plazo', () => {
    expect(evaluarFactura(factura({ fechaVencimiento: '2026-09-15' }), [], HOY).estado).toBe('por_vencer');
    expect(evaluarFactura(factura({ fechaVencimiento: '2026-09-17' }), [], HOY).estado).toBe('por_vencer');
    expect(evaluarFactura(factura({ fechaVencimiento: '2026-09-18' }), [], HOY).estado).toBe('por_cobrar');
  });

  it('un cobro parcial deja saldo visible; el total la cierra', () => {
    const parcial = evaluarFactura(factura({}), [cobro({})], HOY);
    expect(parcial.cobrado).toBe(5000);
    expect(parcial.saldo).toBe(6600);
    expect(parcial.estado).toBe('vencido');
    const total = evaluarFactura(factura({}), [cobro({}), cobro({ id: 'C2', monto: 6600 })], HOY);
    expect(total.estado).toBe('cobrado');
  });

  it('§4.3: un cobro en otra moneda no cuenta y se avisa', () => {
    const e = evaluarFactura(factura({}), [cobro({ moneda: 'USD', monto: 11600 })], HOY);
    expect(e.saldo).toBe(11600);
    expect(e.avisoMoneda).toContain('otra moneda');
  });

  it('una cancelada no debe nada y no está en la cartera', () => {
    expect(evaluarFactura(factura({ estado: 'cancelada' }), [], HOY).saldo).toBe(0);
    expect(cartera([factura({ estado: 'cancelada' }), factura({ id: 'F2' })], [], HOY)).toHaveLength(1);
  });
});

describe('KPIs por moneda, nunca revueltos', () => {
  const facturas = [
    factura({ id: 'F1' }),                                                        // MXN 11,600 vencida
    factura({ id: 'F2', moneda: 'USD', total: 2000, fechaVencimiento: '2026-09-30' }), // USD 2,000 por cobrar
    factura({ id: 'F3', total: 500, fechaVencimiento: '2026-08-20' }),           // MXN 500 vencida
  ];
  const cobros = [cobro({ facturaId: 'F1', monto: 1600, fechaCobro: '2026-09-02' }), cobro({ id: 'C9', facturaId: 'F2', moneda: 'USD', monto: 100, fechaCobro: '2026-08-15' })];

  it('por cobrar y vencido separan USD de MXN', () => {
    const r = resumenCartera(cartera(facturas, cobros, HOY), cobros, HOY);
    expect(r.porCobrar).toEqual({ MXN: 10500, USD: 1900 });
    expect(r.vencido).toEqual({ MXN: 10500, USD: 0 });
    expect(r.facturasAbiertas).toBe(3);
    expect(r.facturasVencidas).toBe(2);
  });

  it('cobrado del mes solo cuenta el mes de hoy', () => {
    const r = resumenCartera(cartera(facturas, cobros, HOY), cobros, HOY);
    expect(r.cobradoDelMes).toEqual({ MXN: 1600, USD: 0 });
  });
});

describe('por cliente', () => {
  const facturas = [
    factura({ id: 'F1' }),
    factura({ id: 'F2', clienteId: 'CLI-2', clienteNombre: 'Beta', fechaVencimiento: '2026-09-30', total: 50000 }),
    factura({ id: 'F3', clienteId: null, clienteNombre: 'Gamma legacy', fechaVencimiento: '2026-07-01', total: 100 }),
  ];

  it('agrupa, y los más atrasados van primero', () => {
    const g = agruparPorCliente(cartera(facturas, [], HOY));
    expect(g.map(x => x.clienteNombre)).toEqual(['Gamma legacy', 'Alfa', 'Beta']);
    expect(g[0].maxDiasVencido).toBe(71);
    expect(g[2].vencido.MXN).toBe(0);
    expect(g[2].porCobrar.MXN).toBe(50000);
  });

  it('una factura sin clienteId se agrupa por nombre, no se pierde', () => {
    const g = agruparPorCliente(cartera(facturas, [], HOY));
    expect(g.find(x => x.clienteNombre === 'Gamma legacy')?.clienteId).toBeNull();
  });

  it('«tiene 45,000 por cobrar, 12,000 vencidos» para la ficha', () => {
    const r = resumenDeCliente('CLI-1', [factura({ id: 'A', total: 12000 }), factura({ id: 'B', total: 33000, fechaVencimiento: '2026-10-01' })], [], HOY);
    expect(r?.porCobrar.MXN).toBe(45000);
    expect(r?.vencido.MXN).toBe(12000);
    expect(resumenDeCliente('CLI-9', facturas, [], HOY)).toBeNull();
  });
});

describe('montoCobrable', () => {
  const item = evaluarFactura(factura({}), [cobro({})], HOY); // saldo 6,600
  it('acepta hasta el saldo (con un peso de tolerancia) y rechaza otra moneda', () => {
    expect(montoCobrable(item, 6600, 'MXN')).toBeNull();
    expect(montoCobrable(item, 6601, 'MXN')).toBeNull();
    expect(montoCobrable(item, 7000, 'MXN')).toContain('supera el saldo');
    expect(montoCobrable(item, 100, 'USD')).toContain('§4.3');
    expect(montoCobrable(item, 0, 'MXN')).toContain('mayor que cero');
  });
});
