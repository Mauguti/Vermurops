import { describe, it, expect } from 'vitest';
import { filtrarProveedores, conteoPorPestana, enPestana, PESTANAS_PROVEEDOR } from './filtrarProveedores';
import type { ProveedorVermur } from '../components/proveedores/ProveedoresData';

const p = (o: Partial<ProveedorVermur>): ProveedorVermur => ({
  id: 'PRV-X', nombre: 'X', tipos: ['proveedor'], activo: true, contactos: [], ...o,
} as ProveedorVermur);

const lista = [
  p({ id: '1', nombre: 'Hapag Lloyd', tipos: ['proveedor'], rfc: 'HAP123' }),
  p({ id: '2', nombre: 'Transportes Álvarez', tipos: ['transportista'] }),
  p({ id: '3', nombre: 'Sunway Logistics', tipos: ['agente_carga', 'proveedor'] }),
  p({ id: '4', nombre: 'Inactivo S.A.', tipos: ['transportista'], activo: false }),
  p({ id: '5', nombre: 'Sin tipos', tipos: undefined as never, numeroEntidadMagaya: '4471' }),
  p({ id: '6', nombre: undefined as never, tipos: ['proveedor'], contactos: undefined as never }),
];

describe('enPestana', () => {
  it('«todos» acepta cualquiera, incluso sin tipos', () => {
    expect(lista.every(x => enPestana(x, 'todos'))).toBe(true);
  });
  it('un proveedor puede estar en varias pestañas (§4.5)', () => {
    expect(enPestana(lista[2], 'agente_carga')).toBe(true);
    expect(enPestana(lista[2], 'proveedor')).toBe(true);
    expect(enPestana(lista[2], 'transportista')).toBe(false);
  });
  it('sin tipos no cae en ninguna pestaña concreta, y no truena', () => {
    expect(enPestana(lista[4], 'proveedor')).toBe(false);
  });
});

describe('filtrarProveedores', () => {
  it('la pestaña filtra de verdad (el bug: antes devolvía siempre la lista entera)', () => {
    expect(filtrarProveedores(lista, { pestana: 'transportista' }).map(x => x.id)).toEqual(['2', '4']);
    expect(filtrarProveedores(lista, { pestana: 'agente_carga' }).map(x => x.id)).toEqual(['3']);
    expect(filtrarProveedores(lista, { pestana: 'todos' })).toHaveLength(6);
  });
  it('busca por nombre sin acentos ni mayúsculas, por RFC y por número de Magaya', () => {
    expect(filtrarProveedores(lista, { busqueda: 'alvarez' }).map(x => x.id)).toEqual(['2']);
    expect(filtrarProveedores(lista, { busqueda: 'HAP' }).map(x => x.id)).toEqual(['1']);
    expect(filtrarProveedores(lista, { busqueda: '4471' }).map(x => x.id)).toEqual(['5']);
  });
  it('combina pestaña y búsqueda', () => {
    expect(filtrarProveedores(lista, { pestana: 'proveedor', busqueda: 'sunway' }).map(x => x.id)).toEqual(['3']);
    expect(filtrarProveedores(lista, { pestana: 'transportista', busqueda: 'sunway' })).toEqual([]);
  });
  it('búsqueda vacía o de espacios no esconde nada', () => {
    expect(filtrarProveedores(lista, { busqueda: '   ' })).toHaveLength(6);
  });
  it('soloActivos excluye los dados de baja; por defecto se ven todos', () => {
    expect(filtrarProveedores(lista, { soloActivos: true }).map(x => x.id)).not.toContain('4');
    expect(filtrarProveedores(lista).map(x => x.id)).toContain('4');
  });
  it('no truena con nombre ausente ni sin arreglo de contactos', () => {
    expect(() => filtrarProveedores(lista, { busqueda: 'zzz' })).not.toThrow();
    expect(filtrarProveedores(lista, { busqueda: 'zzz' })).toEqual([]);
  });
});

describe('conteoPorPestana', () => {
  it('cuenta por pestaña respetando la búsqueda', () => {
    expect(conteoPorPestana(lista)).toEqual({ todos: 6, proveedor: 3, transportista: 2, agente_carga: 1 });
    expect(conteoPorPestana(lista, { busqueda: 'sunway' })).toEqual({ todos: 1, proveedor: 1, transportista: 0, agente_carga: 1 });
  });
  it('hay una entrada por pestaña declarada', () => {
    expect(Object.keys(conteoPorPestana(lista))).toHaveLength(PESTANAS_PROVEEDOR.length);
  });
});
