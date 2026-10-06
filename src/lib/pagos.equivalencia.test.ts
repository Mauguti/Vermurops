/**
 * El mismo número antes y después (tarea 67 · P1).
 *
 * P1 cambia DE DÓNDE leen diez call sites, no QUÉ muestran. Este archivo fija
 * los números que el código anterior a la lectura unificada producía, con
 * datos calcados de la auditoría del 5-oct (0 facturas, 0 cobros, 1 depósito
 * de cliente y 13 órdenes en producción) más el caso del seed, que sí tiene
 * facturas con cobros parciales.
 *
 * Las cifras de abajo NO se calcularon aquí: salen de correr las derivaciones
 * con el código viejo, y la foto está en `sprint/datos/antes-67.txt`. Si
 * alguna cambia, la lectura unificada dejó de ser equivalente — y eso es
 * exactamente lo que este archivo existe para detener.
 *
 * El caso que la auditoría dio como real está primero: UN depósito, sin
 * facturas ni cobros. Es el único dato vivo que estos lectores tocan hoy.
 */

import { describe, it, expect } from 'vitest';
import {
  cartera, resumenCartera, resumenDeCliente, evaluarFactura,
} from './cuentasPorCobrar';
import { calcularFondeo, evaluarFondeo } from './fondeoCliente';
import { saldoDeFactura } from './facturacionEmbarque';
import { pagosDeCliente, aplicacionesA, entradasDeFondeo } from './pagos';
import type { FacturaCliente, CobroCliente } from '../components/facturas/FacturasData';
import type { DepositoCliente, OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';

const HOY = '2026-10-05';

const factura = (over: Partial<FacturaCliente>): FacturaCliente => ({
  id: 'F1', numero: 'A-1', fechaEmision: '2026-09-01', embarqueId: 'E1', embarqueFolio: 'VLIM-26-001',
  clienteId: 'CLI-1', clienteNombre: 'Alfa', grupoFacturacion: null, lineas: [],
  moneda: 'MXN', subtotal: 10000, iva: 1600, retencion: 0, total: 11600,
  fechaVencimiento: '2026-10-01', diasCredito: 30, estado: 'emitida',
  registradaPor: { uid: 'u', nombre: 'n' }, activo: true, createdAt: '', updatedAt: '',
  ...over,
} as FacturaCliente);

const cobro = (over: Partial<CobroCliente>): CobroCliente => ({
  id: 'COB-1', facturaId: 'F1', facturaNumero: 'A-1', embarqueId: 'E1', embarqueFolio: 'VLIM-26-001',
  clienteId: 'CLI-1', clienteNombre: 'Alfa', monto: 5000, moneda: 'MXN', fechaCobro: '2026-10-02',
  banco: 'bbva', referencia: 'REF', registradoPor: { uid: 'u', nombre: 'n' }, activo: true,
  createdAt: '', updatedAt: '', ...over,
});

const deposito = (over: Partial<DepositoCliente> = {}): DepositoCliente => ({
  id: 'DEP-1', embarqueId: 'E1', embarqueFolio: 'VLIM-26-001',
  clienteId: 'CLI-1', clienteNombre: 'Alfa', monto: 80000, moneda: 'MXN',
  fechaDeposito: '2026-09-24', referencia: 'DEP-REF', comprobante: null,
  registradoPor: { uid: 'u', nombre: 'Julio' }, activo: true,
  fechaAlta: '2026-09-24T10:00:00Z', updatedAt: '2026-09-24T10:00:00Z', ...over,
});

const oc = (over: Partial<OrdenCompra> = {}): OrdenCompra => ({
  id: 'oc-1', folio: 'OC-2026-0001', origen: 'embarque', embarqueId: 'E1', embarqueFolio: 'VLIM-26-001',
  clienteId: 'CLI-1', clienteNombre: 'Alfa', proveedorId: 'PRV-1', proveedorNombre: 'IDAMEX',
  conceptoId: 'CON-001', conceptoNombre: 'Ocean Freight', descripcion: '',
  monto: 30000, moneda: 'MXN', fechaRequerida: '2026-10-15', fechaSugeridaPago: null,
  urgencia: 'normal', estado: 'en_gestion', motivoRechazo: null, historialEstados: [],
  solicitadaPor: null, gestionadaPor: null, autorizadaPor: null, pagadaPor: null,
  cuentaBancariaId: null, bancoSalida: null, cuentaSalida: null,
  facturaAsociada: null, comprobantePago: null,
  esAnticipo: false, anticiposCruzados: [], saldoPendiente: null, montoDisponible: null,
  activo: true, createdAt: '', updatedAt: '', ...over,
} as OrdenCompra);

// ─── Los datos ───────────────────────────────────────────────────────────────

const FACTURAS = [
  factura({}),
  factura({ id: 'F2', numero: 'A-2', total: 23200, fechaVencimiento: '2026-10-08' }),
  factura({ id: 'F3', numero: 'A-3', total: 1000, moneda: 'USD', fechaVencimiento: '2026-11-30', clienteId: 'CLI-2', clienteNombre: 'Beta' }),
  factura({ id: 'F4', numero: 'A-4', total: 5000, estado: 'cancelada' }),
];
const COBROS = [
  cobro({}),
  cobro({ id: 'COB-2', facturaId: 'F2', facturaNumero: 'A-2', monto: 23200, fechaCobro: '2026-10-03' }),
  cobro({ id: 'COB-3', facturaId: 'F1', monto: 9999, activo: false }),
  cobro({ id: 'COB-4', facturaId: 'F3', facturaNumero: 'A-3', monto: 500, moneda: 'MXN', fechaCobro: '2026-09-28', clienteId: 'CLI-2', clienteNombre: 'Beta' }),
];
const DEPOSITOS = [
  deposito(),
  deposito({ id: 'DEP-2', monto: 15000, fechaDeposito: '2026-10-01' }),
];
const ORDENES = [oc(), oc({ id: 'oc-2', folio: 'OC-2026-0002', monto: 2000, moneda: 'USD' })];

/** La lista unificada, como la arma el hook: lo nuevo vacío, lo viejo leído. */
const PAGOS = pagosDeCliente([], COBROS, DEPOSITOS);

// ─── A · El caso de producción al 5-oct-2026 ─────────────────────────────────

describe('producción al 5-oct: un depósito, cero facturas, cero cobros', () => {
  const soloDeposito = pagosDeCliente([], [], [deposito()]);

  it('la cartera está vacía y los KPIs en cero', () => {
    const items = cartera([], soloDeposito, HOY);
    expect(items).toEqual([]);
    expect(resumenCartera(items, soloDeposito, HOY)).toEqual({
      porCobrar: { USD: 0, MXN: 0 },
      vencido: { USD: 0, MXN: 0 },
      cobradoDelMes: { USD: 0, MXN: 0 },
      facturasAbiertas: 0,
      facturasVencidas: 0,
    });
  });

  it('el depósito sigue fondeando su embarque, como hoy', () => {
    const f = calcularFondeo(entradasDeFondeo(soloDeposito, 'E1'), []);
    expect(f.depositado).toEqual({ USD: 0, MXN: 80000 });
  });

  it('un depósito no liquida ninguna factura: no aparece como aplicación', () => {
    expect(aplicacionesA('F1', soloDeposito)).toEqual([]);
  });
});

// ─── B · saldoDeFactura, que NO cambia: cambia quien le pasa la lista ────────

describe('saldoDeFactura con aplicaciones en vez de cobros', () => {
  const esperado: Record<string, { cobrado: number; saldo: number; estado: string; aviso: boolean }> = {
    'A-1': { cobrado: 5000, saldo: 6600, estado: 'cobrada_parcial', aviso: false },
    'A-2': { cobrado: 23200, saldo: 0, estado: 'cobrada', aviso: false },
    'A-3': { cobrado: 0, saldo: 1000, estado: 'emitida', aviso: true },
    'A-4': { cobrado: 0, saldo: 5000, estado: 'cancelada', aviso: false },
  };

  for (const f of FACTURAS) {
    it(`${f.numero}: ${esperado[f.numero].estado}`, () => {
      const s = saldoDeFactura(f, aplicacionesA(f.id, PAGOS));
      const e = esperado[f.numero];
      expect(s.cobrado).toBe(e.cobrado);
      expect(s.saldo).toBe(e.saldo);
      expect(s.estado).toBe(e.estado);
      expect(!!s.avisoMoneda).toBe(e.aviso);
    });
  }

  it('el cobro anulado (9,999 a A-1) no cuenta, ni antes ni ahora', () => {
    expect(saldoDeFactura(FACTURAS[0], aplicacionesA('F1', PAGOS)).cobrado).toBe(5000);
  });
});

// ─── C · La cartera ──────────────────────────────────────────────────────────

describe('evaluarFactura / cartera / resumenCartera', () => {
  it('evaluarFactura: los cuatro renglones igual que antes', () => {
    expect(FACTURAS.map(f => {
      const e = evaluarFactura(f, PAGOS, HOY);
      return `${f.numero} cobrado=${e.cobrado} saldo=${e.saldo} ${e.estado} dias=${e.diasVencido}${e.avisoMoneda ? ' aviso' : ''}`;
    })).toEqual([
      'A-1 cobrado=5000 saldo=6600 vencido dias=4',
      'A-2 cobrado=23200 saldo=0 cobrado dias=-3',
      'A-3 cobrado=0 saldo=1000 por_cobrar dias=-56 aviso',
      'A-4 cobrado=0 saldo=0 cobrado dias=4',
    ]);
  });

  it('cartera: tres items, la cancelada fuera, ordenadas por vencimiento', () => {
    expect(cartera(FACTURAS, PAGOS, HOY).map(i => i.factura.numero)).toEqual(['A-1', 'A-2', 'A-3']);
  });

  it('resumenCartera: los KPIs de Finanzas, por moneda', () => {
    const items = cartera(FACTURAS, PAGOS, HOY);
    expect(resumenCartera(items, PAGOS, HOY)).toEqual({
      porCobrar: { USD: 1000, MXN: 6600 },
      vencido: { USD: 0, MXN: 6600 },
      cobradoDelMes: { USD: 0, MXN: 28200 },
      facturasAbiertas: 2,
      facturasVencidas: 1,
    });
  });

  it('un depósito del mes NO entra en «cobrado del mes»: no es un cobro', () => {
    // DEP-2 son 15,000 MXN con fecha 2026-10-01. Si el resumen sumara el monto
    // del pago en vez de sus aplicaciones, el KPI diría 43,200 y nadie sabría
    // de dónde salieron los 15,000.
    const items = cartera(FACTURAS, PAGOS, HOY);
    expect(resumenCartera(items, PAGOS, HOY).cobradoDelMes.MXN).toBe(28200);
  });

  it('resumenDeCliente: lo que dice la ficha del cliente en Crédito', () => {
    const cli1 = resumenDeCliente('CLI-1', FACTURAS, PAGOS, HOY);
    expect(cli1).toMatchObject({
      porCobrar: { USD: 0, MXN: 6600 },
      vencido: { USD: 0, MXN: 6600 },
      maxDiasVencido: 4,
    });
    expect(cli1?.facturas).toHaveLength(1);

    const cli2 = resumenDeCliente('CLI-2', FACTURAS, PAGOS, HOY);
    expect(cli2).toMatchObject({ porCobrar: { USD: 1000, MXN: 0 }, vencido: { USD: 0, MXN: 0 } });

    expect(resumenDeCliente('CLI-9', FACTURAS, PAGOS, HOY)).toBeNull();
  });
});

// ─── D · El fondeo ───────────────────────────────────────────────────────────

describe('calcularFondeo con la lista unificada', () => {
  const fondeo = calcularFondeo(entradasDeFondeo(PAGOS, 'E1'), ORDENES);

  it('depositado, comprometido y disponible, idénticos', () => {
    expect(fondeo).toEqual({
      depositado: { USD: 0, MXN: 123700 },
      comprometido: { USD: 2000, MXN: 30000 },
      disponible: { USD: -2000, MXN: 93700 },
    });
  });

  it('los dos veredictos de evaluarFondeo no se mueven', () => {
    expect(evaluarFondeo(ORDENES[0], fondeo)).toEqual({ puedeAutorizar: true });
    const usd = evaluarFondeo(ORDENES[1], fondeo);
    expect(usd.puedeAutorizar).toBe(false);
    expect(usd.motivo).toContain('sobregirado en USD 2,000.00');
  });

  it('los 123,700 son 80,000 + 15,000 de depósitos y 28,700 de cobros', () => {
    // El cobro anulado de 9,999 no está, y el de 500 MXN contra la factura en
    // USD sí: fondea en la moneda que entró al banco, como antes.
    expect(80000 + 15000 + 5000 + 23200 + 500).toBe(123700);
  });
});
