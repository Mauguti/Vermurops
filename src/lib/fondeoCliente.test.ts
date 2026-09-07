/**
 * Tests de fondeoCliente.ts (1.1).
 *
 * Fijan las dos reglas que el cliente dictó y que no se pueden relajar:
 * el proveedor se paga con el dinero del cliente, y los impuestos NO se
 * financian ni un peso.
 */

import { describe, it, expect } from 'vitest';
import {
  calcularFondeo, evaluarFondeo, esPagoDeImpuestos, sugerirNoPagar,
  CONCEPTOS_IMPUESTO,
} from './fondeoCliente';
import type { DepositoCliente, OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const deposito = (monto: number, moneda: 'MXN' | 'USD' = 'MXN'): DepositoCliente => ({
  id: `dep-${monto}-${moneda}`,
  embarqueId: 'EMB-1', embarqueFolio: 'VLIM-0001',
  clienteId: 'CLI-1', clienteNombre: 'Cliente',
  monto, moneda,
  fechaDeposito: '2026-09-01', referencia: 'REF', comprobante: null,
  registradoPor: { uid: 'u1', nombre: 'Julio' },
  activo: true, fechaAlta: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
});

const oc = (over: Partial<OrdenCompra> & { esPagoImpuestos?: boolean; noPagar?: boolean } = {}) => ({
  id: 'oc-1', folio: 'OC-2026-0001',
  origen: 'embarque' as const, embarqueId: 'EMB-1', embarqueFolio: 'VLIM-0001',
  clienteId: 'CLI-1', clienteNombre: 'Cliente',
  proveedorId: 'PRV-1', proveedorNombre: 'Naviera',
  conceptoId: 'CON-001', conceptoNombre: 'Ocean Freight',
  descripcion: '', monto: 10000, moneda: 'MXN' as const,
  fechaRequerida: '2026-09-15', fechaSugeridaPago: null,
  urgencia: 'normal' as const, estado: 'en_gestion' as const,
  motivoRechazo: null, historialEstados: [],
  solicitadaPor: null, gestionadaPor: null, autorizadaPor: null, pagadaPor: null,
  cuentaBancariaId: null, bancoSalida: null, cuentaSalida: null,
  facturaAsociada: null, comprobantePago: null,
  esAnticipo: false, anticiposCruzados: [], saldoPendiente: null, montoDisponible: null,
  activo: true, createdAt: '', updatedAt: '',
  ...over,
} as OrdenCompra & { esPagoImpuestos?: boolean; noPagar?: boolean });

const SIN_FONDEO = calcularFondeo([], []);

// ─── A · El cálculo del fondeo ───────────────────────────────────────────────

describe('calcularFondeo', () => {
  it('suma depósitos y compromete las OCs vivas', () => {
    const f = calcularFondeo([deposito(50000)], [oc({ monto: 10000 })]);
    expect(f.depositado.MXN).toBe(50000);
    expect(f.comprometido.MXN).toBe(10000);
    expect(f.disponible.MXN).toBe(40000);
  });

  it('§4.3: los depósitos en MXN no fondean órdenes en USD', () => {
    const f = calcularFondeo([deposito(40000, 'MXN')], [oc({ monto: 2000, moneda: 'USD' })]);
    expect(f.depositado.USD).toBe(0);
    expect(f.disponible.USD).toBe(-2000);
    expect(f.disponible.MXN).toBe(40000);
  });

  it('las pagadas y rechazadas dejan de comprometer', () => {
    const f = calcularFondeo([deposito(50000)], [
      oc({ id: 'a', monto: 10000, estado: 'pagada' }),
      oc({ id: 'b', monto: 5000, estado: 'rechazada' }),
      oc({ id: 'c', monto: 8000, estado: 'autorizada' }),
    ]);
    expect(f.comprometido.MXN).toBe(8000);
  });

  it('un depósito dado de baja no cuenta', () => {
    const f = calcularFondeo([{ ...deposito(50000), activo: false }], []);
    expect(f.depositado.MXN).toBe(0);
  });
});

// ─── B · Impuestos: la regla dura ────────────────────────────────────────────

describe('los impuestos NO se financian', () => {
  it('reconoce los conceptos de impuesto del catálogo', () => {
    expect(esPagoDeImpuestos(oc({ conceptoId: 'CON-010' }))).toBe(true);
    expect(esPagoDeImpuestos(oc({ conceptoId: 'CON-091' }))).toBe(true);
    expect(esPagoDeImpuestos(oc({ conceptoId: 'CON-001' }))).toBe(false);
  });

  it('la marca guardada en la OC gana sobre la lista: corregirla no reescribe la historia', () => {
    expect(esPagoDeImpuestos(oc({ conceptoId: 'CON-001', esPagoImpuestos: true }))).toBe(true);
    expect(esPagoDeImpuestos(oc({ conceptoId: 'CON-010', esPagoImpuestos: false }))).toBe(false);
  });

  it('sin depósito que lo cubra, una OC de impuestos NO se autoriza', () => {
    const v = evaluarFondeo(oc({ conceptoId: 'CON-010', monto: 80000 }), SIN_FONDEO);
    expect(v.puedeAutorizar).toBe(false);
    expect(v.esperandoDepositoImpuestos).toBe(true);
    expect(v.motivo).toContain('no se financian');
  });

  it('un depósito PARCIAL tampoco alcanza: es el monto completo o nada', () => {
    const fondeo = calcularFondeo([deposito(79999)], []);
    expect(evaluarFondeo(oc({ conceptoId: 'CON-010', monto: 80000 }), fondeo).puedeAutorizar).toBe(false);
  });

  it('con el depósito completo, se autoriza', () => {
    const fondeo = calcularFondeo([deposito(80000)], []);
    expect(evaluarFondeo(oc({ conceptoId: 'CON-010', monto: 80000 }), fondeo).puedeAutorizar).toBe(true);
  });

  it('un embarque con mucho fondeo en OTRA moneda no cubre los impuestos', () => {
    const fondeo = calcularFondeo([deposito(100000, 'USD')], []);
    const v = evaluarFondeo(oc({ conceptoId: 'CON-010', monto: 80000, moneda: 'MXN' }), fondeo);
    expect(v.puedeAutorizar).toBe(false);
  });

  it('el catálogo de conceptos-impuesto no está vacío', () => {
    expect(CONCEPTOS_IMPUESTO.size).toBeGreaterThan(0);
  });
});

// ─── C · Gastos normales: crédito sí, sobregiro no ───────────────────────────

describe('los gastos normales sí admiten crédito', () => {
  it('sin depósito pero sin sobregiro, se autoriza', () => {
    // El embarque no tiene depósitos todavía y esta OC es la única: nada
    // sobregirado, porque el crédito de Vermur cubre el hueco.
    const fondeo = calcularFondeo([deposito(10000)], [oc({ monto: 10000 })]);
    expect(evaluarFondeo(oc({ monto: 10000 }), fondeo).puedeAutorizar).toBe(true);
  });

  it('con el embarque sobregirado, no se autoriza y se dice por cuánto', () => {
    const fondeo = calcularFondeo([deposito(5000)], [oc({ monto: 12000 })]);
    const v = evaluarFondeo(oc({ monto: 12000 }), fondeo);
    expect(v.puedeAutorizar).toBe(false);
    expect(v.motivo).toContain('7,000.00');
  });

  it('un gasto de OFICINA no lo fondea ningún cliente: pasa siempre', () => {
    const v = evaluarFondeo(oc({ origen: 'oficina', embarqueId: null, monto: 99999 }), SIN_FONDEO);
    expect(v.puedeAutorizar).toBe(true);
  });
});

// ─── D · El flag «No pagar» ──────────────────────────────────────────────────

describe('el flag «No pagar» gana sobre las cuentas', () => {
  it('bloquea aunque el fondeo sobre', () => {
    const fondeo = calcularFondeo([deposito(999999)], []);
    const v = evaluarFondeo(oc({ noPagar: true }), fondeo);
    expect(v.puedeAutorizar).toBe(false);
    expect(v.bloqueadaPorFlag).toBe(true);
  });

  it('bloquea también los gastos de oficina', () => {
    expect(evaluarFondeo(oc({ origen: 'oficina', noPagar: true }), SIN_FONDEO).puedeAutorizar).toBe(false);
  });

  it('se sugiere para impuestos sin depósito, y no para lo demás', () => {
    expect(sugerirNoPagar(oc({ conceptoId: 'CON-010', monto: 80000 }), SIN_FONDEO)).toBe(true);
    expect(sugerirNoPagar(oc({ conceptoId: 'CON-001', monto: 80000 }), SIN_FONDEO)).toBe(false);
    const conDeposito = calcularFondeo([deposito(80000)], []);
    expect(sugerirNoPagar(oc({ conceptoId: 'CON-010', monto: 80000 }), conDeposito)).toBe(false);
  });
});
