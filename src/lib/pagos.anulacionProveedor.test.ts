/**
 * Tarea 80 — anular un pago a proveedor devuelve sus órdenes a «autorizada»
 * por la máquina de estados, todo o nada.
 */
import { describe, it, expect } from 'vitest';
import { construirPagoDeGrupo, planAnulacionProveedor, pagosDeProveedor, type ContextoPago, type Pago } from './pagos';
import { puedeRevertirPagoOC, puedeTransicionarOC, transicionesDisponiblesOC } from './stateMachineOC';
import { aplicarFiltrosPagos, filtrosPagosDesdeVista, filtrosPagosParaVista, FILTROS_PAGOS_VACIOS, motivoNoEditable } from './reversaPagos';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';

const orden = (over: Partial<OrdenCompra> = {}): OrdenCompra => ({
  id: 'oc-1', folio: 'OC-2026-0001', estado: 'pagada',
  proveedorId: 'PRV-1', proveedorNombre: 'IDAMEX',
  monto: 10000, moneda: 'MXN', embarqueId: 'EMB-1',
  bancoSalida: 'santander_gastos', comprobantePago: 'TR-5501', activo: true,
  ...over,
} as unknown as OrdenCompra);

const ctx: ContextoPago = {
  id: 'PAG-X', folio: 'PAG-2026-0042',
  por: { uid: 'u1', nombre: 'Julio' }, ahora: '2026-10-06T10:00:00.000Z',
};

const pagoDe = (ordenes: OrdenCompra[]): Pago =>
  construirPagoDeGrupo(ordenes.map(o => ({ ...o, estado: 'autorizada' as const })), { referencia: 'TR-5501', fecha: '2026-10-06' }, ctx);

describe('puedeRevertirPagoOC (la máquina)', () => {
  it('administracion y admin devuelven una orden pagada', () => {
    expect(puedeRevertirPagoOC('administracion', orden()).ok).toBe(true);
    expect(puedeRevertirPagoOC('admin', orden()).ok).toBe(true);
  });
  it('operaciones, pricing y ventas no', () => {
    for (const rol of ['operaciones', 'pricing', 'ventas'] as const) {
      expect(puedeRevertirPagoOC(rol, orden()).ok).toBe(false);
    }
  });
  it('solo una orden pagada se revierte', () => {
    const r = puedeRevertirPagoOC('admin', orden({ estado: 'autorizada' }));
    expect(r.ok).toBe(false);
    expect(r.razon).toMatch(/autorizada/);
  });
  it('pagada sigue terminal para el flujo normal: ningún rol la ve salir', () => {
    expect(transicionesDisponiblesOC('pagada', 'admin', orden())).toHaveLength(0);
    expect(puedeTransicionarOC('pagada', 'autorizada', 'admin', orden()).ok).toBe(false);
  });
});

describe('planAnulacionProveedor', () => {
  const o1 = orden({ id: 'oc-1' });
  const o2 = orden({ id: 'oc-2', folio: 'OC-2026-0002', monto: 20000 });

  it('caso feliz: un pago de dos órdenes devuelve las dos', () => {
    const plan = planAnulacionProveedor(pagoDe([o1, o2]), [o1, o2], 'administracion');
    expect(plan.problemas).toEqual([]);
    expect(plan.ordenes.map(o => o.id)).toEqual(['oc-1', 'oc-2']);
  });

  it('una orden que no puede regresar detiene TODO y dice cuál y por qué', () => {
    const plan = planAnulacionProveedor(pagoDe([o1, o2]), [o1, { ...o2, estado: 'autorizada' }], 'administracion');
    expect(plan.ordenes).toEqual([]);
    expect(plan.problemas).toHaveLength(1);
    expect(plan.problemas[0]).toContain('OC-2026-0002');
    expect(plan.problemas[0]).toMatch(/solo una orden pagada/);
  });

  it('una orden que ya no existe también detiene todo', () => {
    const plan = planAnulacionProveedor(pagoDe([o1, o2]), [o1], 'admin');
    expect(plan.ordenes).toEqual([]);
    expect(plan.problemas[0]).toContain('OC-2026-0002');
  });

  it('un rol sin permiso no regresa nada', () => {
    const plan = planAnulacionProveedor(pagoDe([o1]), [o1], 'operaciones');
    expect(plan.ordenes).toEqual([]);
    expect(plan.problemas[0]).toMatch(/rol/);
  });

  it('un pago ya anulado, uno de cliente y uno heredado no se anulan por aquí', () => {
    const p = pagoDe([o1]);
    expect(planAnulacionProveedor({ ...p, activo: false }, [o1], 'admin').problemas.join(' ')).toMatch(/ya está anulado/);
    expect(planAnulacionProveedor({ ...p, lado: 'cliente' }, [o1], 'admin').problemas.join(' ')).toMatch(/no es un pago a proveedor/);
    const legacy = pagosDeProveedor([], [o1])[0];
    expect(planAnulacionProveedor(legacy, [o1], 'admin').problemas.join(' ')).toMatch(/registro anterior/);
  });
});

describe('la lista de pagos con los dos lados', () => {
  const prov = pagoDe([orden()]);
  const cli = { ...prov, id: 'PAG-C', folio: 'PAG-2026-0043', lado: 'cliente' as const };

  it('el filtro de lado separa cliente y proveedor; vacío trae los dos', () => {
    const f = (lado: '' | 'cliente' | 'proveedor') => aplicarFiltrosPagos([prov, cli], { ...FILTROS_PAGOS_VACIOS, lado }).map(p => p.id);
    expect(f('')).toHaveLength(2);
    expect(f('cliente')).toEqual(['PAG-C']);
    expect(f('proveedor')).toEqual(['PAG-X']);
  });

  it('el lado viaja en la vista guardada y un valor basura se descarta', () => {
    expect(filtrosPagosDesdeVista(filtrosPagosParaVista({ ...FILTROS_PAGOS_VACIOS, lado: 'proveedor' })).lado).toBe('proveedor');
    expect(filtrosPagosDesdeVista({ lado: 'otro' }).lado).toBe('');
  });

  it('un pago a proveedor no se reaplica ni se le quita una orden', () => {
    expect(motivoNoEditable(prov)).toMatch(/se anula completo/);
  });
});
