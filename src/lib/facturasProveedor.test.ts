/**
 * facturasProveedor.test.ts (tarea 58)
 *
 * Lo que protegen: el caso de IDAMEX. Julio vio al mismo proveedor dos veces
 * en Cuentas por pagar y lo que hay detrás es UNA factura repartida en varias
 * órdenes. Quien ve dos renglones programa dos pagos; el proveedor cobra una
 * vez y el segundo se va de más.
 */

import { describe, it, expect } from 'vitest';
import {
  facturasPorProveedor, identificarFactura, normalizarNumeroFactura, ordenesAgrupadas,
} from './facturasProveedor';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';

function oc(p: Partial<OrdenCompra> & { id: string }): OrdenCompra {
  return {
    folio: `OC-2026-${p.id}`, origen: 'oficina',
    proveedorId: 'PRV-IDAMEX', proveedorNombre: 'IDAMEX',
    conceptoId: 'CON-001', conceptoNombre: 'Maniobras',
    monto: 1000, moneda: 'MXN', estado: 'autorizada', activo: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    fechaSugeridaPago: '2026-10-05',
    ...p,
  } as OrdenCompra;
}

// ─── A · El caso de IDAMEX ───────────────────────────────────────────────────

describe('A · el duplicado que Julio vio', () => {
  /*
   * El caso reproducido en emulador: tres órdenes de IDAMEX, dos de ellas
   * cubiertas por la MISMA factura con fechas de pago distintas. La bandeja
   * mostraba tres renglones; las facturas son dos.
   */
  const caso = [
    oc({ id: 'A', folio: 'OC-2026-0581', monto: 12000, moneda: 'MXN', facturaAsociada: 'F-IDA-1201', fechaSugeridaPago: '2026-10-02' }),
    oc({ id: 'B', folio: 'OC-2026-0582', monto: 6500,  moneda: 'MXN', facturaAsociada: 'F-IDA-1201', fechaSugeridaPago: '2026-10-05' }),
    oc({ id: 'C', folio: 'OC-2026-0583', monto: 900,   moneda: 'USD', facturaAsociada: 'F-IDA-1310' }),
  ];

  it('IDAMEX aparece UNA sola vez', () => {
    const r = facturasPorProveedor(caso);
    expect(r).toHaveLength(1);
    expect(r[0].proveedorNombre).toBe('IDAMEX');
  });

  it('las tres órdenes son DOS facturas', () => {
    const [idamex] = facturasPorProveedor(caso);
    expect(idamex.facturas.map(f => f.numero)).toEqual(['F-IDA-1201', 'F-IDA-1310']);
    expect(idamex.totalOrdenes).toBe(3);
  });

  it('la factura que cubre dos órdenes trae las dos, con sus folios', () => {
    const [idamex] = facturasPorProveedor(caso);
    const f1201 = idamex.facturas.find(f => f.numero === 'F-IDA-1201')!;
    expect(f1201.ordenes).toHaveLength(2);
    expect(f1201.folios).toEqual(['OC-2026-0581', 'OC-2026-0582']);
  });

  it('el total de la factura es la suma de sus órdenes, por moneda', () => {
    const [idamex] = facturasPorProveedor(caso);
    const f1201 = idamex.facturas.find(f => f.numero === 'F-IDA-1201')!;
    expect(f1201.totales.MXN).toBe(18500);
    expect(f1201.totales.USD).toBe(0);
    expect(f1201.monedas).toEqual(['MXN']);
  });

  it('el total del proveedor NO revuelve monedas (§4.3)', () => {
    const [idamex] = facturasPorProveedor(caso);
    expect(idamex.totales).toEqual({ MXN: 18500, USD: 900 });
    expect(idamex.monedas).toEqual(['USD', 'MXN']);
  });

  it('se dice cuántos renglones ahorró el agrupado', () => {
    expect(ordenesAgrupadas(facturasPorProveedor(caso))).toBe(1);
  });

  it('manda la fecha de pago más próxima, y se avisa que no coinciden', () => {
    const [idamex] = facturasPorProveedor(caso);
    const f1201 = idamex.facturas.find(f => f.numero === 'F-IDA-1201')!;
    expect(f1201.fechaPago).toBe('2026-10-02');
    expect(f1201.fechasDistintas).toBe(true);
  });
});

// ─── B · Qué identifica a una factura ───────────────────────────────────────

describe('B · identificar la factura', () => {
  it('el UUID del CFDI manda sobre cualquier número tecleado', () => {
    const r = identificarFactura(oc({ id: 'X', facturaUUID: 'ABC-123', facturaAsociada: 'F-1' }));
    expect(r.fuente).toBe('uuid');
    expect(r.clave).toBe('uuid:abc-123');
    // El número que se enseña sigue siendo el legible: el folio fiscal no le
    // dice nada a nadie.
    expect(r.numero).toBe('F-1');
  });

  it('sin UUID manda lo que leyó el clasificador', () => {
    const r = identificarFactura(oc({
      id: 'X',
      facturaDatos: { numero: 'A-900', fecha: '2026-10-01', emisor: 'IDAMEX', total: 10, moneda: 'MXN', documentoId: 'd1', cotejo: 'coincide' },
      facturaAsociada: 'otra cosa',
    }));
    expect(r.fuente).toBe('clasificador');
    expect(r.numero).toBe('A-900');
  });

  it('dos órdenes con el MISMO UUID son una factura aunque el número difiera', () => {
    const [p] = facturasPorProveedor([
      oc({ id: 'A', facturaUUID: 'uuid-1', facturaAsociada: 'F-1' }),
      oc({ id: 'B', facturaUUID: 'UUID-1', facturaAsociada: 'F-1 (bis)' }),
    ]);
    expect(p.facturas).toHaveLength(1);
    expect(p.facturas[0].ordenes).toHaveLength(2);
  });

  it('el número se compara sin guiones, espacios ni mayúsculas', () => {
    expect(normalizarNumeroFactura(' f-ida 1201 ')).toBe(normalizarNumeroFactura('F_IDA.1201'));
    const [p] = facturasPorProveedor([
      oc({ id: 'A', facturaAsociada: 'F-IDA-1201' }),
      oc({ id: 'B', facturaAsociada: 'f ida 1201' }),
    ]);
    expect(p.facturas).toHaveLength(1);
  });

  it('el mismo número en DOS proveedores son dos facturas', () => {
    const r = facturasPorProveedor([
      oc({ id: 'A', facturaAsociada: 'A-001' }),
      oc({ id: 'B', proveedorId: 'PRV-OTRO', proveedorNombre: 'Oñate', facturaAsociada: 'A-001' }),
    ]);
    expect(r).toHaveLength(2);
    expect(r.map(p => p.proveedorNombre)).toEqual(['IDAMEX', 'Oñate']);
  });

  it('una orden SIN factura es su propio renglón: no se junta con las otras sueltas', () => {
    const [p] = facturasPorProveedor([
      oc({ id: 'A', facturaAsociada: null }),
      oc({ id: 'B', facturaAsociada: null }),
      oc({ id: 'C', facturaAsociada: 'F-9' }),
    ]);
    expect(p.facturas).toHaveLength(3);
    const sueltas = p.facturas.filter(f => f.fuente === 'sin_factura');
    expect(sueltas).toHaveLength(2);
    expect(sueltas.every(f => f.numero === null)).toBe(true);
  });

  it('una referencia de puros espacios cuenta como sin factura', () => {
    const [p] = facturasPorProveedor([
      oc({ id: 'A', facturaAsociada: '   ' }),
      oc({ id: 'B', facturaAsociada: '' }),
    ]);
    expect(p.facturas).toHaveLength(2);
    expect(p.facturas.every(f => f.fuente === 'sin_factura')).toBe(true);
  });
});

// ─── C · Lo que se deriva del conjunto ──────────────────────────────────────

describe('C · estado, monedas y bajas', () => {
  it('la factura toma el estado MENOS avanzado de sus órdenes', () => {
    const [p] = facturasPorProveedor([
      oc({ id: 'A', facturaAsociada: 'F-1', estado: 'pagada' }),
      oc({ id: 'B', facturaAsociada: 'F-1', estado: 'en_gestion' }),
      oc({ id: 'C', facturaAsociada: 'F-1', estado: 'autorizada' }),
    ]);
    expect(p.facturas[0].estado).toBe('en_gestion');
  });

  it('una orden rechazada no suma ni decide el estado', () => {
    const [p] = facturasPorProveedor([
      oc({ id: 'A', facturaAsociada: 'F-1', estado: 'autorizada', monto: 1000 }),
      oc({ id: 'B', facturaAsociada: 'F-1', estado: 'rechazada', monto: 9999 }),
    ]);
    expect(p.facturas[0].totales.MXN).toBe(1000);
    expect(p.facturas[0].estado).toBe('autorizada');
  });

  it('si TODAS se rechazaron, la factura está rechazada', () => {
    const [p] = facturasPorProveedor([
      oc({ id: 'A', facturaAsociada: 'F-1', estado: 'rechazada' }),
    ]);
    expect(p.facturas[0].estado).toBe('rechazada');
    expect(p.facturas[0].totales).toEqual({ USD: 0, MXN: 0 });
  });

  it('una factura con órdenes en dos monedas se marca, y no se revuelve el total', () => {
    const [p] = facturasPorProveedor([
      oc({ id: 'A', facturaAsociada: 'F-1', monto: 1000, moneda: 'MXN' }),
      oc({ id: 'B', facturaAsociada: 'F-1', monto: 100, moneda: 'USD' }),
    ]);
    expect(p.facturas[0].monedasMezcladas).toBe(true);
    expect(p.facturas[0].totales).toEqual({ MXN: 1000, USD: 100 });
  });

  it('las órdenes dadas de baja no entran', () => {
    const r = facturasPorProveedor([
      oc({ id: 'A', facturaAsociada: 'F-1', activo: false }),
    ]);
    expect(r).toHaveLength(0);
  });

  it('«No pagar» en una orden marca toda la factura', () => {
    const [p] = facturasPorProveedor([
      oc({ id: 'A', facturaAsociada: 'F-1' }),
      oc({ id: 'B', facturaAsociada: 'F-1', noPagar: true }),
    ]);
    expect(p.facturas[0].noPagar).toBe(true);
  });

  it('sin órdenes no truena', () => {
    expect(facturasPorProveedor([])).toEqual([]);
    expect(ordenesAgrupadas([])).toBe(0);
  });
});
