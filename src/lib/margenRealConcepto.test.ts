import { describe, it, expect } from 'vitest';
import type { CargoDetalle } from '../components/shipments/EmbarquesData';
import { agruparCargos } from './cargosEditables';
import {
  costoDeCargo, margenDelConcepto, margenDelEmbarque, estadoMenosFirme,
  type OCParaMargen, type ContextoMargen,
} from './margenRealConcepto';

// ─── Utilería ─────────────────────────────────────────────────────────────────

const ingreso = (over: Partial<CargoDetalle> = {}): CargoDetalle => ({
  id: 'ing-1', concepto: 'Ocean Freight', tipo: 'ingreso', monto: 1800, moneda: 'USD',
  origen: 'heredado', origenCotizacion: { cotizacionId: 'COT-1', servicioId: 'S1', conceptoId: 'CON-001' },
  ...over,
});

const gasto = (over: Partial<CargoDetalle> = {}): CargoDetalle => ({
  id: 'gas-1', concepto: 'Ocean Freight', tipo: 'gasto', monto: 1500, moneda: 'USD',
  proveedorId: 'PRV-1', origen: 'heredado',
  origenCotizacion: { cotizacionId: 'COT-1', servicioId: 'S1', conceptoId: 'CON-001' },
  ...over,
});

const oc = (over: Partial<OCParaMargen> = {}): OCParaMargen => ({
  id: 'OC-1', estado: 'solicitada', monto: 1500, moneda: 'USD', facturaDatos: null, ...over,
});

const ctxDe = (cargos: CargoDetalle[], ordenes: OCParaMargen[] = [], tipoCambio?: number): ContextoMargen => ({
  ordenes: new Map(ordenes.map(o => [o.id, o])),
  cargos,
  tipoCambio,
});

// ─── A · De dónde sale el costo de un cargo ───────────────────────────────────

describe('costoDeCargo', () => {
  it('sin OC y sin corrección: estimado, el costo es el cotizado', () => {
    const c = gasto();
    const r = costoDeCargo(c, ctxDe([c]));
    expect(r.estado).toBe('estimado');
    expect(r.costo).toBe(1500);
    expect(r.cotizado).toBe(1500);
    expect(r.excedente).toBe(0);
    expect(r.sinComparar).toBeNull();
  });

  it('OC generada pero sin pagar ni facturar: sigue estimado', () => {
    const c = gasto({ ordenCompraId: 'OC-1' });
    const r = costoDeCargo(c, ctxDe([c], [oc()]));
    expect(r.estado).toBe('estimado');
    expect(r.costo).toBe(1500);
  });

  it('el cargo corregido a mano, sin factura, cuenta como facturado', () => {
    const c = gasto({ monto: 1650, montoHeredado: 1500 });
    const r = costoDeCargo(c, ctxDe([c]));
    expect(r.estado).toBe('facturado');
    expect(r.cotizado).toBe(1500);
    expect(r.costo).toBe(1650);
    expect(r.excedente).toBe(150);
  });

  it('facturado por el mismo importe: sin excedente', () => {
    const c = gasto({ ordenCompraId: 'OC-1', facturaProveedorId: 'FAC-1' });
    const r = costoDeCargo(c, ctxDe([c], [oc({
      facturaDatos: { total: 1740, subtotal: 1500, moneda: 'USD' },
    })]));
    expect(r.estado).toBe('facturado');
    expect(r.costo).toBe(1500);
    expect(r.excedente).toBe(0);
    expect(r.sinComparar).toBeNull();
  });

  it('facturado por MÁS de lo cotizado: excedente positivo', () => {
    const c = gasto({ ordenCompraId: 'OC-1', facturaProveedorId: 'FAC-1' });
    const r = costoDeCargo(c, ctxDe([c], [oc({
      facturaDatos: { total: 1972, subtotal: 1700, moneda: 'USD' },
    })]));
    expect(r.estado).toBe('facturado');
    expect(r.costo).toBe(1700);
    expect(r.excedente).toBe(200);
  });

  it('factura con solo total (trae IVA): no se compara y cae al cargo corregido', () => {
    const c = gasto({ monto: 1600, montoHeredado: 1500, ordenCompraId: 'OC-1', facturaProveedorId: 'FAC-1' });
    const r = costoDeCargo(c, ctxDe([c], [oc({
      facturaDatos: { total: 1740, moneda: 'USD' },
    })]));
    expect(r.sinComparar).toBe('factura_con_iva');
    expect(r.estado).toBe('facturado');
    expect(r.costo).toBe(1600);       // el cargo corregido, no el total con IVA
    expect(r.excedente).toBe(0);      // no se compara: no se inventa excedente
  });

  it('factura con solo total y SIN corrección: facturado, sin comparar, costo estimado', () => {
    const c = gasto({ ordenCompraId: 'OC-1', facturaProveedorId: 'FAC-1' });
    const r = costoDeCargo(c, ctxDe([c], [oc({
      facturaDatos: { total: 1740, moneda: 'USD' },
    })]));
    expect(r.sinComparar).toBe('factura_con_iva');
    expect(r.estado).toBe('facturado');
    expect(r.costo).toBe(1500);
    expect(r.excedente).toBe(0);
  });

  it('una factura ligada a DOS órdenes: no se le carga su total a un concepto', () => {
    const a = gasto({ id: 'gas-a', ordenCompraId: 'OC-1', facturaProveedorId: 'FAC-1' });
    const b = gasto({ id: 'gas-b', concepto: 'Documentation', monto: 200, ordenCompraId: 'OC-2', facturaProveedorId: 'FAC-1' });
    const ordenes = [
      oc({ id: 'OC-1', facturaDatos: { total: 1972, subtotal: 1700, moneda: 'USD' } }),
      oc({ id: 'OC-2', monto: 200, facturaDatos: { total: 1972, subtotal: 1700, moneda: 'USD' } }),
    ];
    const r = costoDeCargo(a, ctxDe([a, b], ordenes));
    expect(r.sinComparar).toBe('factura_compartida');
    expect(r.costo).toBe(1500);
    expect(r.excedente).toBe(0);
  });

  it('la misma factura en UNA sola orden sí se usa', () => {
    const a = gasto({ ordenCompraId: 'OC-1', facturaProveedorId: 'FAC-1' });
    const r = costoDeCargo(a, ctxDe([a], [oc({
      facturaDatos: { total: 1972, subtotal: 1700, moneda: 'USD' },
    })]));
    expect(r.sinComparar).toBeNull();
    expect(r.costo).toBe(1700);
  });

  it('factura en otra moneda sin tipo de cambio: no se compara', () => {
    const c = gasto({ ordenCompraId: 'OC-1', facturaProveedorId: 'FAC-1' });
    const r = costoDeCargo(c, ctxDe([c], [oc({
      facturaDatos: { total: 34800, subtotal: 30000, moneda: 'MXN' },
    })]));
    expect(r.sinComparar).toBe('sin_tipo_cambio');
    expect(r.costo).toBe(1500);
    expect(r.excedente).toBe(0);
  });

  it('con tipo de cambio declarado sí convierte', () => {
    const c = gasto({ ordenCompraId: 'OC-1', facturaProveedorId: 'FAC-1' });
    const r = costoDeCargo(c, ctxDe([c], [oc({
      facturaDatos: { total: 34800, subtotal: 30000, moneda: 'MXN' },
    })], 20));
    expect(r.sinComparar).toBeNull();
    expect(r.costo).toBe(1500);   // 30,000 / 20
    expect(r.excedente).toBe(0);
  });

  it('pagado por MÁS de lo cotizado: manda el monto de la OC', () => {
    const c = gasto({ ordenCompraId: 'OC-1' });
    const r = costoDeCargo(c, ctxDe([c], [oc({ estado: 'pagada', monto: 1800 })]));
    expect(r.estado).toBe('pagado');
    expect(r.costo).toBe(1800);
    expect(r.excedente).toBe(300);
  });

  it('pagado manda sobre la factura', () => {
    const c = gasto({ ordenCompraId: 'OC-1', facturaProveedorId: 'FAC-1' });
    const r = costoDeCargo(c, ctxDe([c], [oc({
      estado: 'pagada', monto: 1800,
      facturaDatos: { total: 1972, subtotal: 1700, moneda: 'USD' },
    })]));
    expect(r.estado).toBe('pagado');
    expect(r.costo).toBe(1800);
  });

  it('pagado en otra moneda sin tipo de cambio: pagado, pero sin comparar', () => {
    const c = gasto({ ordenCompraId: 'OC-1' });
    const r = costoDeCargo(c, ctxDe([c], [oc({ estado: 'pagada', monto: 36000, moneda: 'MXN' })]));
    expect(r.estado).toBe('pagado');
    expect(r.sinComparar).toBe('sin_tipo_cambio');
    expect(r.excedente).toBe(0);
  });

  it('la OC se generó por un importe y el cargo se corrigió después: se reporta el desfase', () => {
    const c = gasto({ monto: 1650, montoHeredado: 1500, ordenCompraId: 'OC-1' });
    const r = costoDeCargo(c, ctxDe([c], [oc({ monto: 1500 })]));
    expect(r.desfaseOC).toEqual({ cargoId: 'gas-1', oc: 1500, cargo: 1650 });
  });

  it('sin desfase cuando la OC y el cargo dicen lo mismo', () => {
    const c = gasto({ ordenCompraId: 'OC-1' });
    expect(costoDeCargo(c, ctxDe([c], [oc()])).desfaseOC).toBeNull();
  });

  it('un ingreso no tiene costo', () => {
    const c = ingreso();
    const r = costoDeCargo(c, ctxDe([c]));
    expect(r.costo).toBe(0);
    expect(r.cotizado).toBe(0);
  });
});

// ─── B · El menos firme ───────────────────────────────────────────────────────

describe('estadoMenosFirme', () => {
  it('sin gastos, no hay costo firme', () => {
    expect(estadoMenosFirme([])).toBe('estimado');
  });
  it('uno estimado arrastra a los pagados', () => {
    expect(estadoMenosFirme(['pagado', 'facturado', 'estimado'])).toBe('estimado');
  });
  it('todos pagados', () => {
    expect(estadoMenosFirme(['pagado', 'pagado'])).toBe('pagado');
  });
  it('facturado gana a pagado', () => {
    expect(estadoMenosFirme(['pagado', 'facturado'])).toBe('facturado');
  });
});

// ─── C · El concepto completo ─────────────────────────────────────────────────

describe('margenDelConcepto', () => {
  it('las cuatro columnas de Pricing sobre un concepto sin pagos', () => {
    const cargos = [ingreso(), gasto()];
    const [r] = margenDelConcepto(agruparCargos(cargos)[0], ctxDe(cargos));
    expect(r.moneda).toBe('USD');
    expect(r.venta).toBe(1800);
    expect(r.costo).toBe(1500);
    expect(r.profit).toBe(300);
    expect(r.margen).toBeCloseTo(0.1667, 4);
    expect(r.estado).toBe('estimado');
  });

  it('pagar de más baja el profit y deja el excedente a la vista', () => {
    const cargos = [ingreso(), gasto({ ordenCompraId: 'OC-1' })];
    const [r] = margenDelConcepto(
      agruparCargos(cargos)[0],
      ctxDe(cargos, [oc({ estado: 'pagada', monto: 1800 })]),
    );
    expect(r.costo).toBe(1800);
    expect(r.profit).toBe(0);
    expect(r.margen).toBe(0);
    expect(r.excedente).toBe(300);
    expect(r.estado).toBe('pagado');
  });

  it('dos proveedores en un concepto: el menos firme manda y los costos suman', () => {
    const cargos = [
      ingreso(),
      gasto({ id: 'g1', monto: 1000, ordenCompraId: 'OC-1' }),
      gasto({ id: 'g2', monto: 500, proveedorId: 'PRV-2' }),
    ];
    const [r] = margenDelConcepto(
      agruparCargos(cargos)[0],
      ctxDe(cargos, [oc({ id: 'OC-1', estado: 'pagada', monto: 1100 })]),
    );
    expect(r.costo).toBe(1600);       // 1,100 pagados + 500 estimados
    expect(r.profit).toBe(200);
    expect(r.excedente).toBe(100);
    expect(r.estado).toBe('estimado');
  });

  it('§4.3: se cobra en una moneda y se paga en otra → una fila por moneda, sin sumarse', () => {
    const cargos = [ingreso(), gasto({ monto: 20000, moneda: 'MXN' })];
    const filas = margenDelConcepto(agruparCargos(cargos)[0], ctxDe(cargos));
    expect(filas).toHaveLength(2);
    const usd = filas.find(f => f.moneda === 'USD')!;
    const mxn = filas.find(f => f.moneda === 'MXN')!;
    expect(usd.venta).toBe(1800);
    expect(usd.costo).toBe(0);
    expect(mxn.venta).toBe(0);
    expect(mxn.costo).toBe(20000);
    expect(mxn.margen).toBeNull();    // sin venta no hay porcentaje
  });

  it('el aviso de por qué no se comparó llega al concepto, sin repetirse', () => {
    const cargos = [
      ingreso(),
      gasto({ id: 'g1', monto: 1000, ordenCompraId: 'OC-1', facturaProveedorId: 'FAC-1' }),
      gasto({ id: 'g2', monto: 500, proveedorId: 'PRV-2', ordenCompraId: 'OC-2', facturaProveedorId: 'FAC-2' }),
    ];
    const [r] = margenDelConcepto(agruparCargos(cargos)[0], ctxDe(cargos, [
      oc({ id: 'OC-1', monto: 1000, facturaDatos: { total: 1160, moneda: 'USD' } }),
      oc({ id: 'OC-2', monto: 500, facturaDatos: { total: 580, moneda: 'USD' } }),
    ]));
    expect(r.avisos).toEqual(['factura_con_iva']);
    expect(r.estado).toBe('facturado');
  });

  it('venta en cero: margen null en vez de dividir entre cero', () => {
    const cargos = [gasto()];
    const [r] = margenDelConcepto(agruparCargos(cargos)[0], ctxDe(cargos));
    expect(r.venta).toBe(0);
    expect(r.margen).toBeNull();
    expect(r.profit).toBe(-1500);
  });
});

// ─── D · El embarque entero ───────────────────────────────────────────────────

describe('margenDelEmbarque', () => {
  it('suma lo mismo que los conceptos por separado', () => {
    const cargos: CargoDetalle[] = [
      ingreso({ id: 'i1', monto: 1800 }),
      gasto({ id: 'g1', monto: 1500, ordenCompraId: 'OC-1' }),
      ingreso({
        id: 'i2', concepto: 'Documentation', monto: 250,
        origenCotizacion: { cotizacionId: 'COT-1', servicioId: 'S1', conceptoId: 'CON-002' },
      }),
      gasto({
        id: 'g2', concepto: 'Documentation', monto: 200,
        origenCotizacion: { cotizacionId: 'COT-1', servicioId: 'S1', conceptoId: 'CON-002' },
      }),
    ];
    const ctx = ctxDe(cargos, [oc({ estado: 'pagada', monto: 1700 })]);

    const [total] = margenDelEmbarque(cargos, ctx);
    expect(total.venta).toBe(2050);
    expect(total.costo).toBe(1900);      // 1,700 pagados + 200 estimados
    expect(total.profit).toBe(150);
    expect(total.excedente).toBe(200);
    expect(total.estado).toBe('estimado');

    const porConcepto = agruparCargos(cargos)
      .flatMap(g => margenDelConcepto(g, ctx))
      .reduce((a, f) => a + f.profit, 0);
    expect(porConcepto).toBe(total.profit);
  });

  it('una moneda por bloque, nunca sumadas', () => {
    const cargos = [ingreso(), gasto({ monto: 20000, moneda: 'MXN' })];
    const filas = margenDelEmbarque(cargos, ctxDe(cargos));
    expect(filas.map(f => f.moneda)).toEqual(['USD', 'MXN']);
  });
});
