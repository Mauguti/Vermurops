/**
 * Tests de cierresEmbarque.ts (2.4).
 *
 * El caso que motiva todo: un interruptor manual dice lo que alguien recordó
 * marcar, no lo que pasó. Un embarque podía aparecer «cerrado de pago» con la
 * factura sin cobrar. Aquí se fija que los datos lo contradigan.
 */

import { describe, it, expect } from 'vitest';
import { evaluarCierres, avisoDeOrden } from './cierresEmbarque';
import type { EmbarqueCompleto, CargoDetalle } from '../components/shipments/EmbarquesData';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import type { FacturaCliente, CobroCliente } from '../components/facturas/FacturasData';

const cargo = (over: Partial<CargoDetalle> = {}): CargoDetalle => ({
  id: 'c1', concepto: 'Ocean Freight', tipo: 'ingreso', monto: 1000, moneda: 'MXN',
  facturaId: null, ...over,
});

const embarque = (over: Partial<EmbarqueCompleto> = {}): EmbarqueCompleto => ({
  id: 'EMB-1', folio: 'VLIM-0001', modalidad: 'maritimo',
  numeroGuia: 'MSKU123', numeroReservacion: '',
  requiereCaptura: false, advertenciasHeredadas: [],
  cierres: { operativo: false, pago: false, administrativo: false },
  cargos: { detalles: [], ingresos: 0, gastos: 0, ganancia: 0, moneda: 'MXN' },
  ...over,
} as unknown as EmbarqueCompleto);

const factura = (over: Partial<FacturaCliente> = {}): FacturaCliente => ({
  id: 'FAC-1', numero: 'A-100', fechaEmision: '2026-09-01',
  embarqueId: 'EMB-1', embarqueFolio: 'VLIM-0001',
  clienteId: 'CLI-1', clienteNombre: 'Cliente', grupoFacturacion: null,
  lineas: [], moneda: 'MXN', subtotal: 1000, iva: 160, retencion: 0, total: 1160,
  fechaVencimiento: '2026-10-01', diasCredito: 30, estado: 'emitida',
  registradaPor: { uid: 'u', nombre: 'Julio' },
  activo: true, createdAt: '', updatedAt: '',
  ...over,
});

const cobro = (monto: number, over: Partial<CobroCliente> = {}): CobroCliente => ({
  id: 'COB-1', facturaId: 'FAC-1', facturaNumero: 'A-100',
  embarqueId: 'EMB-1', embarqueFolio: 'VLIM-0001',
  clienteId: 'CLI-1', clienteNombre: 'Cliente',
  monto, moneda: 'MXN', fechaCobro: '2026-09-20', banco: 'Santander', referencia: 'R1',
  registradoPor: { uid: 'u', nombre: 'Julio' },
  activo: true, createdAt: '', updatedAt: '',
  ...over,
});

const orden = (over: Partial<OrdenCompra> = {}): OrdenCompra => ({
  id: 'oc-1', folio: 'OC-2026-0001', estado: 'autorizada', activo: true,
  embarqueId: 'EMB-1', monto: 500, moneda: 'MXN',
  ...over,
} as OrdenCompra);

const ctx = (over: Partial<Parameters<typeof evaluarCierres>[0]> = {}) => ({
  embarque: embarque(), ordenes: [], facturas: [], cobros: [], ...over,
});

// ─── A · Operativo ───────────────────────────────────────────────────────────

describe('cierre operativo', () => {
  it('con guía y sin advertencias, está listo', () => {
    expect(evaluarCierres(ctx()).operativo.listo).toBe(true);
  });

  it('sin guía ni reservación, no', () => {
    const r = evaluarCierres(ctx({ embarque: embarque({ numeroGuia: '', numeroReservacion: '' }) }));
    expect(r.operativo.listo).toBe(false);
    expect(r.operativo.faltantes[0]).toContain('guía');
  });

  it('las advertencias heredadas sin resolver lo frenan', () => {
    const r = evaluarCierres(ctx({
      embarque: embarque({ advertenciasHeredadas: [{ tipo: 'sin_venta' }] as never }),
    }));
    expect(r.operativo.listo).toBe(false);
    expect(r.operativo.faltantes.join(' ')).toContain('advertencia');
  });
});

// ─── B · De pago: el caso que motivó el bloque ───────────────────────────────

describe('cierre de pago — facturar no es cobrar', () => {
  it('con la factura emitida pero SIN cobrar, no está listo', () => {
    const r = evaluarCierres(ctx({ facturas: [factura()], cobros: [] }));
    expect(r.pago.listo).toBe(false);
    expect(r.pago.faltantes[0]).toContain('A-100');
    expect(r.pago.faltantes[0]).toContain('1,160.00');
  });

  it('con la factura cobrada completa, sí', () => {
    const r = evaluarCierres(ctx({ facturas: [factura()], cobros: [cobro(1160)] }));
    expect(r.pago.listo).toBe(true);
  });

  it('un cobro parcial no cierra', () => {
    const r = evaluarCierres(ctx({ facturas: [factura()], cobros: [cobro(600)] }));
    expect(r.pago.listo).toBe(false);
  });

  it('líneas de ingreso sin facturar lo frenan', () => {
    const r = evaluarCierres(ctx({
      embarque: embarque({ cargos: { detalles: [cargo()], ingresos: 0, gastos: 0, ganancia: 0, moneda: 'MXN' } } as never),
      facturas: [factura()], cobros: [cobro(1160)],
    }));
    expect(r.pago.listo).toBe(false);
    expect(r.pago.faltantes[0]).toContain('sin facturar');
  });

  it('sin ninguna factura registrada no se da por cobrado', () => {
    expect(evaluarCierres(ctx()).pago.listo).toBe(false);
  });

  it('una factura cancelada no exige cobro', () => {
    const r = evaluarCierres(ctx({
      facturas: [factura({ estado: 'cancelada' }), factura({ id: 'F2', numero: 'A-101', total: 500 })],
      cobros: [cobro(500, { facturaId: 'F2' })],
    }));
    expect(r.pago.listo).toBe(true);
  });
});

// ─── C · Administrativo ──────────────────────────────────────────────────────

describe('cierre administrativo — todos los proveedores pagados', () => {
  it('con órdenes vivas, no está listo y las nombra', () => {
    const r = evaluarCierres(ctx({ ordenes: [orden({ folio: 'OC-2026-0007' })] }));
    expect(r.administrativo.listo).toBe(false);
    expect(r.administrativo.faltantes[0]).toContain('OC-2026-0007');
  });

  it('con todas pagadas, sí', () => {
    const r = evaluarCierres(ctx({ ordenes: [orden({ estado: 'pagada' })] }));
    expect(r.administrativo.listo).toBe(true);
  });

  it('una orden RECHAZADA no impide cerrar: ese gasto no se va a pagar', () => {
    const r = evaluarCierres(ctx({ ordenes: [orden({ estado: 'rechazada' })] }));
    expect(r.administrativo.listo).toBe(true);
  });

  it('un gasto sin orden es un proveedor al que nadie le pidió el pago', () => {
    const r = evaluarCierres(ctx({
      embarque: embarque({ cargos: { detalles: [cargo({ tipo: 'gasto', ordenCompraId: null })], ingresos: 0, gastos: 0, ganancia: 0, moneda: 'MXN' } } as never),
    }));
    expect(r.administrativo.listo).toBe(false);
    expect(r.administrativo.faltantes.join(' ')).toContain('sin orden de compra');
  });
});

// ─── D · Discrepancias y orden ───────────────────────────────────────────────

describe('lo marcado contra lo que dicen los datos', () => {
  it('marcar «pago» con la factura sin cobrar produce una discrepancia', () => {
    const r = evaluarCierres(ctx({
      embarque: embarque({ cierres: { operativo: true, pago: true, administrativo: false } }),
      facturas: [factura()], cobros: [],
    }));
    expect(r.discrepancias.map(d => d.cierre)).toContain('pago');
    expect(r.discrepancias[0].detalle).toContain('A-100');
  });

  it('sin nada marcado no hay discrepancias que reportar', () => {
    expect(evaluarCierres(ctx()).discrepancias).toEqual([]);
  });

  it('el cierre no se desmarca solo: se señala', () => {
    const e = embarque({ cierres: { operativo: false, pago: true, administrativo: false } });
    const r = evaluarCierres(ctx({ embarque: e, facturas: [factura()] }));
    expect(e.cierres.pago).toBe(true);
    expect(r.discrepancias.length).toBeGreaterThan(0);
  });

  it('avisa cuando se cierra fuera del orden §4.7', () => {
    expect(avisoDeOrden('pago', { operativo: false, pago: false, administrativo: false }))
      .toContain('operativo');
    expect(avisoDeOrden('administrativo', { operativo: true, pago: false, administrativo: false }))
      .toContain('sin que el cliente haya pagado');
    expect(avisoDeOrden('operativo', { operativo: false, pago: false, administrativo: false }))
      .toBeNull();
  });
});
