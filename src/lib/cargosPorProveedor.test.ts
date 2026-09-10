/**
 * Tests de cargosPorProveedor.ts (3.1).
 *
 * El invariante que importa: agrupar por proveedor es GIRAR la tabla, no
 * cambiar los números. La suma de ventas por proveedor es la venta total,
 * y la de costos, el costo total — por moneda.
 */

import { describe, it, expect } from 'vitest';
import {
  desdeLineas, desdeCargos, consolidarPorProveedor, estadoDelProveedor, totalComoPorMoneda,
} from './cargosPorProveedor';
import type { LineaPlana } from './lineasCotizacion';
import type { CargoDetalle } from '../components/shipments/EmbarquesData';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const linea = (over: Partial<LineaPlana>): LineaPlana => ({
  id: 'l', servicioId: 's1', servicioTipo: 'maritimo', origen: 'concepto', concepto: 'X',
  proveedorNombre: '', costo: 0, profit: 0, venta: 0, margen: 0, orden: 0, moneda: 'USD',
  costoDerivado: false, tarifasCount: 0, costos: [], costoCapturado: true,
  ...over,
} as LineaPlana);

const comp = (id: string, proveedorId: string | null, proveedorNombre: string, monto: number, moneda: 'USD' | 'MXN' = 'USD') =>
  ({ id, tipo: 'tarifa' as const, descripcion: '', proveedorId, proveedorNombre, monto, moneda });

/** Hapag: flete 1,500 + THC 200 + documentación 100. Terminal: maniobras 220. */
const LINEAS: LineaPlana[] = [
  linea({ id: 'flete', concepto: 'Flete marítimo', orden: 0, costo: 1500, profit: 300, venta: 1800, costos: [comp('c1', 'PRV-HAPAG', 'Hapag-Lloyd', 1500)] }),
  linea({ id: 'thc', concepto: 'THC origen', orden: 1, costo: 200, profit: 50, venta: 250, costos: [comp('c2', 'PRV-HAPAG', 'Hapag-Lloyd', 200)] }),
  linea({ id: 'doc', concepto: 'Documentación', orden: 2, costo: 100, profit: 25, venta: 125, costos: [comp('c3', 'PRV-HAPAG', 'Hapag-Lloyd', 100)] }),
  linea({ id: 'man', concepto: 'Maniobras descarga', orden: 3, costo: 220, profit: 80, venta: 300, costos: [comp('c4', 'PRV-TERM', 'Terminal Manzanillo', 220)] }),
];

describe('la cotización, agrupada por proveedor (el ejemplo del cliente)', () => {
  const c = consolidarPorProveedor(desdeLineas(LINEAS));

  it('un grupo por proveedor, en orden de aparición, con sus conceptos', () => {
    expect(c.grupos.map(g => g.proveedorNombre)).toEqual(['Hapag-Lloyd', 'Terminal Manzanillo']);
    expect(c.grupos[0].renglones.map(r => r.concepto)).toEqual(['Flete marítimo', 'THC origen', 'Documentación']);
  });

  it('Total Hapag-Lloyd: 1,800 · 375 · 2,175 · 17.2%', () => {
    const t = c.grupos[0].totales.USD;
    expect(t.costo).toBe(1800);
    expect(t.profit).toBe(375);
    expect(t.venta).toBe(2175);
    expect((t.margen! * 100).toFixed(1)).toBe('17.2');
  });

  it('Total Terminal Manzanillo: 220 · 80 · 300 · 26.7%', () => {
    const t = c.grupos[1].totales.USD;
    expect(t).toMatchObject({ costo: 220, profit: 80, venta: 300 });
    expect((t.margen! * 100).toFixed(1)).toBe('26.7');
  });

  it('INVARIANTE: girar la tabla no cambia los totales', () => {
    expect(c.totalGeneral.USD).toMatchObject({ costo: 2020, profit: 455, venta: 2475 });
    expect(totalComoPorMoneda(c.totalGeneral, 'venta')).toEqual({ USD: 2475, MXN: 0 });
    expect(c.monedasActivas).toEqual(['USD']);
  });

  it('cada renglón trae costo, profit, venta y margen como en la tabla de Pricing', () => {
    const r = c.grupos[0].renglones[0];
    expect(r).toMatchObject({ costo: 1500, venta: 1800, profit: 300, compartido: false, participacion: 1 });
    expect((r.margen! * 100).toFixed(1)).toBe('16.7');
  });
});

describe('carga dividida: la venta se reparte proporcional al costo', () => {
  const dividida = linea({
    id: 'man', concepto: 'Maniobras', orden: 0, costo: 300, profit: 100, venta: 400,
    costos: [comp('a', 'PRV-A', 'Terminal A', 200), comp('b', 'PRV-B', 'Terminal B', 100)],
  });
  const c = consolidarPorProveedor(desdeLineas([dividida]));

  it('A se lleva 2/3 de la venta y B 1/3; los dos marcados «compartido»', () => {
    const a = c.grupos.find(g => g.proveedorId === 'PRV-A')!.renglones[0];
    const b = c.grupos.find(g => g.proveedorId === 'PRV-B')!.renglones[0];
    expect(a.venta).toBe(266.67);
    expect(b.venta).toBe(133.33);
    expect(a.compartido && b.compartido).toBe(true);
    expect(a.participacion).toBe(0.6667);
    // Ninguno queda en pérdida por el reparto
    expect(a.profit).toBe(66.67);
    expect(b.profit).toBe(33.33);
  });

  it('las partes suman exactamente la venta (el último se lleva el residuo)', () => {
    expect(c.totalGeneral.USD.venta).toBe(400);
    expect(c.totalGeneral.USD.costo).toBe(300);
    expect(c.totalGeneral.USD.profit).toBe(100);
  });

  it('el tooltip muestra el cálculo', () => {
    const a = c.grupos[0].renglones[0];
    expect(a.detalleReparto).toContain('66.7%');
    expect(a.detalleReparto).toContain('200.00 de 300.00');
  });
});

describe('§4.3 · monedas', () => {
  it('venta en MXN y costo en USD: el profit del renglón no se resta, y el grupo lo dice', () => {
    const l = linea({ id: 'x', concepto: 'Flete', orden: 0, costo: 1000, venta: 20000, moneda: 'MXN', costos: [comp('c', 'PRV', 'Naviera', 1000, 'USD')] });
    const c = consolidarPorProveedor(desdeLineas([l]));
    const g = c.grupos[0];
    expect(g.renglones[0].profit).toBeNull();
    expect(g.renglones[0].margen).toBeNull();
    expect(g.mezclaMonedas).toBe(true);
    expect(g.totales.USD.costo).toBe(1000);
    expect(g.totales.MXN.venta).toBe(20000);
    expect(g.monedasActivas).toEqual(['USD', 'MXN']);
  });

  it('un proveedor con conceptos en dos monedas tiene un total por cada una', () => {
    const c = consolidarPorProveedor(desdeLineas([
      linea({ id: 'a', concepto: 'Flete', orden: 0, venta: 1800, costos: [comp('1', 'PRV', 'P', 1500, 'USD')] }),
      linea({ id: 'b', concepto: 'Maniobras', orden: 1, venta: 9000, moneda: 'MXN', costos: [comp('2', 'PRV', 'P', 8000, 'MXN')] }),
    ]));
    expect(c.grupos).toHaveLength(1);
    expect(c.grupos[0].totales.USD).toMatchObject({ costo: 1500, venta: 1800, profit: 300 });
    expect(c.grupos[0].totales.MXN).toMatchObject({ costo: 8000, venta: 9000, profit: 1000 });
  });
});

describe('sin proveedor', () => {
  it('un concepto sin costo (cortesía o cargo propio) va al grupo sin proveedor, al final', () => {
    const c = consolidarPorProveedor(desdeLineas([
      linea({ id: 'p', concepto: 'Seguro propio', orden: 0, venta: 100, costos: [] }),
      linea({ id: 'f', concepto: 'Flete', orden: 1, venta: 1800, costos: [comp('1', 'PRV', 'P', 1500)] }),
    ]));
    expect(c.grupos.map(g => g.proveedorId)).toEqual(['PRV', null]);
    expect(c.grupos[1].renglones[0]).toMatchObject({ costo: 0, venta: 100, profit: 100, margen: 1 });
  });

  it('un proveedor que viene solo con nombre (ruta B) agrupa por nombre, no cae en «sin proveedor»', () => {
    const c = consolidarPorProveedor(desdeLineas([
      linea({ id: 'a', concepto: 'Flete', orden: 0, venta: 1800, costos: [comp('1', null, 'Sunway', 1500)] }),
      linea({ id: 'b', concepto: 'THC', orden: 1, venta: 250, costos: [comp('2', null, 'sunway ', 200)] }),
      linea({ id: 'c', concepto: 'Propio', orden: 2, venta: 100, costos: [] }),
    ]));
    expect(c.grupos.map(g => g.proveedorNombre)).toEqual(['Sunway', '']);
    expect(c.grupos[0].renglones).toHaveLength(2);
    expect(c.grupos[1].proveedorId).toBeNull();
  });

  it('un costo tecleado sin proveedor también', () => {
    const c = consolidarPorProveedor(desdeLineas([
      linea({ id: 'f', concepto: 'Flete', orden: 0, venta: 1800, costos: [comp('m', null, '', 1500)] }),
    ]));
    expect(c.grupos[0].proveedorId).toBeNull();
    expect(c.grupos[0].totales.USD.costo).toBe(1500);
  });
});

// ─── El embarque ─────────────────────────────────────────────────────────────

const cargo = (over: Partial<CargoDetalle>): CargoDetalle => ({
  id: 'c', concepto: 'X', tipo: 'gasto', monto: 0, moneda: 'USD', ...over,
});
const origen = (conceptoId: string) => ({ cotizacionId: 'COT-1', servicioId: 's1', conceptoId });

const CARGOS: CargoDetalle[] = [
  cargo({ id: 'ing-flete', concepto: 'Flete marítimo', tipo: 'ingreso', monto: 1800, origenCotizacion: origen('flete') }),
  cargo({ id: 'gas-flete', concepto: 'Flete marítimo', tipo: 'gasto', monto: 1500, proveedorId: 'PRV-HAPAG', origenCotizacion: origen('flete') }),
  cargo({ id: 'ing-thc', concepto: 'THC origen', tipo: 'ingreso', monto: 250, origenCotizacion: origen('thc') }),
  cargo({ id: 'gas-thc', concepto: 'THC origen', tipo: 'gasto', monto: 200, proveedorId: 'PRV-HAPAG', origenCotizacion: origen('thc') }),
  cargo({ id: 'ing-man', concepto: 'Maniobras', tipo: 'ingreso', monto: 300, origenCotizacion: origen('man') }),
  cargo({ id: 'gas-man', concepto: 'Maniobras', tipo: 'gasto', monto: 220, proveedorId: 'PRV-TERM', origenCotizacion: origen('man') }),
  // capturado a mano en el embarque, sin cotización
  cargo({ id: 'gas-extra', concepto: 'Demoras', tipo: 'gasto', monto: 90, proveedorId: 'PRV-TERM' }),
];

describe('el embarque: ingreso y gastos del mismo concepto se juntan', () => {
  const c = consolidarPorProveedor(desdeCargos(CARGOS));

  it('los mismos grupos y totales que en la cotización', () => {
    expect(c.grupos.map(g => g.proveedorId)).toEqual(['PRV-HAPAG', 'PRV-TERM']);
    expect(c.grupos[0].totales.USD).toMatchObject({ costo: 1700, venta: 2050, profit: 350 });
  });

  it('un gasto sin cotización es su propio concepto, con venta cero', () => {
    const term = c.grupos[1];
    expect(term.renglones.map(r => r.concepto)).toEqual(['Maniobras', 'Demoras']);
    expect(term.renglones[1]).toMatchObject({ costo: 90, venta: 0, profit: -90, refId: 'gas-extra' });
  });

  it('cada renglón sabe qué cargo de gasto es (para editar y generar OC)', () => {
    expect(c.grupos[0].renglones[0].refId).toBe('gas-flete');
    expect(c.grupos[0].renglones[0].ingresoRefId).toBe('ing-flete');
  });

  it('INVARIANTE: la venta total es la de los ingresos y el costo el de los gastos', () => {
    expect(c.totalGeneral.USD.venta).toBe(2350);
    expect(c.totalGeneral.USD.costo).toBe(2010);
  });
});

describe('estado del proveedor: el menos avanzado de sus cargos', () => {
  const c = consolidarPorProveedor(desdeCargos(CARGOS));
  const hapag = c.grupos[0];
  const ocs = [{ id: 'OC-1', estado: 'pagada' as const }, { id: 'OC-2', estado: 'autorizada' as const }, { id: 'OC-X', estado: 'rechazada' as const }];

  it('sin nada: sin factura', () => {
    expect(estadoDelProveedor(hapag, CARGOS, ocs)).toBe('sin_factura');
  });

  it('con factura conciliada en todos: facturado', () => {
    const conFactura = CARGOS.map(x => x.tipo === 'gasto' && x.proveedorId === 'PRV-HAPAG' ? { ...x, facturaProveedorId: 'FP-1' } : x);
    expect(estadoDelProveedor(hapag, conFactura, ocs)).toBe('facturado');
  });

  it('con OC en todos: en orden de compra; con OC pagada en todos: pagado', () => {
    const enOC = CARGOS.map(x => x.proveedorId === 'PRV-HAPAG' ? { ...x, ordenCompraId: 'OC-2' } : x);
    expect(estadoDelProveedor(hapag, enOC, ocs)).toBe('en_oc');
    const pagado = CARGOS.map(x => x.proveedorId === 'PRV-HAPAG' ? { ...x, ordenCompraId: 'OC-1' } : x);
    expect(estadoDelProveedor(hapag, pagado, ocs)).toBe('pagado');
  });

  it('si UN cargo está pagado y el otro sin factura, al proveedor le falta algo', () => {
    const mixto = CARGOS.map(x => x.id === 'gas-flete' ? { ...x, ordenCompraId: 'OC-1' } : x);
    expect(estadoDelProveedor(hapag, mixto, ocs)).toBe('sin_factura');
  });

  it('una OC rechazada no cuenta como OC', () => {
    const rechazada = CARGOS.map(x => x.proveedorId === 'PRV-HAPAG' ? { ...x, ordenCompraId: 'OC-X', facturaProveedorId: 'FP-1' } : x);
    expect(estadoDelProveedor(hapag, rechazada, ocs)).toBe('facturado');
  });
});
