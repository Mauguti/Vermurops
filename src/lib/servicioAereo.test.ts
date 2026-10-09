import { describe, it, expect } from 'vitest';
import {
  leerServicioAereo, etiquetaServicioAereo, conServicioAereo, serviciosDeProductos,
  etiquetaServicioDeEmbarque, tarifasPorServicioAereo,
} from './servicioAereo';
import { resumenCarga, productosDesdeCarga, borradorTieneDatos } from './cargaSolicitud';
import { cargaParaPdf } from './pdfCotizacion';
import type { CargaAerea, ServicioSolicitado } from '../components/quotes/QuotesData';

const aerea = (extra: Partial<CargaAerea> = {}): CargaAerea => ({
  tipo: 'aereo', pesoBrutoKg: 120, pesoVolumetricoKg: 0, piezas: 3, bultos: [],
  peligrosa: { esPeligrosa: false }, ...extra,
});
const servicioCon = (carga: CargaAerea) => ({ id: 's1', carga, mercancia: 'Piezas' } as unknown as ServicioSolicitado);

describe('lectura: lo viejo no se asume', () => {
  it('solo dos valores son válidos; lo demás es «Sin indicar»', () => {
    expect(leerServicioAereo('expeditado')).toBe('expeditado');
    expect(leerServicioAereo('regular')).toBe('regular');
    for (const v of [undefined, null, '', 'express', 'EXPEDITADO', 1]) expect(leerServicioAereo(v)).toBeNull();
    expect(etiquetaServicioAereo(undefined)).toBe('Sin indicar');
    expect(etiquetaServicioAereo('expeditado')).toBe('Expeditado');
  });
  it('quitar el servicio borra la clave (Firestore rechaza undefined)', () => {
    const c = conServicioAereo(aerea({ servicioAereo: 'regular' }), null);
    expect('servicioAereo' in c).toBe(false);
    expect(conServicioAereo(aerea(), 'expeditado').servicioAereo).toBe('expeditado');
  });
});

describe('de la cotización al embarque', () => {
  it('el resumen y el PDF lo dicen', () => {
    expect(resumenCarga(aerea({ servicioAereo: 'expeditado' }))).toContain('Aéreo Expeditado');
    expect(resumenCarga(aerea())).toMatch(/^Aéreo · /);
    expect(cargaParaPdf(servicioCon(aerea({ servicioAereo: 'expeditado' }))).tipo).toBe('Aéreo Expeditado');
    expect(cargaParaPdf(servicioCon(aerea())).tipo).toBe('Aéreo');
  });
  it('el producto del embarque hereda el servicio', () => {
    const [p] = productosDesdeCarga(servicioCon(aerea({ servicioAereo: 'expeditado' })), 'ACME', 'COT-1');
    expect(p.servicioAereo).toBe('expeditado');
  });
  it('sin servicio, el producto no trae la clave', () => {
    const [p] = productosDesdeCarga(servicioCon(aerea()), 'ACME', 'COT-1');
    expect('servicioAereo' in p).toBe(false);
  });
  it('elegir servicio cuenta como dato capturado', () => {
    const base = { origen: '', destino: '', mercancia: '', conceptosRequeridos: [] };
    const vacia = { pesoBrutoKg: 0, piezas: 0 };
    expect(borradorTieneDatos({ ...base, carga: aerea(vacia) })).toBe(false);
    expect(borradorTieneDatos({ ...base, carga: aerea({ ...vacia, servicioAereo: 'regular' }) })).toBe(true);
  });
});

describe('etiqueta del embarque', () => {
  it('solo los aéreos preguntan', () => {
    expect(etiquetaServicioDeEmbarque({ modalidad: 'maritimo' })).toBeNull();
    expect(etiquetaServicioDeEmbarque({ modalidad: 'aereo', productos: [] })).toBe('Sin indicar');
    expect(etiquetaServicioDeEmbarque({ modalidad: 'aereo', productos: [{ servicioAereo: 'regular' }] })).toBe('Regular');
  });
  it('productos que no coinciden se dicen, no se escoge uno', () => {
    const e = { modalidad: 'aereo', productos: [{ servicioAereo: 'regular' as const }, { servicioAereo: 'expeditado' as const }, {}] };
    expect(serviciosDeProductos(e.productos)).toEqual(['expeditado', 'regular']);
    expect(etiquetaServicioDeEmbarque(e)).toBe('Expeditado + Regular');
  });
});

describe('tarifas: primero las del mismo tipo', () => {
  const exp = { id: 'a', servicioAereo: 'expeditado' as const };
  const reg = { id: 'b', servicioAereo: 'regular' as const };
  const sin = { id: 'c' };
  it('con las del mismo tipo, solo esas y sin aviso', () => {
    const r = tarifasPorServicioAereo([exp, reg, sin], 'expeditado');
    expect(r.tarifas.map(t => t.id)).toEqual(['a']);
    expect(r.aviso).toBeNull();
  });
  it('si no hay, las sin indicar, con aviso; nunca las del otro tipo', () => {
    const r = tarifasPorServicioAereo([reg, sin], 'expeditado');
    expect(r.tarifas.map(t => t.id)).toEqual(['c']);
    expect(r.aviso).toMatch(/expeditado/);
  });
  it('si solo hay del otro tipo: nada, con aviso', () => {
    const r = tarifasPorServicioAereo([reg], 'expeditado');
    expect(r.tarifas).toEqual([]);
    expect(r.aviso).toBeTruthy();
  });
  it('cotización sin servicio o concepto sin distinción: no se filtra ni se avisa', () => {
    expect(tarifasPorServicioAereo([exp, reg, sin], null)).toEqual({ tarifas: [exp, reg, sin], aviso: null });
    expect(tarifasPorServicioAereo([sin, { id: 'd' }], 'regular')).toEqual({ tarifas: [sin, { id: 'd' }], aviso: null });
  });
  it('un valor basura en la tarifa cuenta como sin indicar', () => {
    const basura = { id: 'x', servicioAereo: 'express' as never };
    expect(tarifasPorServicioAereo([basura, reg], 'expeditado').tarifas.map(t => t.id)).toEqual(['x']);
  });
});
