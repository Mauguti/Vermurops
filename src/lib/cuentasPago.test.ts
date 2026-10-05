/**
 * Tests de cuentasPago.ts (1.2).
 *
 * La segmentación bancaria de Vermur y la cuenta del proveedor por concepto.
 * Lo que más importa aquí: que con dos cuentas buenas NO se elija una al
 * azar — el default silencioso manda el dinero a la equivocada la mitad de
 * las veces, y nadie revisa lo que ya venía llenado.
 */

import { describe, it, expect } from 'vitest';
import {
  sugerirBancoVermur, sugerirCuentaProveedor, BANCOS_VERMUR,
  BANCO_COBRO_DEFAULT, resolverBancoVermur, opcionesBanco,
} from './cuentasPago';
import type { CuentaBancariaProveedor } from '../components/proveedores/ProveedoresData';

const oc = (over: Partial<Parameters<typeof sugerirBancoVermur>[0]> = {}) => ({
  moneda: 'MXN' as const, monto: 10000,
  conceptoId: 'CON-001', conceptoNombre: 'Ocean Freight',
  ...over,
});

const cuenta = (over: Partial<CuentaBancariaProveedor> = {}): CuentaBancariaProveedor => ({
  id: over.id ?? 'cta-1', banco: 'BBVA', clabe: '012'.padEnd(18, '0'),
  numeroCuenta: '123456', moneda: 'MXN', swift: null,
  conceptoAsociadoId: null, activo: true,
  ...over,
});

// ─── A · El banco de Vermur ──────────────────────────────────────────────────

describe('sugerirBancoVermur — la segmentación de Vermur', () => {
  it('proveedor en pesos → Santander gastos', () => {
    expect(sugerirBancoVermur(oc()).banco).toBe('santander_gastos');
  });

  it('impuestos → Santander impuestos, aunque sean aduanales', () => {
    expect(sugerirBancoVermur(oc({ conceptoId: 'CON-010', conceptoNombre: 'Pat - Taxes' })).banco)
      .toBe('santander_impuestos');
  });

  it('gasto aduanal → Banorte', () => {
    expect(sugerirBancoVermur(oc({ conceptoNombre: 'Customs Clearance' }), { categoriaConcepto: 'despacho' }).banco)
      .toBe('banorte');
  });

  it('garantía → Banorte', () => {
    expect(sugerirBancoVermur(oc({ conceptoNombre: 'Depósito en garantía contenedor' })).banco)
      .toBe('banorte');
  });

  it('dólares a un proveedor cualquiera → Monex dólares', () => {
    expect(sugerirBancoVermur(oc({ moneda: 'USD', monto: 500 })).banco).toBe('monex_usd');
  });

  it('dólares a un AGENTE de carga → PartnerPay', () => {
    const s = sugerirBancoVermur(oc({ moneda: 'USD', monto: 500 }), { tiposProveedor: ['agente_carga'] });
    expect(s.banco).toBe('partnerpay');
  });

  it('el mínimo de 80 se respeta: por debajo cae a Monex y lo avisa', () => {
    const s = sugerirBancoVermur(oc({ moneda: 'USD', monto: 50 }), { tiposProveedor: ['agente_carga'] });
    expect(s.banco).toBe('monex_usd');
    expect(s.aviso).toContain('80');
  });

  it('exactamente 80 sí entra a PartnerPay: el mínimo incluye el mínimo', () => {
    expect(sugerirBancoVermur(oc({ moneda: 'USD', monto: 80 }), { tiposProveedor: ['agente_carga'] }).banco)
      .toBe('partnerpay');
  });

  it('cada banco declara las monedas que opera', () => {
    for (const b of BANCOS_VERMUR) expect(b.monedas.length).toBeGreaterThan(0);
  });

  /*
   * Tarea 57 · Son SIETE cuentas reales y cada una se concilia aparte. El
   * test cuenta y nombra: si alguien quita una, la conciliación del mes de
   * Julio pierde un renglón y aquí se cae antes de llegar a producción.
   */
  it('son las siete cuentas de Vermur, con su uso escrito', () => {
    expect(BANCOS_VERMUR.map(b => b.id)).toEqual([
      'santander_gastos', 'santander_impuestos', 'bbva', 'banorte',
      'monex_mxn', 'monex_usd', 'partnerpay',
    ]);
    for (const b of BANCOS_VERMUR) expect(b.usoHabitual.trim().length).toBeGreaterThan(10);
  });

  it('BBVA y Monex pesos nunca se sugieren: uno recibe y del otro no hay criterio', () => {
    const casos: Parameters<typeof sugerirBancoVermur>[0][] = [
      oc(),
      oc({ conceptoId: 'CON-010', conceptoNombre: 'Pat - Taxes' }),
      oc({ conceptoNombre: 'Depósito en garantía contenedor' }),
      oc({ conceptoNombre: 'Customs Clearance' }),
      oc({ moneda: 'USD', monto: 500 }),
    ];
    for (const c of casos) {
      expect(['bbva', 'monex_mxn']).not.toContain(sugerirBancoVermur(c).banco);
    }
  });

  it('el cobro arranca en la cuenta que recibe, no en una de salida', () => {
    expect(BANCO_COBRO_DEFAULT.id).toBe('bbva');
  });
});

// ─── A2 · Los ids viejos se leen, no se migran (tarea 57) ───────────────────

describe('resolverBancoVermur y opcionesBanco — el registro viejo', () => {
  it('«santander» se lee como la cuenta de gastos', () => {
    expect(resolverBancoVermur('santander')?.id).toBe('santander_gastos');
  });

  it('«monex» se lee como la de dólares: era la única que había', () => {
    expect(resolverBancoVermur('monex')?.id).toBe('monex_usd');
  });

  it('un id de hoy se resuelve directo, y uno desconocido devuelve null', () => {
    expect(resolverBancoVermur('partnerpay')?.id).toBe('partnerpay');
    expect(resolverBancoVermur('scotiabank')).toBeNull();
    expect(resolverBancoVermur(null)).toBeNull();
  });

  it('sin valor guardado, el selector ofrece exactamente las siete', () => {
    expect(opcionesBanco(null)).toHaveLength(BANCOS_VERMUR.length);
    expect(opcionesBanco('banorte')).toHaveLength(BANCOS_VERMUR.length);
  });

  it('un id viejo se agrega como opción para que el selector lo muestre', () => {
    const ops = opcionesBanco('santander');
    expect(ops).toHaveLength(BANCOS_VERMUR.length + 1);
    const extra = ops[ops.length - 1];
    expect(extra.valor).toBe('santander');
    expect(extra.fueraDeLista).toBe(true);
    expect(extra.nombre).toContain('Santander gastos');
  });

  it('un banco que nunca existió también se conserva, con su nombre crudo', () => {
    const ops = opcionesBanco('scotiabank');
    const extra = ops[ops.length - 1];
    expect(extra.nombre).toBe('scotiabank');
    expect(extra.fueraDeLista).toBe(true);
    // Sin moneda conocida no se puede deshabilitar por moneda.
    expect(extra.monedas).toEqual(['MXN', 'USD']);
  });
});

// ─── B · La cuenta del proveedor ─────────────────────────────────────────────

describe('sugerirCuentaProveedor', () => {
  it('la cuenta declarada para ESE concepto gana', () => {
    const especifica = cuenta({ id: 'cta-demoras', conceptoAsociadoId: 'CON-043' });
    const s = sugerirCuentaProveedor(
      { cuentasBancarias: [cuenta({ id: 'cta-gral' }), especifica] },
      { conceptoId: 'CON-043', moneda: 'MXN' },
    );
    expect(s.cuenta?.id).toBe('cta-demoras');
    expect(s.razon).toContain('declaró para este concepto');
  });

  it('con una sola cuenta en la moneda, esa es', () => {
    const s = sugerirCuentaProveedor({ cuentasBancarias: [cuenta({ id: 'unica' })] }, { conceptoId: 'CON-001', moneda: 'MXN' });
    expect(s.cuenta?.id).toBe('unica');
  });

  it('con VARIAS sin declarar concepto, no elige: pide elegir', () => {
    const s = sugerirCuentaProveedor(
      { cuentasBancarias: [cuenta({ id: 'a' }), cuenta({ id: 'b' })] },
      { conceptoId: 'CON-001', moneda: 'MXN' },
    );
    expect(s.cuenta).toBeNull();
    expect(s.alternativas).toHaveLength(2);
    expect(s.aviso).toContain('Elige');
  });

  it('las cuentas inactivas no se ofrecen', () => {
    const s = sugerirCuentaProveedor(
      { cuentasBancarias: [cuenta({ id: 'viva' }), cuenta({ id: 'muerta', activo: false })] },
      { conceptoId: 'CON-001', moneda: 'MXN' },
    );
    expect(s.cuenta?.id).toBe('viva');
  });

  it('sin cuenta en la moneda de la orden, avisa en vez de usar la de otra', () => {
    const s = sugerirCuentaProveedor(
      { cuentasBancarias: [cuenta({ id: 'mxn', moneda: 'MXN' })] },
      { conceptoId: 'CON-001', moneda: 'USD' },
    );
    expect(s.cuenta).toBeNull();
    expect(s.razon).toContain('no tiene cuenta en USD');
    expect(s.alternativas).toHaveLength(1);
  });

  it('sin cuentas registradas dice qué hacer', () => {
    const s = sugerirCuentaProveedor({ cuentasBancarias: [] }, { conceptoId: 'CON-001', moneda: 'MXN' });
    expect(s.cuenta).toBeNull();
    expect(s.aviso).toContain('ficha');
  });

  it('un proveedor ausente no truena', () => {
    expect(sugerirCuentaProveedor(null, { conceptoId: 'CON-001', moneda: 'MXN' }).cuenta).toBeNull();
  });
});
