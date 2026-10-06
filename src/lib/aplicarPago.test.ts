/**
 * aplicarPago.test.ts — tarea 70 · P4
 *
 * Lo que estos tests amarran, en el orden de los cinco puntos de la tarea:
 * parcialidades, sobrepago, moneda, el restante de cada factura y la vista
 * «qué pagos cubrieron esta factura».
 */

import { describe, it, expect } from 'vitest';
import type { FacturaCliente } from '../components/facturas/FacturasData';
import { evaluarFactura, type FacturaEnCartera } from './cuentasPorCobrar';
import {
  facturasAplicables, avisoDeMoneda, repartirEnCascada, resumenAplicacion,
  restanteDespues, problemaAplicacion, problemaDeLinea, aplicacionesDelReparto,
  embarquesDelReparto, coberturaDeFactura, claveDeCliente,
} from './aplicarPago';
import { aplicado, sinAplicar, construirPagoAplicado, type Pago, type ContextoPago } from './pagos';
import { saldoDeFactura } from './facturacionEmbarque';

const HOY = '2026-10-05';

const CTX: ContextoPago = {
  id: 'PAG-x', folio: 'PAG-2026-0001',
  por: { uid: 'u1', nombre: 'Julio' }, ahora: '2026-10-05T10:00:00.000Z',
};

function factura(over: Partial<FacturaCliente> & { id: string; numero: string }): FacturaCliente {
  return {
    id: over.id,
    numero: over.numero,
    embarqueId: over.embarqueId ?? 'EMB-1',
    embarqueFolio: over.embarqueFolio ?? 'VLIM-26-001',
    clienteId: over.clienteId ?? 'CLI-1',
    clienteNombre: over.clienteNombre ?? 'GRUPO FIBREMEX',
    total: over.total ?? 1000,
    moneda: over.moneda ?? 'MXN',
    fechaEmision: over.fechaEmision ?? '2026-09-01',
    fechaVencimiento: over.fechaVencimiento ?? '2026-10-31',
    estado: over.estado ?? 'emitida',
    activo: true,
    ...over,
  } as FacturaCliente;
}

/** Un pago con una aplicación, como el que deja un cobro. */
function pagoCon(aplicaciones: { destinoId: string; destinoNumero?: string; monto: number; moneda?: 'MXN' | 'USD' }[], over: Partial<Pago> = {}): Pago {
  return {
    id: over.id ?? 'PAG-1', folio: over.folio ?? 'PAG-2026-0001',
    lado: 'cliente', terceroTipo: 'cliente', terceroId: 'CLI-1', terceroNombre: 'GRUPO FIBREMEX',
    monto: over.monto ?? aplicaciones.reduce((a, x) => a + x.monto, 0),
    moneda: over.moneda ?? 'MXN',
    fecha: over.fecha ?? HOY,
    banco: over.banco ?? 'BBVA', referencia: over.referencia ?? null, comprobante: null,
    aplicaciones: aplicaciones.map(a => ({
      destinoTipo: 'factura' as const,
      destinoId: a.destinoId,
      destinoNumero: a.destinoNumero ?? a.destinoId,
      monto: a.monto,
      moneda: a.moneda ?? over.moneda ?? 'MXN',
      aplicadaPor: { uid: 'u1', nombre: 'Julio', fecha: HOY },
    })),
    destinoIds: aplicaciones.map(a => a.destinoId),
    embarqueIds: ['EMB-1'],
    registradoPor: { uid: 'u1', nombre: 'Julio' },
    activo: true, createdAt: '', updatedAt: '',
    ...over,
  } as Pago;
}

const enCartera = (f: FacturaCliente, pagos: Pago[] = []): FacturaEnCartera =>
  evaluarFactura(f, pagos, HOY);

// Tres facturas del mismo cliente en MXN, con distinto atraso.
const F_VIEJA = factura({ id: 'F1', numero: 'F-2026-0145', total: 45_000, fechaVencimiento: '2026-09-12' });
const F_MEDIA = factura({ id: 'F2', numero: 'F-2026-0151', total: 60_000, fechaVencimiento: '2026-09-28' });
const F_NUEVA = factura({ id: 'F3', numero: 'F-2026-0163', total: 38_000, fechaVencimiento: '2026-10-10' });
const TRES = [F_VIEJA, F_MEDIA, F_NUEVA].map(f => enCartera(f));

// ─────────────────────────────────────────────────────────────────────────────
describe('A · qué facturas se ofrecen', () => {
  it('solo las del mismo cliente', () => {
    const otro = enCartera(factura({ id: 'F9', numero: 'F-9', clienteId: 'CLI-2', clienteNombre: 'OTRO' }));
    const r = facturasAplicables([...TRES, otro], { clienteClave: 'CLI-1', moneda: 'MXN' });
    expect(r.map(i => i.factura.id)).toEqual(['F1', 'F2', 'F3']);
  });

  it('una factura en otra moneda NO aparece en la lista (punto 2)', () => {
    const dolares = enCartera(factura({ id: 'F4', numero: 'F-4', moneda: 'USD', total: 3_000 }));
    const r = facturasAplicables([...TRES, dolares], { clienteClave: 'CLI-1', moneda: 'MXN' });
    expect(r.map(i => i.factura.id)).not.toContain('F4');
  });

  it('lo más vencido primero', () => {
    const r = facturasAplicables(TRES, { clienteClave: 'CLI-1', moneda: 'MXN' });
    expect(r.map(i => i.factura.numero)).toEqual(['F-2026-0145', 'F-2026-0151', 'F-2026-0163']);
  });

  it('una factura ya liquidada no recibe más dinero', () => {
    const pago = pagoCon([{ destinoId: 'F1', monto: 45_000 }]);
    const items = [enCartera(F_VIEJA, [pago]), enCartera(F_MEDIA)];
    const r = facturasAplicables(items, { clienteClave: 'CLI-1', moneda: 'MXN' });
    expect(r.map(i => i.factura.id)).toEqual(['F2']);
  });

  it('una factura parcialmente cobrada sigue en la lista, con su saldo', () => {
    const pago = pagoCon([{ destinoId: 'F1', monto: 20_000 }]);
    const r = facturasAplicables([enCartera(F_VIEJA, [pago])], { clienteClave: 'CLI-1', moneda: 'MXN' });
    expect(r).toHaveLength(1);
    expect(r[0].saldo).toBe(25_000);
  });

  it('un cliente legacy sin id se agrupa por nombre', () => {
    const sinId = factura({ id: 'F8', numero: 'F-8', clienteId: undefined, clienteNombre: ' FibreMex ' });
    expect(claveDeCliente(sinId)).toBe('nombre:fibremex');
    const r = facturasAplicables([enCartera(sinId)], { clienteClave: 'nombre:fibremex', moneda: 'MXN' });
    expect(r).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B · el aviso de moneda (§4 del plan)', () => {
  it('lo dice cuando el cliente solo debe en la otra moneda', () => {
    const dolares = enCartera(factura({ id: 'F4', numero: 'F-4', moneda: 'USD', total: 3_000 }));
    const aviso = avisoDeMoneda([dolares], { clienteClave: 'CLI-1', moneda: 'MXN' });
    expect(aviso).toContain('no tiene facturas abiertas en MXN');
    expect(aviso).toContain('USD 3,000.00');
  });

  it('no estorba cuando sí hay facturas en la moneda del pago', () => {
    expect(avisoDeMoneda(TRES, { clienteClave: 'CLI-1', moneda: 'MXN' })).toBeNull();
  });

  it('no dice nada cuando el cliente no debe nada', () => {
    expect(avisoDeMoneda([], { clienteClave: 'CLI-1', moneda: 'USD' })).toBeNull();
  });

  it('agrupa por moneda en vez de inventar un total mezclado', () => {
    const usd = enCartera(factura({ id: 'F4', numero: 'F-4', moneda: 'USD', total: 1_000 }));
    const usd2 = enCartera(factura({ id: 'F5', numero: 'F-5', moneda: 'USD', total: 500 }));
    const aviso = avisoDeMoneda([usd, usd2], { clienteClave: 'CLI-1', moneda: 'MXN' });
    expect(aviso).toContain('USD 1,500.00');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('C · el reparto en cascada', () => {
  it('liquida de la más vencida a la menos, y la última queda parcial', () => {
    const ordenadas = facturasAplicables(TRES, { clienteClave: 'CLI-1', moneda: 'MXN' });
    const r = repartirEnCascada(120_000, ordenadas);
    expect(r).toEqual({ F1: 45_000, F2: 60_000, F3: 15_000 });
  });

  it('lo que sobra NO se mete a la fuerza en la última factura', () => {
    const ordenadas = facturasAplicables(TRES, { clienteClave: 'CLI-1', moneda: 'MXN' });
    const r = repartirEnCascada(200_000, ordenadas);
    expect(r).toEqual({ F1: 45_000, F2: 60_000, F3: 38_000 });
    const resumen = resumenAplicacion(200_000, r, ordenadas);
    expect(resumen.aplicado).toBe(143_000);
    expect(resumen.sinAplicar).toBe(57_000);
    expect(resumen.sobreAplicado).toBe(false);
  });

  it('un monto en cero no reparte nada', () => {
    expect(repartirEnCascada(0, TRES)).toEqual({});
  });

  it('respeta los centavos', () => {
    const chica = enCartera(factura({ id: 'Fc', numero: 'F-c', total: 100.55 }));
    expect(repartirEnCascada(50.1, [chica])).toEqual({ Fc: 50.1 });
    expect(repartirEnCascada(200, [chica])).toEqual({ Fc: 100.55 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('D · parcialidades y restante (puntos 1 y 3)', () => {
  it('cada factura muestra su restante después de lo aplicado', () => {
    const ordenadas = facturasAplicables(TRES, { clienteClave: 'CLI-1', moneda: 'MXN' });
    const r = { F1: 45_000, F2: 60_000, F3: 15_000 };
    expect(restanteDespues(ordenadas[0], r.F1)).toBe(0);
    expect(restanteDespues(ordenadas[2], r.F3)).toBe(23_000);
  });

  it('el resumen cuenta cuántas quedan liquidadas y cuántas parciales', () => {
    const ordenadas = facturasAplicables(TRES, { clienteClave: 'CLI-1', moneda: 'MXN' });
    const resumen = resumenAplicacion(120_000, { F1: 45_000, F2: 60_000, F3: 15_000 }, ordenadas);
    expect(resumen).toMatchObject({
      aplicado: 120_000, sinAplicar: 0, sobreAplicado: false,
      lineas: 3, liquidadas: 2, parciales: 1,
    });
  });

  it('lo que sobra es saldo a favor del pago, no un error', () => {
    const ordenadas = facturasAplicables(TRES, { clienteClave: 'CLI-1', moneda: 'MXN' });
    const resumen = resumenAplicacion(150_000, { F1: 45_000 }, ordenadas);
    expect(resumen.sinAplicar).toBe(105_000);
    expect(problemaAplicacion(
      { monto: 150_000, moneda: 'MXN', fecha: HOY, banco: 'BBVA' }, resumen)).toBeNull();
  });

  it('un reparto que apunta a una factura que ya no está no suma al aplicado', () => {
    const ordenadas = facturasAplicables(TRES, { clienteClave: 'CLI-1', moneda: 'MXN' });
    const resumen = resumenAplicacion(100_000, { F1: 45_000, 'F-fantasma': 55_000 }, ordenadas);
    expect(resumen.aplicado).toBe(45_000);
    expect(resumen.lineas).toBe(1);
  });

  it('el aplicado del pago construido coincide con lo repartido', () => {
    const ordenadas = facturasAplicables(TRES, { clienteClave: 'CLI-1', moneda: 'MXN' });
    const reparto = repartirEnCascada(120_000, ordenadas);
    const pago = construirPagoAplicado({
      terceroId: 'CLI-1', terceroNombre: 'GRUPO FIBREMEX',
      monto: 120_000, moneda: 'MXN', fecha: HOY, banco: 'BBVA', referencia: null,
      aplicaciones: aplicacionesDelReparto(reparto, ordenadas, { moneda: 'MXN', por: CTX.por, fecha: HOY }),
      embarqueIds: embarquesDelReparto(reparto, ordenadas),
    }, CTX);
    expect(aplicado(pago)).toBe(120_000);
    expect(sinAplicar(pago)).toBe(0);
    expect(pago.aplicaciones).toHaveLength(3);
    expect(pago.destinoIds).toEqual(['F1', 'F2', 'F3']);
  });

  it('el saldo de cada factura sale de las aplicaciones de ESE pago', () => {
    const ordenadas = facturasAplicables(TRES, { clienteClave: 'CLI-1', moneda: 'MXN' });
    const reparto = repartirEnCascada(120_000, ordenadas);
    const pago = construirPagoAplicado({
      terceroId: 'CLI-1', terceroNombre: 'GRUPO FIBREMEX',
      monto: 120_000, moneda: 'MXN', fecha: HOY, banco: 'BBVA', referencia: null,
      aplicaciones: aplicacionesDelReparto(reparto, ordenadas, { moneda: 'MXN', por: CTX.por, fecha: HOY }),
      embarqueIds: embarquesDelReparto(reparto, ordenadas),
    }, CTX);

    // Punto 3: por cobrar → parcial → cobrada, derivado y sin guardar nada.
    expect(saldoDeFactura(F_VIEJA, pago.aplicaciones.filter(a => a.destinoId === 'F1')).estado).toBe('cobrada');
    const tercera = saldoDeFactura(F_NUEVA, pago.aplicaciones.filter(a => a.destinoId === 'F3'));
    expect(tercera.estado).toBe('cobrada_parcial');
    expect(tercera.saldo).toBe(23_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('E · sobrepago (punto 1)', () => {
  it('no se puede repartir más dinero del que entró', () => {
    const ordenadas = facturasAplicables(TRES, { clienteClave: 'CLI-1', moneda: 'MXN' });
    const resumen = resumenAplicacion(120_000, { F1: 45_000, F2: 60_000, F3: 38_000 }, ordenadas);
    expect(resumen.sobreAplicado).toBe(true);
    const problema = problemaAplicacion(
      { monto: 120_000, moneda: 'MXN', fecha: HOY, banco: 'BBVA' }, resumen);
    expect(problema).toContain('143,000.00');
    expect(problema).toContain('120,000.00');
  });

  it('no se puede aplicar a una factura más de lo que debe', () => {
    const ordenadas = facturasAplicables(TRES, { clienteClave: 'CLI-1', moneda: 'MXN' });
    expect(problemaDeLinea(ordenadas[0], 45_000)).toBeNull();
    expect(problemaDeLinea(ordenadas[0], 50_000)).toContain('sobrecobrada');
    // Un peso de redondeo no es un sobrepago.
    expect(problemaDeLinea(ordenadas[0], 45_000.5)).toBeNull();
  });

  it('el constructor rechaza el sobrepago aunque la pantalla lo deje pasar', () => {
    const ordenadas = facturasAplicables(TRES, { clienteClave: 'CLI-1', moneda: 'MXN' });
    const reparto = { F1: 45_000, F2: 60_000, F3: 38_000 };
    expect(() => construirPagoAplicado({
      terceroId: 'CLI-1', terceroNombre: 'GRUPO FIBREMEX',
      monto: 120_000, moneda: 'MXN', fecha: HOY, banco: 'BBVA', referencia: null,
      aplicaciones: aplicacionesDelReparto(reparto, ordenadas, { moneda: 'MXN', por: CTX.por, fecha: HOY }),
      embarqueIds: [],
    }, CTX)).toThrow(/143,000/);
  });

  it('un pago sin aplicaciones manda al formulario del anticipo', () => {
    const resumen = resumenAplicacion(10_000, {}, TRES);
    expect(problemaAplicacion({ monto: 10_000, moneda: 'MXN', fecha: HOY, banco: 'BBVA' }, resumen))
      .toContain('Registrar entrada de dinero');
  });

  it('pide lo de arriba antes del reparto', () => {
    const resumen = resumenAplicacion(0, {}, TRES);
    expect(problemaAplicacion({ monto: 0, moneda: '', fecha: '', banco: '' }, resumen)).toContain('moneda');
    expect(problemaAplicacion({ monto: 0, moneda: 'MXN', fecha: '', banco: '' }, resumen)).toContain('cuánto dinero');
    expect(problemaAplicacion({ monto: 10, moneda: 'MXN', fecha: '', banco: '' }, resumen)).toContain('fecha');
    expect(problemaAplicacion({ monto: 10, moneda: 'MXN', fecha: HOY, banco: '' }, resumen)).toContain('cuenta');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('F · moneda, en el constructor', () => {
  it('una aplicación en otra moneda no se escribe', () => {
    expect(() => construirPagoAplicado({
      terceroId: 'CLI-1', terceroNombre: 'X',
      monto: 1_000, moneda: 'MXN', fecha: HOY, banco: 'BBVA', referencia: null,
      aplicaciones: [{
        destinoTipo: 'factura', destinoId: 'F1', destinoNumero: 'F-1',
        monto: 1_000, moneda: 'USD',
        aplicadaPor: { uid: 'u', nombre: 'n', fecha: HOY },
      }],
      embarqueIds: [],
    }, CTX)).toThrow(/otra moneda/);
  });

  it('una aplicación sin monto no se escribe', () => {
    expect(() => construirPagoAplicado({
      terceroId: 'CLI-1', terceroNombre: 'X',
      monto: 1_000, moneda: 'MXN', fecha: HOY, banco: 'BBVA', referencia: null,
      aplicaciones: [{
        destinoTipo: 'factura', destinoId: 'F1', destinoNumero: 'F-1',
        monto: 0, moneda: 'MXN',
        aplicadaPor: { uid: 'u', nombre: 'n', fecha: HOY },
      }],
      embarqueIds: [],
    }, CTX)).toThrow(/no tiene monto/);
  });

  it('la referencia vacía se guarda como null, no como cadena vacía', () => {
    const p = construirPagoAplicado({
      terceroId: 'CLI-1', terceroNombre: 'X',
      monto: 1_000, moneda: 'MXN', fecha: HOY, banco: 'BBVA', referencia: '   ',
      aplicaciones: [], embarqueIds: [],
    }, CTX);
    expect(p.referencia).toBeNull();
    expect(p.destinoIds).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('G · un pago que cruza embarques', () => {
  it('hereda los dos embarques, que es lo que un cobro no podía', () => {
    const deOtro = enCartera(factura({ id: 'F7', numero: 'F-7', embarqueId: 'EMB-2', total: 10_000 }));
    const lista = [...TRES, deOtro];
    const ordenadas = facturasAplicables(lista, { clienteClave: 'CLI-1', moneda: 'MXN' });
    const reparto = { F1: 45_000, F7: 10_000 };
    expect(embarquesDelReparto(reparto, ordenadas).sort()).toEqual(['EMB-1', 'EMB-2']);
  });

  it('no repite el embarque cuando dos facturas son del mismo', () => {
    const ordenadas = facturasAplicables(TRES, { clienteClave: 'CLI-1', moneda: 'MXN' });
    expect(embarquesDelReparto({ F1: 1, F2: 1 }, ordenadas)).toEqual(['EMB-1']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('H · qué pagos cubrieron una factura (punto 4)', () => {
  it('lista los pagos vivos que le aplicaron dinero, el más reciente primero', () => {
    const p1 = pagoCon([{ destinoId: 'F1', monto: 20_000 }], { id: 'P1', folio: 'PAG-2026-0001', fecha: '2026-09-20' });
    const p2 = pagoCon([{ destinoId: 'F1', monto: 25_000 }], { id: 'P2', folio: 'PAG-2026-0002', fecha: '2026-10-01' });
    const r = coberturaDeFactura('F1', [p1, p2]);
    expect(r.map(x => x.folio)).toEqual(['PAG-2026-0002', 'PAG-2026-0001']);
    expect(r[0].monto).toBe(25_000);
  });

  it('un pago anulado no aparece', () => {
    const p = pagoCon([{ destinoId: 'F1', monto: 20_000 }], { activo: false });
    expect(coberturaDeFactura('F1', [p])).toEqual([]);
  });

  it('marca el pago que además cubrió otras facturas', () => {
    const p = pagoCon([{ destinoId: 'F1', monto: 45_000 }, { destinoId: 'F2', monto: 60_000 }]);
    const r = coberturaDeFactura('F1', [p]);
    expect(r[0]).toMatchObject({ monto: 45_000, compartido: true });
  });

  it('un cobro viejo se ve igual, marcado como legacy', () => {
    const viejo = pagoCon([{ destinoId: 'F1', monto: 45_000 }], { origen: 'legacy_cobro', folio: 'COB-9', fecha: '2026-09-01' });
    const nuevo = pagoCon([{ destinoId: 'F1', monto: 1 }], { id: 'P2', origen: 'app', fecha: '2026-10-02' });
    const r = coberturaDeFactura('F1', [viejo, nuevo]);
    expect(r.map(x => x.legacy)).toEqual([false, true]);
  });

  it('dos aplicaciones del mismo pago a la misma factura son UN renglón', () => {
    const p = pagoCon([{ destinoId: 'F1', monto: 10_000 }, { destinoId: 'F1', monto: 5_000 }]);
    const r = coberturaDeFactura('F1', [p]);
    expect(r).toHaveLength(1);
    expect(r[0].monto).toBe(15_000);
  });

  it('una factura sin pagos devuelve la lista vacía', () => {
    expect(coberturaDeFactura('F3', [pagoCon([{ destinoId: 'F1', monto: 1 }])])).toEqual([]);
  });
});
