import { describe, it, expect } from 'vitest';
import {
  conceptosDeFactura, similitudNombre, proponerEmparejamiento, resolverConciliacion,
  marcarCargosConFactura, cargosPendientesDe, ocParaPrecargar,
} from './conciliacionFactura';
import type { CargoDetalle } from '../components/shipments/EmbarquesData';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';

const gasto = (id: string, concepto: string, monto: number, over: Partial<CargoDetalle> = {}): CargoDetalle =>
  ({ id, concepto, tipo: 'gasto', monto, moneda: 'USD', proveedorId: 'PRV-HAPAG', ...over });

const CARGOS = [
  gasto('g1', 'Flete marítimo', 1500),
  gasto('g2', 'THC origen', 200),
  gasto('g3', 'Documentación', 100),
  gasto('g4', 'Maniobras descarga', 220, { proveedorId: 'PRV-TERM' }),
  { id: 'i1', concepto: 'Flete marítimo', tipo: 'ingreso', monto: 1800, moneda: 'USD' } as CargoDetalle,
];

describe('conceptosDeFactura acepta las dos formas del clasificador', () => {
  it('strings: solo descripción, sin monto', () => {
    const c = conceptosDeFactura({ conceptos: ['Ocean freight', ' THC '], moneda: 'usd' });
    expect(c).toEqual([
      { id: 'cf-0', descripcion: 'Ocean freight', monto: null, moneda: 'USD' },
      { id: 'cf-1', descripcion: 'THC', monto: null, moneda: 'USD' },
    ]);
  });
  it('objetos: descripción y monto, con montos como texto', () => {
    const c = conceptosDeFactura({ conceptos: [{ descripcion: 'Ocean freight', monto: 1500 }, { concepto: 'THC', importe: '200.00', moneda: 'usd' }, { nombre: '' }], moneda: 'USD' });
    expect(c.map(x => [x.descripcion, x.monto])).toEqual([['Ocean freight', 1500], ['THC', 200]]);
  });
});

describe('emparejamiento propuesto por nombre y monto', () => {
  const pendientes = cargosPendientesDe(CARGOS, 'PRV-HAPAG');

  it('solo los gastos del proveedor sin factura', () => {
    expect(pendientes.map(g => g.id)).toEqual(['g1', 'g2', 'g3']);
  });

  it('monto y nombre → seguro; un cargo no se propone dos veces', () => {
    const conceptos = conceptosDeFactura({ conceptos: [
      { descripcion: 'Flete marítimo Shanghai-Manzanillo', monto: 1500 },
      { descripcion: 'THC en origen', monto: 200 },
      { descripcion: 'Gastos de documentación', monto: 100 },
    ] });
    const e = proponerEmparejamiento(conceptos, pendientes);
    expect(e.map(x => [x.cargoId, x.motivo])).toEqual([['g1', 'monto_y_nombre'], ['g2', 'monto_y_nombre'], ['g3', 'monto_y_nombre']]);
  });

  it('sin montos empareja por nombre; con montos distintos y nombre igual, por nombre (a revisar)', () => {
    const c1 = conceptosDeFactura({ conceptos: ['Flete marítimo', 'Documentación'] });
    expect(proponerEmparejamiento(c1, pendientes).map(x => x.cargoId)).toEqual(['g1', 'g3']);
    const c2 = conceptosDeFactura({ conceptos: [{ descripcion: 'Flete marítimo', monto: 1650 }] });
    expect(proponerEmparejamiento(c2, pendientes)[0]).toMatchObject({ cargoId: 'g1', motivo: 'nombre' });
  });

  it('nombre en otro idioma pero monto exacto → por monto (a revisar); nada que encaje → sin propuesta', () => {
    const c = conceptosDeFactura({ conceptos: [{ descripcion: 'Ocean freight', monto: 1500 }, { descripcion: 'Seal fee', monto: 35 }] });
    const e = proponerEmparejamiento(c, pendientes);
    expect(e[0]).toMatchObject({ cargoId: 'g1', motivo: 'monto' });
    expect(e[1]).toMatchObject({ cargoId: null, motivo: null });
  });

  it('similitud tolera acentos, mayúsculas y palabras vacías', () => {
    expect(similitudNombre('Maniobras de descarga', 'MANIOBRAS DESCARGA')).toBe(1);
    expect(similitudNombre('Flete', 'THC')).toBe(0);
  });
});

describe('resolver y marcar', () => {
  const pendientes = cargosPendientesDe(CARGOS, 'PRV-HAPAG');
  const conceptos = conceptosDeFactura({ conceptos: [{ descripcion: 'Flete marítimo', monto: 1500 }, { descripcion: 'THC origen', monto: 200 }], total: 1700, moneda: 'USD' });
  const emp = proponerEmparejamiento(conceptos, pendientes);

  it('por concepto: solo los emparejados; el total cuadra', () => {
    const r = resolverConciliacion('por_concepto', conceptos, emp, pendientes, { total: 1700, moneda: 'USD' });
    expect(r.cargoIds).toEqual(['g1', 'g2']);
    expect(r.aplicado).toBe(1700);
    expect(r.avisos).toEqual([]);
  });

  it('completa: todos los pendientes del proveedor, y avisa si el total no cuadra', () => {
    const r = resolverConciliacion('completa', conceptos, emp, pendientes, { total: 1700, moneda: 'USD' });
    expect(r.cargoIds).toEqual(['g1', 'g2', 'g3']);
    expect(r.aplicado).toBe(1800);
    expect(r.avisos[0]).toContain('1,700.00');
    expect(r.avisos[0]).toContain('1,800.00');
  });

  it('un concepto sin cargo se reporta; sin cargos ligados se avisa', () => {
    const c = conceptosDeFactura({ conceptos: ['Seal fee'] });
    const r = resolverConciliacion('por_concepto', c, proponerEmparejamiento(c, pendientes), pendientes, { total: null, moneda: 'USD' });
    expect(r.conceptosSinCargo).toHaveLength(1);
    expect(r.cargoIds).toEqual([]);
    expect(r.avisos.some(a => /ningún cargo/.test(a))).toBe(true);
  });

  it('§4.3: cargos en dos monedas se avisan y solo suma la de la factura', () => {
    const mixtos = [gasto('a', 'Flete', 1500), gasto('b', 'Maniobras', 8000, { moneda: 'MXN' })];
    const r = resolverConciliacion('completa', [], [], mixtos, { total: 1500, moneda: 'USD' });
    expect(r.aplicado).toBe(1500);
    expect(r.avisos.some(a => /mezclan/.test(a))).toBe(true);
  });

  it('marcar deja facturaProveedorId solo en los elegidos', () => {
    const m = marcarCargosConFactura(CARGOS, ['g1', 'g2'], 'doc-F');
    expect(m.filter(c => c.facturaProveedorId === 'doc-F').map(c => c.id)).toEqual(['g1', 'g2']);
    expect(cargosPendientesDe(m, 'PRV-HAPAG').map(c => c.id)).toEqual(['g3']);
  });
});

describe('ocParaPrecargar', () => {
  const oc = (id: string, over: Partial<OrdenCompra>): OrdenCompra =>
    ({ id, folio: id, embarqueId: 'E1', proveedorId: 'PRV-HAPAG', estado: 'en_gestion', activo: true, ...over } as OrdenCompra);
  it('la primera del proveedor en el embarque sin factura; ninguna si todas la tienen', () => {
    expect(ocParaPrecargar([oc('OC-1', { facturaDatos: { numero: 'x' } as never }), oc('OC-2', {})], 'E1', 'PRV-HAPAG')?.id).toBe('OC-2');
    expect(ocParaPrecargar([oc('OC-1', { facturaDatos: { numero: 'x' } as never })], 'E1', 'PRV-HAPAG')).toBeNull();
    expect(ocParaPrecargar([oc('OC-3', { estado: 'rechazada' })], 'E1', 'PRV-HAPAG')).toBeNull();
    expect(ocParaPrecargar([oc('OC-4', { proveedorId: 'OTRO' })], 'E1', 'PRV-HAPAG')).toBeNull();
  });
});
