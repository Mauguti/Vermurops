/**
 * Tarea 73 · P6 — un pago a proveedor cubre varias órdenes.
 * Casos: una orden, varias, una orden sin factura del proveedor, y que lo
 * viejo (órdenes pagadas con el mismo comprobante) se siga leyendo sin doble conteo.
 */
import { describe, it, expect } from 'vitest';
import {
  construirPagoDeGrupo, problemasDelGrupo, pagosDeProveedor, pagoQueCubrio,
  type ContextoPago,
} from './pagos';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';

const orden = (over: Partial<OrdenCompra> = {}): OrdenCompra => ({
  id: 'oc-1', folio: 'OC-2026-0001', estado: 'autorizada',
  proveedorId: 'PRV-1', proveedorNombre: 'IDAMEX',
  monto: 10000, moneda: 'MXN', embarqueId: 'EMB-1',
  bancoSalida: 'santander_gastos', comprobantePago: null,
  facturaAsociada: 'F-IDA-1201', activo: true,
  ...over,
} as unknown as OrdenCompra);

const ctx: ContextoPago = {
  id: 'PAG-X', folio: 'PAG-2026-0042',
  por: { uid: 'u1', nombre: 'Julio' }, ahora: '2026-10-06T10:00:00.000Z',
};
const datos = { referencia: 'TR-5501', fecha: '2026-10-06' };

describe('construirPagoDeGrupo', () => {
  it('una orden: un pago con una aplicación por su monto', () => {
    const p = construirPagoDeGrupo([orden()], datos, ctx);
    expect(p.lado).toBe('proveedor');
    expect(p.monto).toBe(10000);
    expect(p.aplicaciones).toHaveLength(1);
    expect(p.destinoIds).toEqual(['oc-1']);
    expect(p.referencia).toBe('TR-5501');
    expect(p.folio).toBe('PAG-2026-0042');
  });

  it('varias órdenes: UN pago, la suma, una aplicación por orden', () => {
    const p = construirPagoDeGrupo([
      orden({ id: 'oc-1', monto: 48400.5 }),
      orden({ id: 'oc-2', folio: 'OC-2026-0002', monto: 20000, embarqueId: 'EMB-2' }),
    ], datos, ctx);
    expect(p.monto).toBe(68400.5);
    expect(p.aplicaciones.map(a => a.destinoNumero)).toEqual(['OC-2026-0001', 'OC-2026-0002']);
    expect(p.destinoIds).toEqual(['oc-1', 'oc-2']);
    expect(p.embarqueIds.sort()).toEqual(['EMB-1', 'EMB-2']);
    expect(p.banco).toBe('santander_gastos');
  });

  it('una orden SIN factura del proveedor entra igual: se paga lo autorizado', () => {
    const p = construirPagoDeGrupo([
      orden({ id: 'oc-1' }),
      orden({ id: 'oc-2', folio: 'OC-2026-0110', monto: 5200, facturaAsociada: null }),
    ], datos, ctx);
    expect(p.monto).toBe(15200);
    expect(p.aplicaciones.map(a => a.destinoId)).toContain('oc-2');
  });

  it('bancos distintos entre órdenes: no se inventa uno', () => {
    const p = construirPagoDeGrupo([
      orden({ id: 'oc-1' }), orden({ id: 'oc-2', bancoSalida: 'bbva' }),
    ], datos, ctx);
    expect(p.banco).toBeNull();
  });

  it('§4.3: monedas distintas lanzan antes de escribir', () => {
    expect(() => construirPagoDeGrupo([
      orden({ id: 'oc-1' }), orden({ id: 'oc-2', moneda: 'USD' }),
    ], datos, ctx)).toThrow(/monedas distintas/);
  });

  it('proveedores distintos lanzan', () => {
    expect(() => construirPagoDeGrupo([
      orden({ id: 'oc-1' }), orden({ id: 'oc-2', proveedorId: 'PRV-2' }),
    ], datos, ctx)).toThrow(/proveedores distintos/);
  });

  it('sin referencia o sin órdenes lanza', () => {
    expect(() => construirPagoDeGrupo([orden()], { ...datos, referencia: '  ' }, ctx)).toThrow(/referencia/);
    expect(problemasDelGrupo([])).not.toEqual([]);
  });

  it('una orden en cero lanza', () => {
    expect(() => construirPagoDeGrupo([orden({ monto: 0 })], datos, ctx)).toThrow(/sin monto|no tiene monto/);
  });
});

describe('lectura: lo nuevo y lo viejo', () => {
  const nuevo = construirPagoDeGrupo([
    orden({ id: 'oc-1', estado: 'pagada', comprobantePago: 'TR-5501' }),
    orden({ id: 'oc-2', estado: 'pagada', comprobantePago: 'TR-5501', monto: 5000 }),
  ], datos, ctx);

  it('las órdenes cubiertas por un pago nuevo NO se leen otra vez como legacy', () => {
    const ordenes = [
      orden({ id: 'oc-1', estado: 'pagada', comprobantePago: 'TR-5501' }),
      orden({ id: 'oc-2', estado: 'pagada', comprobantePago: 'TR-5501', monto: 5000 }),
    ];
    const todos = pagosDeProveedor([nuevo], ordenes);
    expect(todos).toHaveLength(1);
    expect(todos[0].monto).toBe(15000);
  });

  it('una pagada antes de P6 se sigue leyendo por el adaptador', () => {
    const vieja = orden({ id: 'oc-9', folio: 'OC-2026-0009', estado: 'pagada', comprobantePago: 'TR-100' });
    const todos = pagosDeProveedor([nuevo], [
      orden({ id: 'oc-1', estado: 'pagada', comprobantePago: 'TR-5501' }), vieja,
    ]);
    expect(todos).toHaveLength(2);
    expect(todos.some(p => p.origen === 'legacy_comprobante_oc')).toBe(true);
  });

  it('un pago anulado ya no cubre: sus órdenes vuelven a leerse por lo viejo', () => {
    const anulado = { ...nuevo, activo: false };
    const todos = pagosDeProveedor([anulado], [
      orden({ id: 'oc-1', estado: 'pagada', comprobantePago: 'TR-5501' }),
    ]);
    expect(todos.filter(p => p.origen === 'legacy_comprobante_oc')).toHaveLength(1);
  });

  it('los pagos del cliente no se cuelan en el lado proveedor', () => {
    const cliente = { ...nuevo, id: 'c', lado: 'cliente' as const };
    expect(pagosDeProveedor([cliente], [])).toEqual([]);
  });

  it('pagoQueCubrio: cada orden dice con qué pago se cubrió', () => {
    expect(pagoQueCubrio('oc-2', [nuevo])?.folio).toBe('PAG-2026-0042');
    expect(pagoQueCubrio('oc-77', [nuevo])).toBeNull();
    expect(pagoQueCubrio('oc-2', [{ ...nuevo, activo: false }])).toBeNull();
  });
});

describe('anticipos cruzados', () => {
  it('el pago es lo que SALE del banco: monto menos el anticipo cruzado', () => {
    const o = orden({
      monto: 10000,
      anticiposCruzados: [{ ocId: 'ant', folio: 'OC-ANT', montoAplicado: 4000 }],
    } as unknown as Partial<OrdenCompra>);
    const p = construirPagoDeGrupo([o], datos, ctx);
    expect(p.monto).toBe(6000);
    expect(p.aplicaciones[0].monto).toBe(6000);
  });
});

describe('construirPagoDeGrupo · tarea 81 (fecha, cuenta y comprobante)', () => {
  const dos = [orden({ id: 'oc-1' }), orden({ id: 'oc-2', folio: 'OC-2026-0002', monto: 5000 })];

  it('la fecha elegida es la del pago y la de cada aplicación, no la de captura', () => {
    const p = construirPagoDeGrupo(dos, { referencia: 'TR-1', fecha: '2026-10-05' }, ctx);
    expect(p.fecha).toBe('2026-10-05');
    expect(p.aplicaciones.every(a => a.aplicadaPor?.fecha === '2026-10-05')).toBe(true);
    expect(p.createdAt).toBe(ctx.ahora);
  });

  it('el comprobante queda UNA vez en el pago, con su monto sin cambio', () => {
    const comprobante = { url: 'https://x/c.jpg', nombre: 'c.jpg', subidoEn: ctx.ahora };
    const p = construirPagoDeGrupo(dos, { ...datos, comprobante }, ctx);
    expect(p.comprobante).toEqual(comprobante);
    expect(p.monto).toBe(15000);
  });

  it('sin comprobante ni banco elegido: igual que antes', () => {
    const p = construirPagoDeGrupo(dos, datos, ctx);
    expect(p.comprobante).toBeNull();
    expect(p.banco).toBe('santander_gastos');
  });

  it('la cuenta elegida manda sobre la de las órdenes; vacía = sin cuenta', () => {
    expect(construirPagoDeGrupo(dos, { ...datos, banco: 'bbva' }, ctx).banco).toBe('bbva');
    expect(construirPagoDeGrupo(dos, { ...datos, banco: '' }, ctx).banco).toBeNull();
  });

  it('un subconjunto del grupo paga solo lo suyo', () => {
    const p = construirPagoDeGrupo([dos[1]], datos, ctx);
    expect(p.monto).toBe(5000);
    expect(p.destinoIds).toEqual(['oc-2']);
  });
});
