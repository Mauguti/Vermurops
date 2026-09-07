/**
 * Tests de anticipos.ts (1.3).
 *
 * El caso que protegen: un transportista cobra 50% adelantado y semanas
 * después manda la factura por el total. Sin el cruce, Vermur paga dos veces
 * la mitad del flete.
 */

import { describe, it, expect } from 'vitest';
import {
  disponibleDeAnticipo, anticiposAplicables, aplicarAnticipo, quitarAnticipo, montoATransferir,
} from './anticipos';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';

const oc = (over: Partial<OrdenCompra> = {}): OrdenCompra => ({
  id: over.id ?? 'oc-1', folio: over.folio ?? 'OC-2026-0001',
  origen: 'embarque', embarqueId: 'EMB-1', embarqueFolio: 'VLIM-0001',
  clienteId: 'CLI-1', clienteNombre: 'Cliente',
  proveedorId: 'PRV-1', proveedorNombre: 'Transportes García',
  conceptoId: 'CON-002', conceptoNombre: 'Inland Freight',
  descripcion: '', monto: 20000, moneda: 'MXN',
  fechaRequerida: '2026-09-15', fechaSugeridaPago: null,
  urgencia: 'normal', estado: 'en_gestion',
  motivoRechazo: null, historialEstados: [],
  solicitadaPor: null, gestionadaPor: null, autorizadaPor: null, pagadaPor: null,
  cuentaBancariaId: null, bancoSalida: null, cuentaSalida: null,
  facturaAsociada: null, comprobantePago: null,
  esAnticipo: false, anticiposCruzados: [], saldoPendiente: null, montoDisponible: null,
  activo: true, createdAt: '', updatedAt: '',
  ...over,
});

const anticipo = (over: Partial<OrdenCompra> = {}) => oc({
  id: 'ant-1', folio: 'OC-2026-0050', esAnticipo: true, estado: 'pagada', monto: 10000,
  pagadaPor: { uid: 'u1', nombre: 'Julio', fecha: '2026-08-20T10:00:00Z' },
  ...over,
});

// ─── A · Lo disponible se deriva ─────────────────────────────────────────────

describe('disponibleDeAnticipo', () => {
  it('sin aplicaciones, está entero', () => {
    const a = anticipo();
    expect(disponibleDeAnticipo(a, [a])).toBe(10000);
  });

  it('descuenta lo aplicado en otras órdenes', () => {
    const a = anticipo();
    const destino = oc({ anticiposCruzados: [
      { ocId: 'ant-1', folio: 'OC-2026-0050', montoAplicado: 4000, moneda: 'MXN', fechaPago: '' },
    ] });
    expect(disponibleDeAnticipo(a, [a, destino])).toBe(6000);
  });

  it('si la orden que lo usó se RECHAZA, el dinero vuelve a estar libre', () => {
    const a = anticipo();
    const rechazada = oc({ estado: 'rechazada', anticiposCruzados: [
      { ocId: 'ant-1', folio: 'OC-2026-0050', montoAplicado: 10000, moneda: 'MXN', fechaPago: '' },
    ] });
    expect(disponibleDeAnticipo(a, [a, rechazada])).toBe(10000);
  });

  it('una OC que no es anticipo no tiene disponible', () => {
    const normal = oc();
    expect(disponibleDeAnticipo(normal, [normal])).toBe(0);
  });
});

// ─── B · Cuáles se pueden cruzar ─────────────────────────────────────────────

describe('anticiposAplicables', () => {
  it('ofrece los del mismo proveedor y moneda, ya pagados', () => {
    const a = anticipo();
    const destino = oc({ id: 'oc-2' });
    expect(anticiposAplicables(destino, [a, destino]).map(x => x.anticipo.id)).toEqual(['ant-1']);
  });

  it('un anticipo NO pagado no se ofrece: no ha entregado dinero', () => {
    const a = anticipo({ estado: 'autorizada' });
    expect(anticiposAplicables(oc({ id: 'oc-2' }), [a])).toEqual([]);
  });

  it('no cruza entre proveedores distintos', () => {
    const a = anticipo({ proveedorId: 'PRV-OTRO' });
    expect(anticiposAplicables(oc({ id: 'oc-2' }), [a])).toEqual([]);
  });

  it('§4.3: no cruza entre monedas distintas', () => {
    const a = anticipo({ moneda: 'USD' });
    expect(anticiposAplicables(oc({ id: 'oc-2', moneda: 'MXN' }), [a])).toEqual([]);
  });

  it('no vuelve a ofrecer uno ya aplicado a esta orden', () => {
    const a = anticipo();
    const destino = oc({ id: 'oc-2', anticiposCruzados: [
      { ocId: 'ant-1', folio: 'OC-2026-0050', montoAplicado: 1000, moneda: 'MXN', fechaPago: '' },
    ] });
    expect(anticiposAplicables(destino, [a, destino])).toEqual([]);
  });

  it('uno agotado no se ofrece', () => {
    const a = anticipo();
    const otra = oc({ id: 'oc-9', anticiposCruzados: [
      { ocId: 'ant-1', folio: 'OC-2026-0050', montoAplicado: 10000, moneda: 'MXN', fechaPago: '' },
    ] });
    expect(anticiposAplicables(oc({ id: 'oc-2' }), [a, otra])).toEqual([]);
  });
});

// ─── C · Aplicar ─────────────────────────────────────────────────────────────

describe('aplicarAnticipo', () => {
  it('el caso real: 50% adelantado, la factura por el total', () => {
    const a = anticipo({ monto: 10000 });
    const factura = oc({ id: 'oc-2', monto: 20000 });
    const r = aplicarAnticipo(factura, a, 10000, [a, factura]);
    expect(r.ok).toBe(true);
    expect(r.cambios?.saldoPendiente).toBe(10000);
    expect(r.cambios?.anticiposCruzados).toHaveLength(1);
  });

  it('no deja aplicar más de lo disponible', () => {
    const a = anticipo({ monto: 10000 });
    const usada = oc({ id: 'oc-9', anticiposCruzados: [
      { ocId: 'ant-1', folio: 'OC-2026-0050', montoAplicado: 7000, moneda: 'MXN', fechaPago: '' },
    ] });
    const r = aplicarAnticipo(oc({ id: 'oc-2' }), a, 5000, [a, usada]);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('3,000');
  });

  it('no deja pagar de más: el saldo a favor no lo rastrea nadie', () => {
    const a = anticipo({ monto: 50000 });
    const chica = oc({ id: 'oc-2', monto: 8000 });
    const r = aplicarAnticipo(chica, a, 20000, [a, chica]);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('saldo a favor');
  });

  it('rechaza anticipo no pagado, de otro proveedor, o en otra moneda', () => {
    const destino = oc({ id: 'oc-2' });
    expect(aplicarAnticipo(destino, anticipo({ estado: 'autorizada' }), 100, []).ok).toBe(false);
    expect(aplicarAnticipo(destino, anticipo({ proveedorId: 'X' }), 100, []).ok).toBe(false);
    expect(aplicarAnticipo(destino, anticipo({ moneda: 'USD' }), 100, []).ok).toBe(false);
  });

  it('dos anticipos parciales se acumulan sobre la misma orden', () => {
    const a1 = anticipo({ id: 'ant-1', folio: 'OC-2026-0050', monto: 6000 });
    const a2 = anticipo({ id: 'ant-2', folio: 'OC-2026-0051', monto: 4000 });
    const factura = oc({ id: 'oc-2', monto: 20000 });
    const r1 = aplicarAnticipo(factura, a1, 6000, [a1, a2, factura]);
    const conUno = { ...factura, ...r1.cambios! };
    const r2 = aplicarAnticipo(conUno, a2, 4000, [a1, a2, conUno]);
    expect(r2.cambios?.saldoPendiente).toBe(10000);
    expect(r2.cambios?.anticiposCruzados).toHaveLength(2);
  });
});

// ─── D · Quitar y transferir ─────────────────────────────────────────────────

describe('quitar y el monto a transferir', () => {
  it('quitar devuelve el saldo a null cuando no queda ninguno', () => {
    const conUno = oc({ anticiposCruzados: [
      { ocId: 'ant-1', folio: 'OC-2026-0050', montoAplicado: 5000, moneda: 'MXN', fechaPago: '' },
    ], saldoPendiente: 15000 });
    expect(quitarAnticipo(conUno, 'ant-1').saldoPendiente).toBeNull();
  });

  it('lo que se transfiere es el monto menos lo adelantado', () => {
    expect(montoATransferir(oc({ monto: 20000 }))).toBe(20000);
    expect(montoATransferir(oc({ monto: 20000, anticiposCruzados: [
      { ocId: 'a', folio: 'F', montoAplicado: 12000, moneda: 'MXN', fechaPago: '' },
    ] }))).toBe(8000);
  });
});
