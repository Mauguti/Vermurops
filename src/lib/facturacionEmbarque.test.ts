/**
 * Tests de facturacionEmbarque.ts (2.1).
 *
 * Vermur no tiene PAC: esto registra facturas ya emitidas. Lo que se fija
 * aquí es que el IVA se DERIVE (§4.2) y que cuando no se pueda derivar se
 * diga, en vez de inventar una tasa que se ve idéntica a una correcta.
 */

import { describe, it, expect } from 'vitest';
import {
  lineaDeFactura, proponerFactura, diasCreditoDe, vencimientoFactura, saldoDeFactura,
} from './facturacionEmbarque';
import type { CargoDetalle } from '../components/shipments/EmbarquesData';
import type { ConceptoVermur } from '../components/conceptos/ConceptosData';
import { mapearLineasAEmbarque } from './cotizacionAEmbarque';

const concepto = (over: Partial<ConceptoVermur> = {}): ConceptoVermur => ({
  id: 'CON-001', idSemantico: 'ocean_freight', nombre: 'Ocean Freight',
  categoria: 'flete', activo: true,
  aplicaImpo: true, aplicaExpo: true, aplicaOrigen: true, aplicaDestino: true,
  tieneVenta: true, tieneCosto: true,
  reglaIVA: 'espejo', monedaDefault: 'USD',
  ...over,
} as ConceptoVermur);

const cargo = (over: Partial<CargoDetalle> = {}): CargoDetalle => ({
  id: 'c1', concepto: 'Ocean Freight', tipo: 'ingreso', monto: 1000, moneda: 'MXN',
  conceptoId: 'CON-001', ubicacionIVA: 'destino', facturaId: null,
  ...over,
});

const CATALOGO = [
  concepto(),
  concepto({ id: 'CON-EXENTO', nombre: 'Seguro', reglaIVA: 'exento' }),
  concepto({ id: 'CON-REVISAR', nombre: 'Otros', reglaIVA: 'revisar' }),
];

const ctx = { trafico: 'impo' as const, conceptos: CATALOGO };

// ─── A · El IVA se deriva ────────────────────────────────────────────────────

describe('lineaDeFactura — el IVA se deriva, no se captura', () => {
  it('impo + destino ocurre en México: 16%', () => {
    const l = lineaDeFactura(cargo({ monto: 1000 }), ctx);
    expect(l.tasaIVA).toBe(16);
    expect(l.montoIVA).toBe(160);
    expect(l.avisoIVA).toBeUndefined();
  });

  it('impo + origen ocurre fuera: 0%', () => {
    const l = lineaDeFactura(cargo({ ubicacionIVA: 'origen' }), ctx);
    expect(l.tasaIVA).toBe(0);
    expect(l.montoIVA).toBe(0);
  });

  it('expo + origen ocurre en México: 16%', () => {
    const l = lineaDeFactura(cargo({ ubicacionIVA: 'origen' }), { ...ctx, trafico: 'expo' });
    expect(l.tasaIVA).toBe(16);
  });

  it('un concepto exento va en cero sin aviso: es una regla, no una falta', () => {
    const l = lineaDeFactura(cargo({ conceptoId: 'CON-EXENTO' }), ctx);
    expect(l.tasaIVA).toBe(0);
    expect(l.avisoIVA).toBeUndefined();
  });
});

// ─── B · Cuando NO se puede derivar, se dice ─────────────────────────────────

describe('sin datos para derivar, se avisa en vez de inventar', () => {
  it('sin ubicación: tasa 0 y aviso que pide comparar contra la factura', () => {
    const l = lineaDeFactura(cargo({ ubicacionIVA: undefined }), ctx);
    expect(l.tasaIVA).toBe(0);
    expect(l.avisoIVA).toContain('origen o en destino');
  });

  it('sin tráfico del embarque, tampoco se asume', () => {
    const l = lineaDeFactura(cargo(), { ...ctx, trafico: null });
    expect(l.avisoIVA).toContain('tráfico');
  });

  it('una línea fuera del catálogo lo dice', () => {
    const l = lineaDeFactura(cargo({ conceptoId: undefined }), ctx);
    expect(l.avisoIVA).toContain('catálogo');
  });

  it('la regla «revisar» exige capturarlo a mano y lo nombra', () => {
    const l = lineaDeFactura(cargo({ conceptoId: 'CON-REVISAR' }), ctx);
    expect(l.avisoIVA).toContain('Otros');
  });
});

// ─── C · La propuesta de factura ─────────────────────────────────────────────

describe('proponerFactura', () => {
  it('suma subtotal, IVA y total', () => {
    const r = proponerFactura([cargo({ id: 'a', monto: 1000 }), cargo({ id: 'b', monto: 500 })], ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.propuesta.subtotal).toBe(1500);
    expect(r.propuesta.iva).toBe(240);
    expect(r.propuesta.total).toBe(1740);
  });

  it('§4.3: se niega a mezclar monedas en una factura', () => {
    const r = proponerFactura([cargo({ id: 'a', moneda: 'MXN' }), cargo({ id: 'b', moneda: 'USD' })], ctx);
    expect(r.ok).toBe(false);
    expect('error' in r ? r.error : '').toContain('una sola moneda');
  });

  it('sin líneas facturables, lo dice', () => {
    const r = proponerFactura([], ctx);
    expect(r.ok).toBe(false);
  });

  it('avisa cuántas líneas quedaron sin IVA derivado', () => {
    const r = proponerFactura([cargo({ id: 'a' }), cargo({ id: 'b', ubicacionIVA: undefined })], ctx);
    if (!r.ok) return;
    expect(r.propuesta.avisos[0]).toContain('1 de 2');
  });

  it('la retención se RESTA del total: es impuesto que entera el cliente', () => {
    const conRetencion = concepto({ id: 'CON-TERR', nombre: 'Flete terrestre', reglaIVA: 'terrestre_retencion' });
    const r = proponerFactura(
      [cargo({ conceptoId: 'CON-TERR', monto: 1000 })],
      { ...ctx, conceptos: [...CATALOGO, conRetencion] },
    );
    if (!r.ok) return;
    expect(r.propuesta.retencion).toBe(40);          // 4%
    expect(r.propuesta.total).toBe(1000 + 160 - 40); // 1,120
  });
});

// ─── D · Crédito y vencimiento ───────────────────────────────────────────────

describe('el crédito del cliente es POR MODALIDAD (§4.6)', () => {
  const credito = { maritimo: 45, terrestre: 15, aereo: 20, general: 30 };

  it('usa el desglose de la modalidad del embarque', () => {
    expect(diasCreditoDe(credito, 'maritimo')).toBe(45);
    expect(diasCreditoDe(credito, 'terrestre')).toBe(15);
    expect(diasCreditoDe(credito, 'aereo')).toBe(20);
  });

  it('cae al general cuando la modalidad no está desglosada', () => {
    expect(diasCreditoDe({ general: 30 }, 'maritimo')).toBe(30);
  });

  it('sin crédito conocido es contado, no un plazo inventado', () => {
    expect(diasCreditoDe(null, 'maritimo')).toBe(0);
  });

  it('el vencimiento cuenta días naturales y aterriza en hábil', () => {
    // 30 días desde el 13-ago-2026 = 12-sep, sábado → lunes 14
    expect(vencimientoFactura('2026-08-13', 30)).toBe('2026-09-14');
  });
});

// ─── E · Saldo ───────────────────────────────────────────────────────────────

describe('saldoDeFactura — se deriva de los cobros', () => {
  const factura = { total: 10000, estado: 'emitida' as const, moneda: 'MXN' as const };

  it('sin cobros, se debe todo', () => {
    expect(saldoDeFactura(factura, [])).toMatchObject({ cobrado: 0, saldo: 10000, estado: 'emitida' });
  });

  it('un cobro parcial deja la factura en cobrada_parcial', () => {
    expect(saldoDeFactura(factura, [{ monto: 4000 }]))
      .toMatchObject({ cobrado: 4000, saldo: 6000, estado: 'cobrada_parcial' });
  });

  it('varios cobros que suman el total la cierran', () => {
    expect(saldoDeFactura(factura, [{ monto: 4000 }, { monto: 6000 }]).estado).toBe('cobrada');
  });

  it('un cobro ANULADO deja de contar: por eso se deriva', () => {
    const s = saldoDeFactura(factura, [{ monto: 10000, activo: false }]);
    expect(s.cobrado).toBe(0);
    expect(s.estado).toBe('emitida');
  });

  it('un peso de diferencia por redondeo no deja la factura abierta', () => {
    expect(saldoDeFactura(factura, [{ monto: 9999.5 }]).estado).toBe('cobrada');
  });

  it('§4.3: un cobro en OTRA moneda no liquida la factura, y se avisa', () => {
    const s = saldoDeFactura(factura, [{ monto: 10000, moneda: 'USD' }]);
    expect(s.cobrado).toBe(0);
    expect(s.estado).toBe('emitida');
    expect(s.avisoMoneda).toContain('otra moneda');
  });

  it('un cobro sin moneda se asume de la factura (cobros anteriores al campo)', () => {
    expect(saldoDeFactura(factura, [{ monto: 10000 }]).estado).toBe('cobrada');
  });

  it('una factura cancelada lo sigue estando aunque tenga cobros', () => {
    expect(saldoDeFactura({ total: 10000, estado: 'cancelada', moneda: 'MXN' }, [{ monto: 10000 }]).estado)
      .toBe('cancelada');
  });
});

// ─── F · El tráfico sale del folio, no de un campo duplicado ─────────────────

import { traficoDeFolio } from './facturacionEmbarque';

describe('traficoDeFolio', () => {
  it('lee el tráfico de las series reales', () => {
    expect(traficoDeFolio('VLIM-0001')).toBe('impo');
    expect(traficoDeFolio('VLEM-0001')).toBe('expo');
    expect(traficoDeFolio('VLIT-0042')).toBe('impo');
    expect(traficoDeFolio('VLET-0042')).toBe('expo');
  });

  it('la serie provisional no dice el tráfico: null, no una suposición', () => {
    expect(traficoDeFolio('VL-0001')).toBeNull();
    expect(traficoDeFolio('SHP-0001')).toBeNull();
    expect(traficoDeFolio('')).toBeNull();
  });
});

// ─── La tasa que Pricing eligió manda sobre lo derivado ──────────────────────

describe('lineaDeFactura — la tasa elegida en la cotización', () => {
  it('«revisar» + IVA 16% elegido a mano: se factura al 16, no en cero', () => {
    /*
     * El bug que motivó el arreglo: el bloque 3 escribía la elección y la
     * heredaba al embarque, y aquí nadie la leía. Una línea con concepto
     * «revisar» donde Pricing puso 16% se facturaba en CERO con aviso — la
     * decisión se tomaba y la factura la ignoraba.
     */
    const l = lineaDeFactura(
      cargo({ conceptoId: 'CON-REVISAR', monto: 1000, impuesto: 'iva16' }), ctx,
    );
    expect(l.tasaIVA).toBe(16);
    expect(l.montoIVA).toBe(160);
    expect(l.avisoIVA).toBeUndefined();
  });

  it('manda sobre la regla del catálogo, no solo sobre «revisar»', () => {
    // El seguro es exento; este cliente lo pidió con IVA.
    const l = lineaDeFactura(
      cargo({ conceptoId: 'CON-EXENTO', monto: 1000, impuesto: 'iva16' }), ctx,
    );
    expect(l.tasaIVA).toBe(16);
    expect(l.montoIVA).toBe(160);
  });

  it('IVA 0% elegido a mano da cero SIN aviso: es una decisión, no un hueco', () => {
    const l = lineaDeFactura(cargo({ monto: 1000, impuesto: 'iva0' }), ctx);
    expect(l.tasaIVA).toBe(0);
    expect(l.montoIVA).toBe(0);
    expect(l.avisoIVA).toBeUndefined();
  });

  it('«exento» conserva por qué es cero: no es lo mismo que tasa cero', () => {
    const l = lineaDeFactura(cargo({ monto: 1000, impuesto: 'exento' }), ctx);
    expect(l.montoIVA).toBe(0);
    expect(l.avisoIVA).toMatch(/fuera del objeto/i);
  });

  it('sin elección, se sigue derivando como antes', () => {
    expect(lineaDeFactura(cargo({ monto: 1000 }), ctx).tasaIVA).toBe(16);
  });

  it('sin elección y con concepto «revisar», sigue el aviso y NO se asume tasa', () => {
    const l = lineaDeFactura(cargo({ conceptoId: 'CON-REVISAR', monto: 1000 }), ctx);
    expect(l.tasaIVA).toBe(0);
    expect(l.montoIVA).toBe(0);
    expect(l.avisoIVA).toMatch(/revisar/i);
  });

  it('la elección funciona aunque el embarque no declare tráfico ni ubicación', () => {
    // Es una decisión de Pricing, no una derivación: no necesita el contexto.
    const l = lineaDeFactura(
      cargo({ monto: 1000, impuesto: 'iva16', ubicacionIVA: undefined }),
      { trafico: null, conceptos: CATALOGO },
    );
    expect(l.tasaIVA).toBe(16);
  });
});

// ─── El caso completo: cotización → embarque → factura ───────────────────────

describe('un concepto de destino en un servicio marcado «origen» llega al 16%', () => {
  /*
   * El bug fiscal, de punta a punta. La ubicación vivía SOLO en el servicio,
   * así que un marítimo de importación marcado «origen» ponía en 0% también
   * sus conceptos de destino — y ese 0% viajaba al cargo del embarque por
   * `ubicacionIVA` y de ahí a la factura.
   */
  const LINEA = {
    id: 'L1', servicioId: 'S1', servicioTipo: 'maritimo',
    concepto: 'Maniobras en destino', conceptoId: 'CON-DEST', conceptoLocalId: 'c1',
    proveedorNombre: 'X', moneda: 'MXN', costo: 1000, profit: 0, venta: 1000,
    margen: 0, costoDerivado: false, tarifasOficiales: 0, costos: [],
    costoCapturado: true,
    /** El SERVICIO dice origen. El concepto, no. */
    ubicacion: 'origen' as const,
  };

  const CATALOGO_DEST = [
    concepto({ id: 'CON-DEST', nombre: 'Maniobras en destino', reglaIVA: 'espejo' }),
  ];

  it('el cargo del embarque nace con ubicación destino', () => {
    const { cargos } = mapearLineasAEmbarque([LINEA as never], 'COT-1', {
      conceptos: [{ id: 'CON-DEST', aplicaOrigen: false, aplicaDestino: true }],
    });
    expect(cargos.find(c => c.tipo === 'ingreso')!.ubicacionIVA).toBe('destino');
  });

  it('y la factura lo cobra al 16%, no en cero', () => {
    const { cargos } = mapearLineasAEmbarque([LINEA as never], 'COT-1', {
      conceptos: [{ id: 'CON-DEST', aplicaOrigen: false, aplicaDestino: true }],
    });
    const ingreso = cargos.find(c => c.tipo === 'ingreso')!;
    const l = lineaDeFactura(ingreso, { trafico: 'impo', conceptos: CATALOGO_DEST });
    expect(l.tasaIVA).toBe(16);
    expect(l.montoIVA).toBe(160);
    expect(l.avisoIVA).toBeUndefined();
  });

  it('sin el catálogo en el mapeo, seguiría saliendo en cero', () => {
    // Es la regresión que hay que evitar: el arreglo depende de que Embarques
    // le pase los conceptos al mapeo.
    const { cargos } = mapearLineasAEmbarque([LINEA as never], 'COT-1');
    const ingreso = cargos.find(c => c.tipo === 'ingreso')!;
    const l = lineaDeFactura(ingreso, { trafico: 'impo', conceptos: CATALOGO_DEST });
    expect(l.tasaIVA).toBe(0);
  });
});

// ─── Tarea 28 · Puerta a puerta ─────────────────────────────────────────────

describe('puerta a puerta: una importación con origen al 0% y destino al 16%', () => {
  /*
   * El caso que la tarea 28 resuelve de raíz. Una cotización de importación
   * puerta a puerta tiene conceptos en AMBOS lados: el flete internacional
   * ocurre en origen (0%) y las maniobras en destino (16%). Antes de la
   * tarea 28, la ubicación vivía en el servicio (una sola para todos) y un
   * «origen» ponía todo en 0%, o un «destino» ponía todo en 16%, pero nunca
   * los dos a la vez.
   */
  const LINEA_ORIGEN = {
    id: 'L-ORI', servicioId: 'S1', servicioTipo: 'maritimo',
    concepto: 'Flete internacional', conceptoId: 'CON-FLETE', conceptoLocalId: 'c1',
    proveedorNombre: 'Maersk', moneda: 'USD', costo: 2000, profit: 500, venta: 2500,
    margen: 0, costoDerivado: false, tarifasOficiales: 0, costos: [],
    costoCapturado: true,
    ubicacion: 'origen' as const,
    /** Tarea 28: el concepto declara explícitamente que es origen. */
    ubicacionCapturada: 'origen' as const,
  };

  const LINEA_DESTINO = {
    id: 'L-DST', servicioId: 'S1', servicioTipo: 'maritimo',
    concepto: 'Maniobras en destino', conceptoId: 'CON-DEST', conceptoLocalId: 'c2',
    proveedorNombre: 'Terminal', moneda: 'MXN', costo: 5000, profit: 1000, venta: 6000,
    margen: 0, costoDerivado: false, tarifasOficiales: 0, costos: [],
    costoCapturado: true,
    ubicacion: 'destino' as const,
    ubicacionCapturada: 'destino' as const,
  };

  const CATALOGO = [
    concepto({ id: 'CON-FLETE', nombre: 'Flete internacional', reglaIVA: 'espejo',
      aplicaOrigen: true, aplicaDestino: false }),
    concepto({ id: 'CON-DEST', nombre: 'Maniobras en destino', reglaIVA: 'espejo',
      aplicaOrigen: false, aplicaDestino: true }),
  ];

  const CTX_CONCEPTOS = {
    conceptos: CATALOGO.map(c => ({
      id: c.id, aplicaOrigen: c.aplicaOrigen, aplicaDestino: c.aplicaDestino,
    })),
  };

  it('los cargos nacen con ubicaciones distintas', () => {
    const { cargos } = mapearLineasAEmbarque(
      [LINEA_ORIGEN as never, LINEA_DESTINO as never], 'COT-1', CTX_CONCEPTOS,
    );
    const ingresos = cargos.filter(c => c.tipo === 'ingreso');
    expect(ingresos).toHaveLength(2);
    expect(ingresos.find(c => c.conceptoId === 'CON-FLETE')!.ubicacionIVA).toBe('origen');
    expect(ingresos.find(c => c.conceptoId === 'CON-DEST')!.ubicacionIVA).toBe('destino');
  });

  it('el flete de origen se factura al 0% y las maniobras de destino al 16%', () => {
    const { cargos } = mapearLineasAEmbarque(
      [LINEA_ORIGEN as never, LINEA_DESTINO as never], 'COT-1', CTX_CONCEPTOS,
    );
    const ingresos = cargos.filter(c => c.tipo === 'ingreso');

    const facFlete = lineaDeFactura(
      ingresos.find(c => c.conceptoId === 'CON-FLETE')!,
      { trafico: 'impo', conceptos: CATALOGO },
    );
    expect(facFlete.tasaIVA).toBe(0);
    expect(facFlete.montoIVA).toBe(0);

    const facManiobras = lineaDeFactura(
      ingresos.find(c => c.conceptoId === 'CON-DEST')!,
      { trafico: 'impo', conceptos: CATALOGO },
    );
    expect(facManiobras.tasaIVA).toBe(16);
    expect(facManiobras.montoIVA).toBe(960); // 6000 * 0.16
  });
});
