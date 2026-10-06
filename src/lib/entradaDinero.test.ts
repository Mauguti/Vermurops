/**
 * entradaDinero.test.ts — tarea 69 · P3, bloque 1
 */

import { describe, it, expect } from 'vitest';
import {
  embarquesFondeables, problemaAnticipo, entradasDelEmbarque,
  AVISO_COBRO_EN_COBRANZA,
} from './entradaDinero';
import { pagoDesdeCobro, pagoDesdeDeposito, type Pago } from './pagos';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import type { CobroCliente } from '../components/facturas/FacturasData';
import type { DepositoCliente } from '../components/ordenesCompra/OrdenesCompraData';
import {
  puedeMarcarNoPagar, puedeLiberarNoPagar, puede,
} from '../auth/permisos';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const oc = (p: Partial<OrdenCompra> & { id: string }): OrdenCompra => ({
  id: p.id,
  folio: p.folio ?? `OC-2026-${p.id}`,
  origen: 'embarque',
  embarqueId: 'E1',
  embarqueFolio: 'VLIM-26-001',
  clienteId: 'CLI-1',
  clienteNombre: 'GRUPO FIBREMEX',
  proveedorId: 'PRV-1',
  proveedorNombre: 'HAPAG LLOYD A G',
  conceptoId: 'CON-1',
  conceptoNombre: 'Flete internacional',
  monto: 1000,
  moneda: 'USD',
  estado: 'solicitada',
  solicitadaPor: { uid: 'u1', nombre: 'Ops' },
  fechaSolicitud: '2026-10-01',
  createdAt: '2026-10-01',
  updatedAt: '2026-10-01',
  ...p,
} as OrdenCompra);

const cobro = (p: Partial<CobroCliente> & { id: string }): CobroCliente => ({
  id: p.id,
  facturaId: 'F1',
  facturaNumero: 'F-2026-0145',
  embarqueId: 'E1',
  embarqueFolio: 'VLIM-26-001',
  clienteId: 'CLI-1',
  clienteNombre: 'GRUPO FIBREMEX',
  monto: 5000,
  moneda: 'MXN',
  fechaCobro: '2026-10-03',
  banco: 'BBVA',
  referencia: 'SPEI-1',
  activo: true,
  registradoPor: { uid: 'u2', nombre: 'Admin' },
  createdAt: '2026-10-03',
  updatedAt: '2026-10-03',
  ...p,
} as CobroCliente);

const deposito = (p: Partial<DepositoCliente> & { id: string }): DepositoCliente => ({
  id: p.id,
  embarqueId: 'E1',
  embarqueFolio: 'VLIM-26-001',
  clienteId: 'CLI-1',
  clienteNombre: 'GRUPO FIBREMEX',
  monto: 20000,
  moneda: 'MXN',
  fechaDeposito: '2026-10-01',
  referencia: null,
  comprobante: null,
  activo: true,
  registradoPor: { uid: 'u2', nombre: 'Admin' },
  fechaAlta: '2026-10-01',
  updatedAt: '2026-10-01',
  ...p,
} as DepositoCliente);

// ─── A · A qué embarque se le puede anticipar ───────────────────────────────

describe('embarquesFondeables', () => {
  it('agrupa las órdenes abiertas de un embarque en un solo destino', () => {
    const r = embarquesFondeables([
      oc({ id: '1', monto: 1500, moneda: 'USD' }),
      oc({ id: '2', monto: 200, moneda: 'USD' }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].embarqueFolio).toBe('VLIM-26-001');
    expect(r[0].ordenesAbiertas).toBe(2);
    expect(r[0].comprometido).toEqual({ USD: 1700, MXN: 0 });
  });

  it('separa el comprometido POR MONEDA, nunca en un escalar (§4.3)', () => {
    const r = embarquesFondeables([
      oc({ id: '1', monto: 2000, moneda: 'USD' }),
      oc({ id: '2', monto: 40000, moneda: 'MXN' }),
    ]);
    // 2,000 USD + 40,000 MXN no son 42,000 de nada.
    expect(r[0].comprometido).toEqual({ USD: 2000, MXN: 40000 });
  });

  it('una orden pagada o rechazada ya no espera dinero', () => {
    expect(embarquesFondeables([
      oc({ id: '1', estado: 'pagada' }),
      oc({ id: '2', estado: 'rechazada' }),
    ])).toEqual([]);
  });

  it('un gasto de oficina no entra: no hay cliente que anticipe', () => {
    expect(embarquesFondeables([
      oc({ id: '1', origen: 'oficina', embarqueId: null, clienteId: null }),
    ])).toEqual([]);
  });

  it('una orden sin embarqueId no entra, aunque diga que viene de un embarque', () => {
    // Sin el id el depósito no se podría ligar y el fondeo nunca lo vería.
    expect(embarquesFondeables([oc({ id: '1', embarqueId: null })])).toEqual([]);
  });

  it('completa el nombre del cliente con la primera orden que lo traiga', () => {
    const r = embarquesFondeables([
      oc({ id: '1', clienteId: null, clienteNombre: null }),
      oc({ id: '2' }),
    ]);
    expect(r[0].clienteNombre).toBe('GRUPO FIBREMEX');
    expect(r[0].clienteId).toBe('CLI-1');
  });

  it('cae al id del embarque cuando no hay folio, en vez de dejar el renglón vacío', () => {
    const r = embarquesFondeables([oc({ id: '1', embarqueFolio: null })]);
    expect(r[0].embarqueFolio).toBe('E1');
  });

  it('ordena por folio y lista varios embarques', () => {
    const r = embarquesFondeables([
      oc({ id: '1', embarqueId: 'E2', embarqueFolio: 'VLEM-26-009' }),
      oc({ id: '2', embarqueId: 'E1', embarqueFolio: 'VLIM-26-001' }),
    ]);
    expect(r.map(x => x.embarqueFolio)).toEqual(['VLEM-26-009', 'VLIM-26-001']);
  });
});

// ─── B · Qué falta para guardar ────────────────────────────────────────────

describe('problemaAnticipo', () => {
  const ok = { embarqueId: 'E1', monto: 5000, moneda: 'MXN' as const, fecha: '2026-10-05' };

  it('con embarque, moneda, monto y fecha se puede guardar', () => {
    expect(problemaAnticipo(ok)).toBeNull();
  });

  it('LA REFERENCIA NO ES OBLIGATORIA: llega después del pago (punto 2)', () => {
    // El formulario de la ficha de la OC la exigía, así que no se podía
    // capturar la entrada sin inventar una. Una referencia inventada se ve
    // igual que una real y descuadra la conciliación sin avisar.
    expect(problemaAnticipo(ok)).toBeNull();
  });

  it('sin embarque no se guarda: el anticipo no fondearía nada', () => {
    expect(problemaAnticipo({ ...ok, embarqueId: '' })).toMatch(/embarque/i);
  });

  it('sin moneda no se guarda: antes se heredaba de la orden (§10.1)', () => {
    expect(problemaAnticipo({ ...ok, moneda: '' })).toMatch(/moneda/i);
  });

  it('monto cero, negativo o NaN no se guardan', () => {
    expect(problemaAnticipo({ ...ok, monto: 0 })).toMatch(/cuánto/i);
    expect(problemaAnticipo({ ...ok, monto: -1 })).toMatch(/cuánto/i);
    expect(problemaAnticipo({ ...ok, monto: Number.NaN })).toMatch(/cuánto/i);
  });

  it('sin fecha no se guarda', () => {
    expect(problemaAnticipo({ ...ok, fecha: '' })).toMatch(/fecha/i);
  });
});

// ─── C · Lo que ya entró, para el panel de solo lectura ────────────────────

describe('entradasDelEmbarque', () => {
  it('lee igual un cobro viejo y un depósito viejo (lista unificada de la 67)', () => {
    const pagos = [pagoDesdeCobro(cobro({ id: 'C1' })), pagoDesdeDeposito(deposito({ id: 'D1' }))];
    const r = entradasDelEmbarque(pagos, 'E1');
    expect(r).toHaveLength(2);
    // El cobro dice contra qué factura entró; el anticipo no tiene a qué.
    expect(r.find(x => x.pagoId === 'C1')!.aplicadoA).toEqual(['F-2026-0145']);
    expect(r.find(x => x.pagoId === 'D1')!.aplicadoA).toEqual([]);
  });

  it('la más reciente primero', () => {
    const r = entradasDelEmbarque([
      pagoDesdeDeposito(deposito({ id: 'D1', fechaDeposito: '2026-09-01' })),
      pagoDesdeCobro(cobro({ id: 'C1', fechaCobro: '2026-10-03' })),
    ], 'E1');
    expect(r.map(x => x.pagoId)).toEqual(['C1', 'D1']);
  });

  it('un pago anulado no se lista: el panel contesta «cuánto hay», no «qué se capturó»', () => {
    const r = entradasDelEmbarque([pagoDesdeCobro(cobro({ id: 'C1', activo: false }))], 'E1');
    expect(r).toEqual([]);
  });

  it('solo los de ESE embarque', () => {
    const r = entradasDelEmbarque([
      pagoDesdeCobro(cobro({ id: 'C1' })),
      pagoDesdeCobro(cobro({ id: 'C2', embarqueId: 'E9' })),
    ], 'E1');
    expect(r.map(x => x.pagoId)).toEqual(['C1']);
  });

  it('un embarqueId vacío no devuelve todo', () => {
    expect(entradasDelEmbarque([pagoDesdeCobro(cobro({ id: 'C1' }))], '')).toEqual([]);
  });

  it('un pago del lado proveedor nunca fondea al cliente', () => {
    const pagoProveedor: Pago = { ...pagoDesdeCobro(cobro({ id: 'C1' })), lado: 'proveedor' };
    expect(entradasDelEmbarque([pagoProveedor], 'E1')).toEqual([]);
  });

  it('la referencia puede ser null: un depósito sin referencia es válido', () => {
    const r = entradasDelEmbarque([pagoDesdeDeposito(deposito({ id: 'D1', referencia: null }))], 'E1');
    expect(r[0].referencia).toBeNull();
  });
});

// ─── D · Permisos: quién cobra y la asimetría de «No pagar» ────────────────

describe('cobro.registrar', () => {
  it('la cobranza es de Administración y de admin', () => {
    expect(puede('administracion', 'cobro.registrar')).toBe(true);
    expect(puede('admin', 'cobro.registrar')).toBe(true);
  });

  it('OPERACIONES YA NO COBRA, aunque siga facturando', () => {
    // Gaby: «quien recibe el dinero del cliente es Administración».
    // Es lo único que esta tarea QUITA de lo que hoy funciona.
    expect(puede('operaciones', 'cobro.registrar')).toBe(false);
    expect(puede('operaciones', 'factura.generar')).toBe(true);
  });

  it('ni Ventas ni Pricing tocan la entrada de dinero', () => {
    expect(puede('ventas', 'cobro.registrar')).toBe(false);
    expect(puede('pricing', 'cobro.registrar')).toBe(false);
  });
});

describe('«No pagar»: marcar y liberar no son el mismo acto', () => {
  it('Operaciones puede MARCAR: es quien sabe que el cliente no fondeó', () => {
    expect(puedeMarcarNoPagar('operaciones')).toBe(true);
  });

  it('Operaciones NO puede LIBERAR: eso es decidir que el dinero está', () => {
    expect(puedeLiberarNoPagar('operaciones')).toBe(false);
  });

  it('Administración y admin pueden las dos', () => {
    for (const rol of ['administracion', 'admin'] as const) {
      expect(puedeMarcarNoPagar(rol)).toBe(true);
      expect(puedeLiberarNoPagar(rol)).toBe(true);
    }
  });

  it('Ventas y Pricing, ninguna de las dos', () => {
    for (const rol of ['ventas', 'pricing'] as const) {
      expect(puedeMarcarNoPagar(rol)).toBe(false);
      expect(puedeLiberarNoPagar(rol)).toBe(false);
    }
  });

  it('sin sesión, nada', () => {
    expect(puedeMarcarNoPagar(undefined)).toBe(false);
    expect(puedeLiberarNoPagar(null)).toBe(false);
  });
});

describe('AVISO_COBRO_EN_COBRANZA', () => {
  it('dice quién lo hace y dónde, no solo que ya no está aquí', () => {
    expect(AVISO_COBRO_EN_COBRANZA).toContain('Administración');
    expect(AVISO_COBRO_EN_COBRANZA).toContain('Cuentas por cobrar');
  });
});
