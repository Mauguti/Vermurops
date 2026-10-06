/**
 * Tests de pagos.ts (PLAN-PAGOS P1).
 *
 * Fijan el modelo y los adaptadores de lo viejo. La equivalencia con lo que
 * hoy se ve en pantalla vive en `pagos.equivalencia.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import {
  aplicado, sinAplicar, aplicacionesA, aplicacionesConPago, avanceDeDestino,
  pagoDesdeCobro, pagoDesdeDeposito, pagosDeCliente, pagosDesdeOrdenes,
  entradasDeFondeo,
  construirPagoDeCobro, construirPagoDeDeposito, coleccionDelPago,
  type Pago, type AplicacionPago, type DatosCobro, type DatosDeposito,
} from './pagos';
import type { CobroCliente } from '../components/facturas/FacturasData';
import type { DepositoCliente, OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const aplicacion = (over: Partial<AplicacionPago> = {}): AplicacionPago => ({
  destinoTipo: 'factura', destinoId: 'F1', destinoNumero: 'A-1',
  monto: 1000, moneda: 'MXN',
  aplicadaPor: { uid: 'u', nombre: 'Julio', fecha: '2026-10-01' },
  ...over,
});

const pago = (over: Partial<Pago> = {}): Pago => ({
  id: 'PAG-1', folio: 'PAG-2026-0001', lado: 'cliente',
  terceroTipo: 'cliente', terceroId: 'CLI-1', terceroNombre: 'Alfa',
  monto: 1000, moneda: 'MXN', fecha: '2026-10-01',
  banco: 'bbva', referencia: 'TR-900', comprobante: null,
  aplicaciones: [], destinoIds: [], embarqueIds: [],
  origen: 'app',
  registradoPor: { uid: 'u', nombre: 'Julio' },
  activo: true, createdAt: '', updatedAt: '',
  ...over,
});

const cobro = (over: Partial<CobroCliente> = {}): CobroCliente => ({
  id: 'COB-1', facturaId: 'F1', facturaNumero: 'A-1',
  embarqueId: 'E1', embarqueFolio: 'VLIM-1',
  clienteId: 'CLI-1', clienteNombre: 'Alfa',
  monto: 5000, moneda: 'MXN', fechaCobro: '2026-09-05',
  banco: 'Santander', referencia: 'REF',
  registradoPor: { uid: 'u', nombre: 'Julio' },
  activo: true, createdAt: 'c', updatedAt: 'u',
  ...over,
});

const deposito = (over: Partial<DepositoCliente> = {}): DepositoCliente => ({
  id: 'DEP-1', embarqueId: 'E1', embarqueFolio: 'VLIM-1',
  clienteId: 'CLI-1', clienteNombre: 'Alfa',
  monto: 80000, moneda: 'MXN', fechaDeposito: '2026-09-24',
  referencia: 'DEP-REF', comprobante: null,
  registradoPor: { uid: 'u', nombre: 'Julio' },
  activo: true, fechaAlta: '2026-09-24T10:00:00Z', updatedAt: '2026-09-24T10:00:00Z',
  ...over,
});

const orden = (over: Partial<OrdenCompra> = {}): OrdenCompra => ({
  id: 'oc-1', folio: 'OC-2026-0001',
  origen: 'embarque', embarqueId: 'E1', embarqueFolio: 'VLIM-1',
  clienteId: 'CLI-1', clienteNombre: 'Alfa',
  proveedorId: 'PRV-1', proveedorNombre: 'IDAMEX',
  conceptoId: 'CON-001', conceptoNombre: 'Ocean Freight',
  descripcion: '', monto: 10000, moneda: 'MXN',
  fechaRequerida: '2026-09-15', fechaSugeridaPago: null,
  urgencia: 'normal', estado: 'pagada',
  motivoRechazo: null, historialEstados: [],
  solicitadaPor: null, gestionadaPor: null, autorizadaPor: null,
  pagadaPor: { uid: 'u', nombre: 'Julio', fecha: '2026-10-02T12:00:00Z' },
  cuentaBancariaId: null, bancoSalida: 'santander_gastos', cuentaSalida: null,
  facturaAsociada: null, comprobantePago: 'TR-5501',
  esAnticipo: false, anticiposCruzados: [], saldoPendiente: null, montoDisponible: null,
  activo: true, createdAt: '', updatedAt: '2026-10-02T12:00:00Z',
  ...over,
} as OrdenCompra);

// ─── A · Las derivaciones ────────────────────────────────────────────────────

describe('aplicado / sinAplicar', () => {
  it('un pago sin aplicaciones está entero sin aplicar: es el «a cuenta»', () => {
    const p = pago({ monto: 50000 });
    expect(aplicado(p)).toBe(0);
    expect(sinAplicar(p)).toBe(50000);
  });

  it('doce facturas con una transferencia: la suma de las aplicaciones', () => {
    const p = pago({
      monto: 12000,
      aplicaciones: Array.from({ length: 12 }, (_, i) =>
        aplicacion({ destinoId: `F${i}`, monto: 1000 })),
    });
    expect(aplicado(p)).toBe(12000);
    expect(sinAplicar(p)).toBe(0);
  });

  it('una aplicación parcial deja el resto sin aplicar', () => {
    const p = pago({ monto: 50000, aplicaciones: [aplicacion({ monto: 20000 })] });
    expect(aplicado(p)).toBe(20000);
    expect(sinAplicar(p)).toBe(30000);
  });

  it('§4.3: una aplicación en otra moneda no entra en el total del pago', () => {
    const p = pago({
      monto: 1000, moneda: 'USD',
      aplicaciones: [aplicacion({ monto: 1000, moneda: 'MXN' })],
    });
    expect(aplicado(p)).toBe(0);
    expect(sinAplicar(p)).toBe(1000);
  });

  it('redondea a centavos: tres de 33.333 no dan 99.999', () => {
    const p = pago({
      monto: 100,
      aplicaciones: [33.333, 33.333, 33.334].map(monto => aplicacion({ monto })),
    });
    expect(aplicado(p)).toBe(100);
  });
});

describe('aplicacionesA', () => {
  const pagos = [
    pago({ id: 'P1', aplicaciones: [aplicacion({ destinoId: 'F1', monto: 400 })] }),
    pago({ id: 'P2', aplicaciones: [aplicacion({ destinoId: 'F1', monto: 600 }), aplicacion({ destinoId: 'F2', monto: 300 })] }),
    pago({ id: 'P3', activo: false, aplicaciones: [aplicacion({ destinoId: 'F1', monto: 999 })] }),
  ];

  it('junta las aplicaciones de varios pagos al mismo destino', () => {
    expect(aplicacionesA('F1', pagos).map(a => a.monto)).toEqual([400, 600]);
  });

  it('un pago anulado no aplica nada: el saldo se recalcula solo', () => {
    expect(aplicacionesA('F1', pagos).some(a => a.monto === 999)).toBe(false);
  });

  it('con incluirAnulados se ven igual, para las pantallas que los listan', () => {
    const todas = aplicacionesConPago('F1', pagos, { incluirAnulados: true });
    expect(todas).toHaveLength(3);
    expect(todas.find(x => x.pago.id === 'P3')?.pago.activo).toBe(false);
  });

  it('un destino sin aplicaciones devuelve lista vacía, no undefined', () => {
    expect(aplicacionesA('F9', pagos)).toEqual([]);
  });
});

describe('avanceDeDestino', () => {
  const destino = { id: 'OC-1', monto: 50000, moneda: 'MXN' as const };

  it('sin pago: nada aplicado y el restante es el monto', () => {
    const a = avanceDeDestino(destino, []);
    expect(a).toMatchObject({ aplicado: 0, restante: 50000, estado: 'sin_pago' });
  });

  it('«se le abonaron 20,000 de 50,000»: parcial, que hoy no existe', () => {
    const a = avanceDeDestino(destino, [pago({ aplicaciones: [aplicacion({ destinoId: 'OC-1', destinoTipo: 'orden', monto: 20000 })] })]);
    expect(a).toMatchObject({ aplicado: 20000, restante: 30000, estado: 'parcial' });
  });

  it('liquidado con tolerancia de un peso, como saldoDeFactura', () => {
    const a = avanceDeDestino(destino, [pago({ aplicaciones: [aplicacion({ destinoId: 'OC-1', monto: 49999.5 })] })]);
    expect(a.estado).toBe('liquidado');
  });

  it('§4.3: una aplicación en otra moneda no liquida, y se avisa', () => {
    const a = avanceDeDestino(destino, [pago({ moneda: 'USD', aplicaciones: [aplicacion({ destinoId: 'OC-1', monto: 50000, moneda: 'USD' })] })]);
    expect(a.aplicado).toBe(0);
    expect(a.estado).toBe('sin_pago');
    expect(a.avisoMoneda).toContain('otra moneda');
  });

  it('sobrepagado deja el restante negativo en vez de esconderlo', () => {
    const a = avanceDeDestino(destino, [pago({ aplicaciones: [aplicacion({ destinoId: 'OC-1', monto: 60000 })] })]);
    expect(a.restante).toBe(-10000);
  });
});

// ─── B · Los adaptadores ─────────────────────────────────────────────────────

describe('pagoDesdeCobro', () => {
  it('un cobro ES un pago con una sola aplicación, por el monto completo', () => {
    const p = pagoDesdeCobro(cobro());
    expect(p.aplicaciones).toHaveLength(1);
    expect(p.aplicaciones[0]).toMatchObject({
      destinoTipo: 'factura', destinoId: 'F1', destinoNumero: 'A-1', monto: 5000, moneda: 'MXN',
    });
    expect(aplicado(p)).toBe(5000);
    expect(sinAplicar(p)).toBe(0);
  });

  it('conserva id, fecha, banco y referencia tal como están guardados', () => {
    const p = pagoDesdeCobro(cobro());
    expect(p.id).toBe('COB-1');
    expect(p.folio).toBe('COB-1');
    expect(p.fecha).toBe('2026-09-05');
    expect(p.banco).toBe('Santander');
    expect(p.referencia).toBe('REF');
  });

  it('el embarqueId obligatorio del cobro se vuelve un embarqueIds de uno', () => {
    expect(pagoDesdeCobro(cobro()).embarqueIds).toEqual(['E1']);
  });

  it('un cobro anulado da un pago anulado', () => {
    expect(pagoDesdeCobro(cobro({ activo: false })).activo).toBe(false);
  });

  it('se marca de dónde vino, para distinguirlo de lo que escriba la app', () => {
    expect(pagoDesdeCobro(cobro()).origen).toBe('legacy_cobro');
  });
});

describe('pagoDesdeDeposito', () => {
  it('un depósito ES un pago con CERO aplicaciones: todo a cuenta', () => {
    const p = pagoDesdeDeposito(deposito());
    expect(p.aplicaciones).toEqual([]);
    expect(p.destinoIds).toEqual([]);
    expect(sinAplicar(p)).toBe(80000);
  });

  it('§10.2: el depósito viejo no tiene banco y queda en null, no inventado', () => {
    expect(pagoDesdeDeposito(deposito()).banco).toBeNull();
  });

  it('el comprobante (una URL suelta) se envuelve sin perderlo', () => {
    const p = pagoDesdeDeposito(deposito({ comprobante: 'https://x/y.pdf' }));
    expect(p.comprobante?.url).toBe('https://x/y.pdf');
    expect(pagoDesdeDeposito(deposito()).comprobante).toBeNull();
  });

  it('un depósito no liquida ninguna factura: no aparece en sus aplicaciones', () => {
    expect(aplicacionesA('F1', [pagoDesdeDeposito(deposito())])).toEqual([]);
  });
});

describe('pagosDeCliente', () => {
  it('junta los tres orígenes en una lista', () => {
    const l = pagosDeCliente([pago({ id: 'PAG-9' })], [cobro()], [deposito()]);
    expect(l.map(p => p.id)).toEqual(['PAG-9', 'COB-1', 'DEP-1']);
  });

  it('no hay doble conteo: cada movimiento viene de una sola fuente', () => {
    const l = pagosDeCliente([], [cobro()], [deposito()]);
    expect(l.reduce((acc, p) => acc + p.monto, 0)).toBe(85000); // misma moneda: MXN
  });

  it('un pago del lado proveedor no entra en la lista del cliente', () => {
    expect(pagosDeCliente([pago({ id: 'P-PRV', lado: 'proveedor' })], [], [])).toEqual([]);
  });
});

describe('pagosDesdeOrdenes', () => {
  it('el mismo comprobante en varias órdenes es UN pago consolidado', () => {
    const p = pagosDesdeOrdenes([
      orden({ id: 'oc-1', monto: 10000 }),
      orden({ id: 'oc-2', folio: 'OC-2026-0002', monto: 15000 }),
    ]);
    expect(p).toHaveLength(1);
    expect(p[0].monto).toBe(25000);
    expect(p[0].aplicaciones.map(a => a.destinoId)).toEqual(['oc-1', 'oc-2']);
    expect(p[0].destinoIds).toEqual(['oc-1', 'oc-2']);
  });

  it('la referencia se compara sin guiones ni mayúsculas, como en §4.24', () => {
    const p = pagosDesdeOrdenes([
      orden({ id: 'oc-1', comprobantePago: 'TR-5501' }),
      orden({ id: 'oc-2', comprobantePago: 'tr 5501' }),
    ]);
    expect(p).toHaveLength(1);
  });

  it('el mismo comprobante de DOS proveedores son dos pagos', () => {
    const p = pagosDesdeOrdenes([
      orden({ id: 'oc-1' }),
      orden({ id: 'oc-2', proveedorId: 'PRV-2', proveedorNombre: 'Oñate' }),
    ]);
    expect(p).toHaveLength(2);
  });

  it('§4.3: dos monedas son dos pagos, nunca uno de 42,000', () => {
    const p = pagosDesdeOrdenes([
      orden({ id: 'oc-1', monto: 2000, moneda: 'USD' }),
      orden({ id: 'oc-2', monto: 40000, moneda: 'MXN' }),
    ]);
    expect(p).toHaveLength(2);
    expect(p.map(x => x.monto).sort((a, b) => a - b)).toEqual([2000, 40000]);
  });

  it('una orden pagada SIN comprobante es su propio pago, no se junta', () => {
    const p = pagosDesdeOrdenes([
      orden({ id: 'oc-1', comprobantePago: null }),
      orden({ id: 'oc-2', comprobantePago: null }),
    ]);
    expect(p).toHaveLength(2);
  });

  it('solo las pagadas: una autorizada no movió dinero', () => {
    expect(pagosDesdeOrdenes([orden({ estado: 'autorizada' })])).toEqual([]);
    expect(pagosDesdeOrdenes([orden({ estado: 'rechazada' })])).toEqual([]);
    expect(pagosDesdeOrdenes([orden({ activo: false })])).toEqual([]);
  });

  it('el pago queda del lado proveedor y con el proveedor como tercero', () => {
    const p = pagosDesdeOrdenes([orden()])[0];
    expect(p.lado).toBe('proveedor');
    expect(p.terceroId).toBe('PRV-1');
    expect(p.terceroNombre).toBe('IDAMEX');
    expect(p.fecha).toBe('2026-10-02');
    expect(p.banco).toBe('santander_gastos');
    expect(p.origen).toBe('legacy_comprobante_oc');
  });

  it('un pago que cubre órdenes de dos embarques los lista los dos', () => {
    const p = pagosDesdeOrdenes([
      orden({ id: 'oc-1', embarqueId: 'E1' }),
      orden({ id: 'oc-2', embarqueId: 'E2' }),
    ])[0];
    expect(p.embarqueIds).toEqual(['E1', 'E2']);
  });
});

// ─── C · El fondeo ───────────────────────────────────────────────────────────

describe('entradasDeFondeo', () => {
  it('un depósito a cuenta aporta su monto completo a su embarque', () => {
    const e = entradasDeFondeo([pagoDesdeDeposito(deposito())], 'E1');
    expect(e).toEqual([{ monto: 80000, moneda: 'MXN' }]);
  });

  it('un cobro aporta lo mismo que aportaba antes', () => {
    const e = entradasDeFondeo([pagoDesdeCobro(cobro())], 'E1');
    expect(e).toEqual([{ monto: 5000, moneda: 'MXN' }]);
  });

  it('el dinero de OTRO embarque no fondea este', () => {
    expect(entradasDeFondeo([pagoDesdeCobro(cobro({ embarqueId: 'E9' }))], 'E1')).toEqual([]);
  });

  it('un pago anulado no fondea nada', () => {
    expect(entradasDeFondeo([pagoDesdeCobro(cobro({ activo: false }))], 'E1')).toEqual([]);
  });

  it('el lado proveedor no fondea: es dinero que sale', () => {
    expect(entradasDeFondeo(pagosDesdeOrdenes([orden()]), 'E1')).toEqual([]);
  });

  it('una transferencia de dos embarques fondea cada uno por lo que le toca', () => {
    const p = pago({
      monto: 30000, embarqueIds: ['E1', 'E2'],
      aplicaciones: [
        aplicacion({ destinoId: 'F1', monto: 10000 }),
        aplicacion({ destinoId: 'F2', monto: 20000 }),
      ],
    });
    const deDestino = (id: string) => (id === 'F1' ? 'E1' : 'E2');
    expect(entradasDeFondeo([p], 'E1', deDestino)).toEqual([{ monto: 10000, moneda: 'MXN' }]);
    expect(entradasDeFondeo([p], 'E2', deDestino)).toEqual([{ monto: 20000, moneda: 'MXN' }]);
  });

  it('sin resolvedor, un pago repartido NO se cuenta: inflar el fondeo autoriza un pago descubierto', () => {
    const p = pago({
      monto: 30000, embarqueIds: ['E1', 'E2'],
      aplicaciones: [aplicacion({ destinoId: 'F1', monto: 10000 }), aplicacion({ destinoId: 'F2', monto: 20000 })],
    });
    expect(entradasDeFondeo([p], 'E1')).toEqual([]);
  });

  it('un pago aplicado parcialmente aporta solo lo aplicado', () => {
    const p = pago({
      monto: 50000, embarqueIds: ['E1'],
      aplicaciones: [aplicacion({ destinoId: 'F1', monto: 20000 })],
    });
    expect(entradasDeFondeo([p], 'E1')).toEqual([{ monto: 20000, moneda: 'MXN' }]);
  });
});

// ─── P2 · Escribir un pago (tarea 68) ───────────────────────────────────────

const ctx = {
  id: 'PAG-nuevo', folio: 'PAG-2026-0007',
  por: { uid: 'u-admin', nombre: 'Julio Gutiérrez' },
  ahora: '2026-10-05T18:00:00.000Z',
};

const datosCobro = (over: Partial<DatosCobro> = {}): DatosCobro => {
  const { id: _i, registradoPor: _r, activo: _a, createdAt: _c, updatedAt: _u, ...resto } = cobro();
  return { ...resto, ...over };
};

const datosDeposito = (over: Partial<DatosDeposito> = {}): DatosDeposito => {
  const { id: _i, registradoPor: _r, activo: _a, fechaAlta: _f, updatedAt: _u, ...resto } = deposito();
  return { ...resto, ...over };
};

describe('construirPagoDeCobro · un cobro es un pago con UNA aplicación', () => {
  it('la aplicación es por el monto completo y apunta a la factura', () => {
    const p = construirPagoDeCobro(datosCobro(), ctx);
    expect(p.aplicaciones).toHaveLength(1);
    expect(p.aplicaciones[0]).toMatchObject({
      destinoTipo: 'factura', destinoId: 'F1', destinoNumero: 'A-1',
      monto: 5000, moneda: 'MXN',
    });
    expect(p.destinoIds).toEqual(['F1']);
    expect(aplicado(p)).toBe(5000);
    expect(sinAplicar(p)).toBe(0);
  });

  it('nace vivo, del lado cliente, con folio y origen «app»', () => {
    const p = construirPagoDeCobro(datosCobro(), ctx);
    expect(p).toMatchObject({
      id: 'PAG-nuevo', folio: 'PAG-2026-0007', lado: 'cliente',
      terceroTipo: 'cliente', terceroId: 'CLI-1', terceroNombre: 'Alfa',
      monto: 5000, moneda: 'MXN', fecha: '2026-09-05',
      origen: 'app', activo: true,
    });
    expect(p.registradoPor).toEqual(ctx.por);
    expect(p.createdAt).toBe(ctx.ahora);
  });

  it('hereda el embarque del cobro: es lo que fondea las órdenes (1.1)', () => {
    const p = construirPagoDeCobro(datosCobro(), ctx);
    expect(p.embarqueIds).toEqual(['E1']);
    expect(entradasDeFondeo([p], 'E1')).toEqual([{ monto: 5000, moneda: 'MXN' }]);
  });

  it('da el MISMO pago que leer el cobro viejo: la pantalla no distingue', () => {
    const viejo = pagoDesdeCobro(cobro());
    const nuevo = construirPagoDeCobro(datosCobro(), ctx);
    const comparable = (p: typeof viejo) => ({
      lado: p.lado, terceroId: p.terceroId, terceroNombre: p.terceroNombre,
      monto: p.monto, moneda: p.moneda, fecha: p.fecha,
      destinoIds: p.destinoIds, embarqueIds: p.embarqueIds,
      aplicado: aplicado(p), activo: p.activo,
    });
    expect(comparable(nuevo)).toEqual(comparable(viejo));
  });

  it('la referencia vacía se guarda como null, no como cadena vacía', () => {
    const p = construirPagoDeCobro(datosCobro({ referencia: '   ' }), ctx);
    expect(p.referencia).toBeNull();
  });

  it('un monto de cero o negativo NO se escribe: lanza', () => {
    expect(() => construirPagoDeCobro(datosCobro({ monto: 0 }), ctx)).toThrow(/mayor que cero/);
    expect(() => construirPagoDeCobro(datosCobro({ monto: -100 }), ctx)).toThrow(/mayor que cero/);
    expect(() => construirPagoDeCobro(datosCobro({ monto: NaN }), ctx)).toThrow(/mayor que cero/);
  });

  it('sin factura no hay aplicación que valga: lanza', () => {
    expect(() => construirPagoDeCobro(datosCobro({ facturaId: '' }), ctx)).toThrow(/falta la factura/);
  });
});

describe('construirPagoDeDeposito · un depósito es un pago con CERO aplicaciones', () => {
  it('no aplica nada: todo queda «sin aplicar»', () => {
    const p = construirPagoDeDeposito(datosDeposito(), ctx);
    expect(p.aplicaciones).toEqual([]);
    expect(p.destinoIds).toEqual([]);
    expect(aplicado(p)).toBe(0);
    expect(sinAplicar(p)).toBe(80000);
  });

  it('fondea su embarque por el monto completo, como el depósito de siempre', () => {
    const p = construirPagoDeDeposito(datosDeposito(), ctx);
    expect(p.embarqueIds).toEqual(['E1']);
    expect(entradasDeFondeo([p], 'E1')).toEqual([{ monto: 80000, moneda: 'MXN' }]);
  });

  it('el banco llega por el contexto: el depósito viejo no tenía dónde (§10.2)', () => {
    expect(construirPagoDeDeposito(datosDeposito(), ctx).banco).toBeNull();
    expect(construirPagoDeDeposito(datosDeposito(), { ...ctx, banco: 'bbva' }).banco).toBe('bbva');
  });

  it('el comprobante se envuelve como ArchivoPago cuando viene', () => {
    const p = construirPagoDeDeposito(datosDeposito({ comprobante: 'https://x/y.pdf' }), ctx);
    expect(p.comprobante).toEqual({ url: 'https://x/y.pdf', nombre: 'Comprobante', subidoEn: ctx.ahora });
  });

  it('un monto de cero no se escribe: lanza', () => {
    expect(() => construirPagoDeDeposito(datosDeposito({ monto: 0 }), ctx)).toThrow(/mayor que cero/);
  });
});

describe('coleccionDelPago · dónde se anula', () => {
  const nuevo = construirPagoDeCobro(datosCobro(), ctx);
  const lista = [nuevo, pagoDesdeCobro(cobro()), pagoDesdeDeposito(deposito())];

  it('lo registrado desde P2 se anula en pagos/', () => {
    expect(coleccionDelPago('PAG-nuevo', lista)).toBe('pagos');
  });

  it('un cobro viejo se anula en cobros/ y un depósito viejo en depositosCliente/', () => {
    expect(coleccionDelPago('COB-1', lista)).toBe('cobros');
    expect(coleccionDelPago('DEP-1', lista)).toBe('depositosCliente');
  });

  it('un id que no está en la lista devuelve null: no se adivina colección', () => {
    expect(coleccionDelPago('no-existe', lista)).toBeNull();
  });

  it('un pago derivado de comprobantePago no tiene documento propio: null', () => {
    const [consolidado] = pagosDesdeOrdenes([orden()]);
    expect(coleccionDelPago(consolidado.id, [consolidado])).toBeNull();
  });
});

describe('la lista unificada con las TRES fuentes', () => {
  it('suma lo nuevo y los dos legados sin contar dos veces', () => {
    const nuevo = construirPagoDeCobro(datosCobro({ monto: 1000 }), ctx);
    const lista = pagosDeCliente([nuevo], [cobro()], [deposito()]);
    expect(lista).toHaveLength(3);
    expect(lista.map(p => p.origen)).toEqual(['app', 'legacy_cobro', 'legacy_deposito']);
    // 1,000 del pago nuevo + 5,000 del cobro viejo + 80,000 del depósito.
    expect(entradasDeFondeo(lista, 'E1')).toEqual([
      { monto: 1000, moneda: 'MXN' },
      { monto: 5000, moneda: 'MXN' },
      { monto: 80000, moneda: 'MXN' },
    ]);
  });
});
