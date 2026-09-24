import { describe, it, expect } from 'vitest';
import { serviciosQueAportan, textoBaseDelTotal, origenDelTotal } from './serviciosDelTotal';
import { calcularTotalConsolidado, type ServicioSolicitado, type KanbanQuote } from '../components/quotes/QuotesData';

const srv = (o: Partial<ServicioSolicitado>): ServicioSolicitado => ({
  id: 'S', tipo: 'maritimo', ruta: { origen: '', destino: '' }, incoterm: 'FOB', mercancia: '',
  peso: 0, volumen: 0, estado: 'pendiente', cotizacionesProveedor: [], profit: 0, recargosPct: 0,
  conceptos: [], ...o,
} as ServicioSolicitado);

const concepto = (costo: number) => ({
  id: 'c', nombre: 'Ocean Freight', conceptoId: 'CON-1', costo, profit: 100,
  venta: costo + 100, margen: 0, subconceptos: [], tarifas: [], proveedoresOficialIds: [], orden: 0,
} as never);

// Ruta B: BandejaPricing. Ruta A: FichaCotizacion (la de COT-2026-0031).
const rutaB = srv({ id: 'B', cotizacionesProveedor: [{ proveedor: 'Hapag', monto: 1500, seleccionada: true }] as never, profit: 200 });
const rutaA = srv({ id: 'A', conceptos: [concepto(6000)] });
const vacio = srv({ id: 'V' });
const q = (servicios: ServicioSolicitado[], valorTotalConsolidado = 0) =>
  ({ servicios, valorTotalConsolidado } as KanbanQuote);

describe('serviciosQueAportan', () => {
  it('cuenta la ruta de la ficha, que es la que el conteo viejo ignoraba', () => {
    expect(serviciosQueAportan([rutaA]).map(s => s.id)).toEqual(['A']);
  });
  it('cuenta la ruta de la bandeja', () => {
    expect(serviciosQueAportan([rutaB]).map(s => s.id)).toEqual(['B']);
  });
  it('cuenta las dos juntas y descarta los vacíos', () => {
    expect(serviciosQueAportan([rutaA, rutaB, vacio]).map(s => s.id)).toEqual(['A', 'B']);
  });
  it('tolera la lista ausente', () => {
    expect(serviciosQueAportan()).toEqual([]);
  });
  it('si el total derivado es mayor que cero, el conteo NO puede ser cero', () => {
    for (const servicios of [[rutaA], [rutaB], [rutaA, rutaB], [rutaA, vacio], [vacio]]) {
      const total = calcularTotalConsolidado(servicios);
      const n = serviciosQueAportan(servicios).length;
      expect(total > 0 ? n > 0 : n === 0, `total ${total} vs conteo ${n}`).toBe(true);
    }
  });
});

describe('origenDelTotal', () => {
  it('de los servicios cuando ellos lo sustentan', () => {
    expect(origenDelTotal(q([rutaA]))).toBe('servicios');
    expect(origenDelTotal(q([rutaA], 6100))).toBe('servicios');
  });
  it('guardado cuando el campo manda y los servicios están en cero (el caso real)', () => {
    expect(origenDelTotal(q([vacio], 6100))).toBe('guardado');
  });
  it('vacío cuando no hay ni campo ni montos', () => {
    expect(origenDelTotal(q([vacio]))).toBe('vacio');
    expect(origenDelTotal(q([]))).toBe('vacio');
  });
});

describe('textoBaseDelTotal', () => {
  it('nunca dice «0 servicios» junto a un total distinto de cero sin explicarlo', () => {
    // El bug exacto: $6,100 con servicios sin montos.
    const t = textoBaseDelTotal(q([vacio], 6100));
    expect(t).toBe('Total guardado en la cotización: su único servicio no tiene montos capturados');
    expect(t).not.toMatch(/^Basado en 0/);
    expect(textoBaseDelTotal(q([vacio, srv({ id: 'V2' })], 6100)))
      .toBe('Total guardado en la cotización: sus 2 servicios no tienen montos capturados');
  });
  it('cuando la suma sale de los servicios, lo dice con el conteo correcto', () => {
    expect(textoBaseDelTotal(q([rutaA, vacio]))).toBe('Suma de 1 de 2 servicios con montos capturados');
    expect(textoBaseDelTotal(q([rutaA]))).toBe('Suma de 1 de 1 servicio con montos capturados');
  });
  it('sin montos y sin campo guardado', () => {
    expect(textoBaseDelTotal(q([vacio]))).toMatch(/Ningún servicio tiene montos capturados/);
    expect(textoBaseDelTotal(q([]))).toBe('Sin servicios en la cotización');
  });
});
