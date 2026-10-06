/**
 * reversaPagos.test.ts — tarea 72 · P5
 *
 * Amarra lo que la ficha del pago promete: que quitar una aplicación y anular
 * devuelven a la factura su saldo correcto, que el saldo a favor se aplica
 * sin pasarse de lo que entró, que el fondeo falla cerrado cuando un pago
 * queda sin destino claro, y que un registro viejo no se reaplica.
 */

import { describe, it, expect } from 'vitest';
import type { AplicacionPago, Pago } from './pagos';
import { aplicado, sinAplicar, entradasDeFondeo } from './pagos';
import { saldoDeFactura } from './facturacionEmbarque';
import { aplicacionesA } from './pagos';
import {
  problemaMotivo, estadoDePago, aFavorDe, aplicarFiltrosPagos, FILTROS_PAGOS_VACIOS,
  filtrosPagosDesdeVista, filtrosPagosParaVista, filtrosPagosActivos, totalesDePagos,
  pagoSinAplicacion, pagoConAplicaciones, motivoNoEditable, bitacoraDelPago,
  textoAnulacion, textoAplicacionQuitada, mesesDePagos, correccionesDelPago,
} from './reversaPagos';
import type { EntradaBitacora } from '../components/shipments/EmbarquesData';

const por = { uid: 'u1', nombre: 'Julio', fecha: '2026-10-05' };
const apl = (destinoId: string, monto: number, moneda: 'MXN' | 'USD' = 'MXN'): AplicacionPago => ({
  destinoTipo: 'factura', destinoId, destinoNumero: `F-${destinoId}`, monto, moneda, aplicadaPor: por,
});

function pago(over: Partial<Pago> & { aplicaciones?: AplicacionPago[] } = {}): Pago {
  const aplicaciones = over.aplicaciones ?? [apl('f1', 1000)];
  return {
    id: 'PAG-1', folio: 'PAG-2026-0001', lado: 'cliente', terceroTipo: 'cliente',
    terceroId: 'CLI-1', terceroNombre: 'FIBREMEX', monto: 1000, moneda: 'MXN',
    fecha: '2026-10-05', banco: 'BBVA', referencia: null, comprobante: null,
    aplicaciones, destinoIds: aplicaciones.map(a => a.destinoId), embarqueIds: ['E1'],
    origen: 'app', registradoPor: { uid: 'u1', nombre: 'Julio' }, activo: true,
    createdAt: '', updatedAt: '', ...over,
  } as Pago;
}

describe('problemaMotivo', () => {
  it('vacío, solo espacios y demasiado corto no sirven', () => {
    expect(problemaMotivo('')).toMatch(/motivo/i);
    expect(problemaMotivo('    ')).toMatch(/motivo/i);
    expect(problemaMotivo('no')).toMatch(/corto/i);
  });
  it('un motivo real sirve', () => {
    expect(problemaMotivo('Se aplicó a la factura equivocada')).toBeNull();
  });
});

describe('estadoDePago / aFavorDe', () => {
  it('aplicado, parcial, sin aplicar y anulado', () => {
    expect(estadoDePago(pago())).toBe('aplicado');
    expect(estadoDePago(pago({ monto: 1500 }))).toBe('parcial');
    expect(aFavorDe(pago({ monto: 1500 }))).toBe(500);
    expect(estadoDePago(pago({ aplicaciones: [] }))).toBe('sin_aplicar');
    expect(estadoDePago(pago({ activo: false }))).toBe('anulado');
  });
  it('un anulado no tiene saldo a favor', () => {
    expect(aFavorDe(pago({ monto: 1500, activo: false }))).toBe(0);
  });
  it('un peso de redondeo no es saldo a favor', () => {
    expect(aFavorDe(pago({ monto: 1000.5 }))).toBe(0);
    expect(estadoDePago(pago({ monto: 1000.5 }))).toBe('aplicado');
  });
});

describe('pagoSinAplicacion · quitar una aplicación', () => {
  const factura = { total: 1000, estado: 'emitida' as const, moneda: 'MXN' as const };

  it('la factura vuelve a su saldo y el dinero queda sin aplicar', () => {
    const p = pago({ monto: 1000, aplicaciones: [apl('f1', 600), apl('f2', 400)], embarqueIds: ['E1'] });
    const r = pagoSinAplicacion(p, 'f1');
    const despues = { ...p, ...r };
    expect(r.aplicaciones.map(a => a.destinoId)).toEqual(['f2']);
    expect(r.destinoIds).toEqual(['f2']);
    expect(aplicado(despues)).toBe(400);
    expect(sinAplicar(despues)).toBe(600);
    // El saldo de f1, derivado de los pagos como quedaron: otra vez entero.
    expect(saldoDeFactura(factura, aplicacionesA('f1', [p])).saldo).toBe(400);
    expect(saldoDeFactura(factura, aplicacionesA('f1', [despues])).saldo).toBe(1000);
  });

  it('devuelve lo que quitó, para anotarlo en la bitácora', () => {
    const r = pagoSinAplicacion(pago({ aplicaciones: [apl('f1', 1000)] }), 'f1');
    expect(r.quitadas).toHaveLength(1);
    expect(r.quitadas[0].monto).toBe(1000);
  });

  it('quitar una factura que no está falla: «nada» no se ve como éxito', () => {
    expect(() => pagoSinAplicacion(pago(), 'fX')).toThrow(/no tiene ninguna aplicación/);
  });

  it('si quedan aplicaciones, embarqueIds sale de ellas', () => {
    const p = pago({
      monto: 1000, aplicaciones: [apl('f1', 500), apl('f2', 500)], embarqueIds: ['E1', 'E2'],
    });
    const embarque = (id: string) => ({ f1: 'E1', f2: 'E2' } as Record<string, string>)[id];
    expect(pagoSinAplicacion(p, 'f1', embarque).embarqueIds).toEqual(['E2']);
  });

  it('si no puede resolver el embarque de las que quedan, conserva lo que había', () => {
    const p = pago({ monto: 1000, aplicaciones: [apl('f1', 500), apl('f2', 500)], embarqueIds: ['E1', 'E2'] });
    expect(pagoSinAplicacion(p, 'f1', () => undefined).embarqueIds).toEqual(['E1', 'E2']);
  });

  it('sin aplicaciones y con UN embarque: el dinero sigue fondeando ese embarque', () => {
    const p = pago({ embarqueIds: ['E1'] });
    const despues = { ...p, ...pagoSinAplicacion(p, 'f1') };
    expect(entradasDeFondeo([despues], 'E1')).toEqual([{ monto: 1000, moneda: 'MXN' }]);
  });

  it('sin aplicaciones y con VARIOS embarques: no fondea ninguno (falla cerrado)', () => {
    const p = pago({ monto: 1000, aplicaciones: [apl('f1', 1000)], embarqueIds: ['E1', 'E2'] });
    const despues = { ...p, ...pagoSinAplicacion(p, 'f1') };
    expect(despues.embarqueIds).toEqual([]);
    expect(entradasDeFondeo([despues], 'E1')).toEqual([]);
    expect(entradasDeFondeo([despues], 'E2')).toEqual([]);
  });

  it('no deja quitar en un registro anterior ni en un pago anulado', () => {
    expect(() => pagoSinAplicacion(pago({ origen: 'legacy_cobro' }), 'f1')).toThrow(/registro anterior/i);
    expect(() => pagoSinAplicacion(pago({ activo: false }), 'f1')).toThrow(/anulado/i);
  });
});

describe('pagoConAplicaciones · aplicar el saldo a favor', () => {
  it('suma las aplicaciones nuevas a las que ya tenía', () => {
    const p = pago({ monto: 1500, aplicaciones: [apl('f1', 1000)] });
    const r = pagoConAplicaciones(p, [apl('f2', 500)], ['E2']);
    expect(r.aplicaciones).toHaveLength(2);
    expect(r.destinoIds).toEqual(['f1', 'f2']);
    expect(r.embarqueIds).toEqual(['E1', 'E2']);
    expect(sinAplicar({ ...p, ...r })).toBe(0);
  });

  it('no deja aplicar más de lo que sobra: el banco no recibió ese dinero', () => {
    const p = pago({ monto: 1500, aplicaciones: [apl('f1', 1000)] });
    expect(() => pagoConAplicaciones(p, [apl('f2', 900)], [])).toThrow(/sobran/);
  });

  it('un peso de tolerancia, el mismo de saldoDeFactura', () => {
    const p = pago({ monto: 1500, aplicaciones: [apl('f1', 1000)] });
    expect(() => pagoConAplicaciones(p, [apl('f2', 500.9)], [])).not.toThrow();
  });

  it('no aplica a una factura de otra moneda (§4.3)', () => {
    const p = pago({ monto: 1500, aplicaciones: [apl('f1', 1000)] });
    expect(() => pagoConAplicaciones(p, [apl('f2', 100, 'USD')], [])).toThrow(/otra moneda|USD/);
  });

  it('exige algo que aplicar, y monto mayor que cero', () => {
    const p = pago({ monto: 1500 });
    expect(() => pagoConAplicaciones(p, [], [])).toThrow(/nada que aplicar/);
    expect(() => pagoConAplicaciones(p, [apl('f2', 0)], [])).toThrow(/monto/);
  });

  it('un anticipo sin aplicaciones se aplica completo', () => {
    const p = pago({ aplicaciones: [], monto: 800 });
    const r = pagoConAplicaciones(p, [apl('f9', 800)], ['E1']);
    expect(estadoDePago({ ...p, ...r })).toBe('aplicado');
  });

  it('un pago repartido en dos embarques cuenta lo que le toca a cada uno', () => {
    const p = pago({ aplicaciones: [], monto: 1000, embarqueIds: ['E1'] });
    const r = pagoConAplicaciones(p, [apl('f1', 400), apl('f2', 600)], ['E1', 'E2']);
    const despues = { ...p, ...r };
    const embarque = (id: string) => ({ f1: 'E1', f2: 'E2' } as Record<string, string>)[id];
    expect(entradasDeFondeo([despues], 'E1', embarque)).toEqual([{ monto: 400, moneda: 'MXN' }]);
    expect(entradasDeFondeo([despues], 'E2', embarque)).toEqual([{ monto: 600, moneda: 'MXN' }]);
  });
});

describe('anular', () => {
  it('un pago anulado ya no cubre la factura ni fondea', () => {
    const p = pago();
    const anulado = { ...p, activo: false };
    const factura = { total: 1000, estado: 'emitida' as const, moneda: 'MXN' as const };
    expect(saldoDeFactura(factura, aplicacionesA('f1', [p])).saldo).toBe(0);
    expect(saldoDeFactura(factura, aplicacionesA('f1', [anulado])).saldo).toBe(1000);
    expect(entradasDeFondeo([anulado], 'E1')).toEqual([]);
  });
  it('un registro anterior se puede anular pero no reaplicar', () => {
    expect(motivoNoEditable(pago({ origen: 'legacy_deposito' }))).toMatch(/registro anterior/i);
    expect(motivoNoEditable(pago())).toBeNull();
  });
});

describe('filtros, vistas y totales', () => {
  const lista = [
    pago({ id: 'a', folio: 'PAG-2026-0001' }),
    pago({ id: 'b', folio: 'PAG-2026-0002', activo: false, terceroId: 'CLI-2', terceroNombre: 'CEMEX' }),
    pago({ id: 'c', folio: 'PAG-2026-0003', moneda: 'USD', monto: 800, aplicaciones: [], fecha: '2026-09-02' }),
  ];

  it('por omisión los anulados no estorban, y con el filtro se ven', () => {
    expect(aplicarFiltrosPagos(lista, FILTROS_PAGOS_VACIOS).map(p => p.id)).toEqual(['a', 'c']);
    expect(aplicarFiltrosPagos(lista, { ...FILTROS_PAGOS_VACIOS, estado: 'anulado' }).map(p => p.id)).toEqual(['b']);
    expect(aplicarFiltrosPagos(lista, { ...FILTROS_PAGOS_VACIOS, estado: 'todos' })).toHaveLength(3);
  });
  it('filtra por moneda, mes, cliente y busca por folio o factura aplicada', () => {
    const f = (x: Partial<typeof FILTROS_PAGOS_VACIOS>) => aplicarFiltrosPagos(lista, { ...FILTROS_PAGOS_VACIOS, estado: 'todos', ...x }).map(p => p.id);
    expect(f({ moneda: 'USD' })).toEqual(['c']);
    expect(f({ mes: '2026-09' })).toEqual(['c']);
    expect(f({ clienteId: 'CLI-2' })).toEqual(['b']);
    expect(f({ busqueda: '0003' })).toEqual(['c']);
    expect(f({ busqueda: 'F-f1' })).toEqual(['a', 'b']);
  });
  it('los totales van por moneda y sin contar anulados', () => {
    const t = totalesDePagos(lista);
    expect(t.entrado).toEqual({ MXN: 1000, USD: 800 });
    expect(t.aFavor).toEqual({ MXN: 0, USD: 800 });
  });
  it('ida y vuelta con la vista; lo basura se descarta', () => {
    const f = { ...FILTROS_PAGOS_VACIOS, estado: 'anulado' as const, moneda: 'USD' as const };
    expect(filtrosPagosDesdeVista(filtrosPagosParaVista(f))).toEqual(f);
    expect(filtrosPagosActivos(FILTROS_PAGOS_VACIOS)).toBe(0);
    expect(filtrosPagosActivos(f)).toBe(2);
    const sucia = filtrosPagosDesdeVista({ estado: 'zzz', moneda: 'EUR', mes: 'xx' });
    expect(sucia).toEqual(FILTROS_PAGOS_VACIOS);
  });
  it('los meses que existen, el más reciente primero', () => {
    expect(mesesDePagos(lista)).toEqual(['2026-10', '2026-09']);
  });
});

describe('el rastro en la bitácora', () => {
  const entrada = (id: string, titulo: string, detalle?: string, evento: EntradaBitacora['evento'] = 'cobro', fecha = '2026-10-05T10:00:00Z'): EntradaBitacora =>
    ({ id, tipo: 'sistema', evento, titulo, detalle, autor: { uid: 'u', nombre: 'Julio' }, fecha });

  it('los textos llevan quién, folio, factura y motivo', () => {
    const t = textoAnulacion({ folio: 'PAG-2026-0001', terceroNombre: 'FIBREMEX' }, 'Julio', '  banco lo devolvió ');
    expect(t.titulo).toContain('Julio'); expect(t.titulo).toContain('PAG-2026-0001');
    expect(t.detalle).toBe('Motivo: banco lo devolvió');
    const q = textoAplicacionQuitada({ folio: 'PAG-2026-0001', moneda: 'MXN' }, apl('f1', 600), 'Julio', 'factura equivocada');
    expect(q.titulo).toContain('F-f1');
    expect(q.detalle).toContain('600.00');
  });

  it('encuentra las correcciones de ESE pago y no las de otro', () => {
    const q = textoAplicacionQuitada({ folio: 'PAG-2026-0001', moneda: 'MXN' }, apl('f1', 600), 'Julio', 'x equivocada');
    const bit = [
      entrada('1', q.titulo, q.detalle),
      entrada('2', 'Julio anuló el pago PAG-2026-0002 de CEMEX', 'Motivo: y'),
      entrada('3', 'Julio registró un cobro de FIBREMEX contra F-1', 'MXN 1 · PAG-2026-0001'),
      entrada('4', 'Julio cambió la etapa', undefined, 'etapa'),
    ];
    const r = bitacoraDelPago('PAG-2026-0001', [bit, bit]);
    expect(r.map(e => e.id)).toEqual(['1']);
  });
});

describe('correccionesDelPago (tarea 79)', () => {
  const entrada = (id: string, titulo: string, detalle: string, fecha = '2026-10-02T10:00:00.000Z'): EntradaBitacora =>
    ({ id, evento: 'cobro', titulo, detalle, fecha, autor: { uid: 'u1', nombre: 'Julio' } } as unknown as EntradaBitacora);

  it('un pago sin embarque anulado se explica solo con su campo, sin bitácora', () => {
    const p = pago({
      activo: false, aplicaciones: [], embarqueIds: [],
      anulacion: { motivo: 'Depósito duplicado', por: 'Julio', en: '2026-10-06T09:00:00.000Z' },
    });
    const c = correccionesDelPago(p, []);
    expect(c).toHaveLength(1);
    expect(c[0].fuente).toBe('pago');
    expect(c[0].titulo).toContain('Julio anuló el pago PAG-2026-0001');
    expect(c[0].detalle).toContain('Depósito duplicado');
  });

  it('una anulación anterior a la tarea 79 se lee de la bitácora', () => {
    const p = pago({ activo: false });
    const t = textoAnulacion(p, 'Julio', 'Error de captura');
    const c = correccionesDelPago(p, [[entrada('b1', t.titulo, t.detalle)]]);
    expect(c).toHaveLength(1);
    expect(c[0].fuente).toBe('bitacora');
    expect(c[0].detalle).toContain('Error de captura');
  });

  it('lo que el pago y la bitácora dicen a la vez no se repite', () => {
    const p = pago({
      activo: false,
      anulacion: { motivo: 'Error de captura', por: 'Julio', en: '2026-10-06T09:00:00.000Z' },
    });
    const t = textoAnulacion(p, 'Julio', 'Error de captura');
    const c = correccionesDelPago(p, [[entrada('b1', t.titulo, t.detalle)]]);
    expect(c).toHaveLength(1);
    expect(c[0].fuente).toBe('pago');
  });

  it('una aplicación quitada nueva y otra vieja (solo en bitácora) salen las dos, la reciente primero', () => {
    const vieja = apl('f9', 500);
    const nueva = apl('f1', 1000);
    const p = pago({
      aplicaciones: [],
      aplicacionesQuitadas: [{ ...nueva, motivo: 'Factura equivocada', por: 'Julio', en: '2026-10-06T09:00:00.000Z' }],
    });
    const tv = textoAplicacionQuitada(p, vieja, 'Gaby', 'Monto mal');
    const tn = textoAplicacionQuitada(p, nueva, 'Julio', 'Factura equivocada');
    const c = correccionesDelPago(p, [[
      entrada('b-vieja', tv.titulo, tv.detalle, '2026-10-01T09:00:00.000Z'),
      entrada('b-nueva', tn.titulo, tn.detalle, '2026-10-06T09:00:00.000Z'),
    ]]);
    expect(c.map(x => x.fuente)).toEqual(['pago', 'bitacora']);
    expect(c[1].detalle).toContain('Monto mal');
  });
});
