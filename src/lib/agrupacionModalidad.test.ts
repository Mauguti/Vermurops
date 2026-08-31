import { describe, it, expect } from 'vitest';
import { agruparPorModalidad, modalidadDeLinea, MODALIDADES_FICHA } from './agrupacionModalidad';
import { LineaPlana } from './lineasCotizacion';
import { Servicio } from '../config/serviciosStore';

const CATALOGO: Servicio[] = [
  { id: 'srv-def-1', nombre: 'Flete Internacional', categoria: 'transporte', activo: true, icono: 'Ship', modalidad: 'maritimo' },
  { id: 'srv-def-3', nombre: 'Transporte Aéreo', categoria: 'transporte', activo: true, icono: 'Plane', modalidad: 'aereo' },
  { id: 'srv-def-9', nombre: 'Asesoría Aduanal', categoria: 'aduana', activo: true, icono: 'File', modalidad: null },
  { id: 'srv-def-4', nombre: 'Maniobras', categoria: 'carga', activo: true, icono: 'Box', modalidad: null },
];

const linea = (p: Partial<LineaPlana> & { id: string; servicioTipo: string }): LineaPlana =>
  ({ costo: 0, profit: 0, venta: 0, margen: 0, orden: 0, concepto: 'C',
     proveedorNombre: '', moneda: 'USD', servicioId: 's', origen: 'concepto',
     costoDerivado: false, tarifasCount: 0, costos: [], ...p } as LineaPlana);

describe('modalidad de una línea', () => {
  it('el transporte resuelve por catálogo', () => {
    expect(modalidadDeLinea(linea({ id: 'a', servicioTipo: 'srv-def-1' }), CATALOGO)).toBe('maritimo');
    expect(modalidadDeLinea(linea({ id: 'b', servicioTipo: 'maritimo' }), CATALOGO)).toBe('maritimo');
    expect(modalidadDeLinea(linea({ id: 'c', servicioTipo: 'srv-def-3' }), CATALOGO)).toBe('aereo');
  });

  it('lo aduanal se reconoce por nombre y por categoría', () => {
    expect(modalidadDeLinea(linea({ id: 'd', servicioTipo: 'aduanal' }), CATALOGO)).toBe('aduanal');
    expect(modalidadDeLinea(linea({ id: 'e', servicioTipo: 'srv-def-9' }), CATALOGO)).toBe('aduanal');
  });

  it('lo que no es transporte ni aduana va a «Cargos locales», no a aduanal', () => {
    // Un seguro de mercancía no es despacho aduanal: meterlo ahí sería
    // forzarlo donde no va.
    expect(modalidadDeLinea(linea({ id: 'f', servicioTipo: 'srv-def-4' }), CATALOGO)).toBe('locales');
  });

  it('un tipo desconocido cae en cargos locales, no revienta', () => {
    expect(modalidadDeLinea(linea({ id: 'g', servicioTipo: 'xxx' }), CATALOGO)).toBe('locales');
  });
});

describe('tarjetas por modalidad', () => {
  const LINEAS = [
    linea({ id: '1', servicioTipo: 'maritimo', concepto: 'Flete', costo: 2000, profit: 500, venta: 2500, orden: 0 }),
    linea({ id: '2', servicioTipo: 'maritimo', concepto: 'THC', costo: 300, profit: 100, venta: 400, orden: 1 }),
    linea({ id: '3', servicioTipo: 'aduanal', concepto: 'Despacho', costo: 800, profit: 200, venta: 1000, orden: 0 }),
  ];

  it('una tarjeta por modalidad presente', () => {
    const t = agruparPorModalidad(LINEAS, CATALOGO);
    expect(t.map(x => x.modalidad)).toEqual(['maritimo', 'aduanal']);
  });

  it('NO muestra modalidades vacías', () => {
    // Una cotización marítima no enseña una tarjeta aérea en blanco.
    const t = agruparPorModalidad(LINEAS, CATALOGO);
    expect(t.find(x => x.modalidad === 'aereo')).toBeUndefined();
  });

  it('cada tarjeta totaliza lo suyo', () => {
    const [mar] = agruparPorModalidad(LINEAS, CATALOGO);
    expect(mar.costoTotal).toBe(2300);
    expect(mar.profitTotal).toBe(600);
    expect(mar.ventaTotal).toBe(2900);
    expect(mar.margen).toBeCloseTo(600 / 2900, 6);
  });

  it('INVARIANTE: la suma de las tarjetas es el total de la cotización', () => {
    const t = agruparPorModalidad(LINEAS, CATALOGO);
    expect(t.reduce((a, x) => a + x.ventaTotal, 0)).toBe(3900);
  });

  it('respeta el orden de las líneas dentro de la tarjeta', () => {
    const [mar] = agruparPorModalidad(LINEAS, CATALOGO);
    expect(mar.lineas.map(l => l.concepto)).toEqual(['Flete', 'THC']);
  });

  it('las modalidades salen en orden fijo, no por azar del Map', () => {
    const revueltas = [LINEAS[2], LINEAS[0]];
    expect(agruparPorModalidad(revueltas, CATALOGO).map(x => x.modalidad))
      .toEqual(['maritimo', 'aduanal']);
  });

  it('sin líneas no hay tarjetas', () => {
    expect(agruparPorModalidad([], CATALOGO)).toEqual([]);
  });

  it('el catálogo tiene las cuatro de transporte más cargos locales', () => {
    expect(MODALIDADES_FICHA.map(m => m.id))
      .toEqual(['maritimo', 'aereo', 'terrestre', 'aduanal', 'locales']);
  });
});
