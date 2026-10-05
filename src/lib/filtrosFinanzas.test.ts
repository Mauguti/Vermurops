/**
 * filtrosFinanzas.test.ts (tarea 61)
 *
 * Lo que protegen: que una vista guardada devuelva la MISMA lista, y que un
 * valor basura guardado en una vista no deje la pantalla vacía sin
 * explicación — el mismo criterio que los filtros de Embarques (§4.25).
 */

import { describe, it, expect } from 'vitest';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import type { FacturaCliente } from '../components/facturas/FacturasData';
import type { FacturaEnCartera } from './cuentasPorCobrar';
import {
  FILTROS_POR_COBRAR_VACIOS, FILTROS_POR_PAGAR_VACIOS,
  aplicarFiltrosPorCobrar, aplicarFiltrosPorPagar,
  filtrosPorCobrarActivos, filtrosPorCobrarDesdeVista, filtrosPorCobrarParaVista,
  filtrosPorPagarActivos, filtrosPorPagarDesdeVista, filtrosPorPagarParaVista,
  mesesDeVencimiento,
} from './filtrosFinanzas';

// ─── Fábricas ────────────────────────────────────────────────────────────────

function oc(p: Partial<OrdenCompra> & { id: string }): OrdenCompra {
  return {
    folio: `OC-2026-${p.id}`, origen: 'oficina',
    embarqueId: null, embarqueFolio: null, clienteId: null, clienteNombre: null,
    proveedorId: 'PRV-1', proveedorNombre: 'IDAMEX',
    conceptoId: 'CON-001', conceptoNombre: 'Maniobras',
    descripcion: '', monto: 1000, moneda: 'MXN',
    estado: 'autorizada', urgencia: 'normal',
    fechaRequerida: '2026-10-01', fechaSugeridaPago: '2026-10-05',
    facturaAsociada: null,
    ...p,
  } as OrdenCompra;
}

function enCartera(p: {
  numero: string; clienteId?: string | null; clienteNombre?: string;
  moneda?: 'USD' | 'MXN'; vence?: string; estado?: FacturaEnCartera['estado'];
  embarqueFolio?: string;
}): FacturaEnCartera {
  const factura = {
    id: p.numero, numero: p.numero, fechaEmision: '2026-09-01',
    embarqueId: 'EMB-1', embarqueFolio: p.embarqueFolio ?? 'VLIM-26-001',
    clienteId: p.clienteId ?? 'CLI-1', clienteNombre: p.clienteNombre ?? 'FIBREMEX',
    moneda: p.moneda ?? 'MXN', total: 1000, subtotal: 1000, iva: 0, retencion: 0,
    fechaVencimiento: p.vence ?? '2026-10-15', diasCredito: 45,
    estado: 'emitida', lineas: [], grupoFacturacion: null,
  } as unknown as FacturaCliente;
  return { factura, cobrado: 0, saldo: 1000, estado: p.estado ?? 'por_cobrar', diasVencido: -10 };
}

// ─── A · Cuentas por pagar ───────────────────────────────────────────────────

describe('A · Cuentas por pagar: los filtros', () => {
  const ordenes = [
    oc({ id: 'A', estado: 'autorizada', moneda: 'MXN', origen: 'embarque', embarqueFolio: 'VLIM-26-001', facturaAsociada: 'F-IDA-1201' }),
    oc({ id: 'B', estado: 'pagada', moneda: 'USD' }),
    oc({ id: 'C', estado: 'autorizada', moneda: 'MXN', noPagar: true }),
  ];

  it('sin filtros no esconde nada', () => {
    expect(aplicarFiltrosPorPagar(ordenes, FILTROS_POR_PAGAR_VACIOS)).toHaveLength(3);
  });

  it('por estado, por moneda y por origen', () => {
    expect(aplicarFiltrosPorPagar(ordenes, { ...FILTROS_POR_PAGAR_VACIOS, estado: 'autorizada' })).toHaveLength(2);
    expect(aplicarFiltrosPorPagar(ordenes, { ...FILTROS_POR_PAGAR_VACIOS, moneda: 'USD' })).toHaveLength(1);
    expect(aplicarFiltrosPorPagar(ordenes, { ...FILTROS_POR_PAGAR_VACIOS, origen: 'embarque' })).toHaveLength(1);
  });

  /*
   * §4.7 · El flag solo se escribe al detener un pago, así que ausente es «no
   * marcada». Si «Sin No pagar» mirara solo `=== false`, dejaría fuera a casi
   * todas las órdenes de producción.
   */
  it('«No pagar» trata el campo ausente como no marcada', () => {
    expect(aplicarFiltrosPorPagar(ordenes, { ...FILTROS_POR_PAGAR_VACIOS, noPagar: 'si' }).map(o => o.id)).toEqual(['C']);
    expect(aplicarFiltrosPorPagar(ordenes, { ...FILTROS_POR_PAGAR_VACIOS, noPagar: 'no' }).map(o => o.id)).toEqual(['A', 'B']);
  });

  it('la búsqueda alcanza el número de factura del proveedor', () => {
    expect(aplicarFiltrosPorPagar(ordenes, { ...FILTROS_POR_PAGAR_VACIOS, busqueda: 'IDA-1201' }).map(o => o.id)).toEqual(['A']);
  });

  /*
   * El filtro de IVA necesita el catálogo de conceptos, que vive en la
   * pantalla. Sin el resolvedor no puede afirmar que una orden cuadra: se
   * queda sin resultados en vez de dejarlas pasar todas.
   */
  it('el filtro de IVA sin resolvedor no inventa que cuadra', () => {
    expect(aplicarFiltrosPorPagar(ordenes, { ...FILTROS_POR_PAGAR_VACIOS, iva: 'ok' })).toHaveLength(0);
    const r = aplicarFiltrosPorPagar(ordenes, { ...FILTROS_POR_PAGAR_VACIOS, iva: 'alerta' }, {
      etiquetaIVA: o => (o.id === 'B' ? 'alerta' : 'ok'),
    });
    expect(r.map(o => o.id)).toEqual(['B']);
  });
});

describe('B · Cuentas por pagar: ida y vuelta con la vista', () => {
  it('guarda solo lo que se desvía del default', () => {
    expect(filtrosPorPagarParaVista(FILTROS_POR_PAGAR_VACIOS)).toEqual({});
    expect(filtrosPorPagarParaVista({ ...FILTROS_POR_PAGAR_VACIOS, estado: 'autorizada', moneda: 'MXN' }))
      .toEqual({ estado: 'autorizada', moneda: 'MXN' });
  });

  it('lo guardado vuelve igual', () => {
    const f = { ...FILTROS_POR_PAGAR_VACIOS, estado: 'pagada' as const, noPagar: 'si' as const, busqueda: 'IDAMEX' };
    expect(filtrosPorPagarDesdeVista(filtrosPorPagarParaVista(f))).toEqual(f);
  });

  it('un valor basura se descarta, no deja la lista vacía', () => {
    const f = filtrosPorPagarDesdeVista({ estado: 'inventado', iva: 'verde', noPagar: 'quizá', origen: 'luna', moneda: 'EUR' });
    expect(f).toEqual(FILTROS_POR_PAGAR_VACIOS);
  });

  it('cuenta los filtros activos', () => {
    expect(filtrosPorPagarActivos(FILTROS_POR_PAGAR_VACIOS)).toBe(0);
    expect(filtrosPorPagarActivos({ ...FILTROS_POR_PAGAR_VACIOS, estado: 'pagada', busqueda: ' ' })).toBe(1);
  });
});

// ─── C · Cuentas por cobrar ──────────────────────────────────────────────────

describe('C · Cuentas por cobrar: los filtros', () => {
  const items = [
    enCartera({ numero: 'F-001', estado: 'vencido' }),
    enCartera({ numero: 'F-002', estado: 'cobrado' }),
    enCartera({ numero: 'F-003', moneda: 'USD', clienteId: 'CLI-2', clienteNombre: 'SUNWAY', vence: '2026-11-03' }),
  ];

  it('el default «Abiertas» esconde las cobradas y nada más', () => {
    expect(aplicarFiltrosPorCobrar(items, FILTROS_POR_COBRAR_VACIOS).map(i => i.factura.numero))
      .toEqual(['F-001', 'F-003']);
  });

  it('«Todas» las trae todas', () => {
    expect(aplicarFiltrosPorCobrar(items, { ...FILTROS_POR_COBRAR_VACIOS, estado: 'todas' })).toHaveLength(3);
  });

  it('por cliente, por moneda y por mes de vencimiento', () => {
    expect(aplicarFiltrosPorCobrar(items, { ...FILTROS_POR_COBRAR_VACIOS, clienteId: 'CLI-2' }).map(i => i.factura.numero)).toEqual(['F-003']);
    expect(aplicarFiltrosPorCobrar(items, { ...FILTROS_POR_COBRAR_VACIOS, moneda: 'USD' })).toHaveLength(1);
    expect(aplicarFiltrosPorCobrar(items, { ...FILTROS_POR_COBRAR_VACIOS, mesVencimiento: '2026-11' }).map(i => i.factura.numero)).toEqual(['F-003']);
  });

  it('los meses ofrecidos son los que existen, del más reciente al más viejo', () => {
    expect(mesesDeVencimiento(items)).toEqual(['2026-11', '2026-10']);
  });
});

describe('D · Cuentas por cobrar: ida y vuelta con la vista', () => {
  /*
   * «Abiertas» es el default de la pantalla, no «vacío». Si contara como
   * filtro puesto, la etiqueta diría «1 filtro» al entrar sin haber tocado
   * nada, y «Limpiar» aparecería siempre.
   */
  it('el default «Abiertas» no cuenta como filtro ni se guarda', () => {
    expect(filtrosPorCobrarActivos(FILTROS_POR_COBRAR_VACIOS)).toBe(0);
    expect(filtrosPorCobrarParaVista(FILTROS_POR_COBRAR_VACIOS)).toEqual({});
  });

  it('«Todas» sí se guarda, porque se desvía del default', () => {
    expect(filtrosPorCobrarParaVista({ ...FILTROS_POR_COBRAR_VACIOS, estado: 'todas' }))
      .toEqual({ estado: 'todas' });
  });

  it('lo guardado vuelve igual', () => {
    const f = { ...FILTROS_POR_COBRAR_VACIOS, estado: 'vencido' as const, clienteId: 'CLI-9', mesVencimiento: '2026-10' };
    expect(filtrosPorCobrarDesdeVista(filtrosPorCobrarParaVista(f))).toEqual(f);
  });

  it('un estado o un mes basura cae al default', () => {
    expect(filtrosPorCobrarDesdeVista({ estado: 'casi', mesVencimiento: 'octubre', moneda: 'EUR' }))
      .toEqual(FILTROS_POR_COBRAR_VACIOS);
  });
});
