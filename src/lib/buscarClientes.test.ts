import { describe, it, expect } from 'vitest';
import { buscarClientes } from './buscarClientes';

const clientes = [
  { id: 'c1', nombre: 'Plásticos Ramírez S.A. de C.V.', rfc: 'PRA750610EF8' },
  { id: 'c2', nombre: 'Distribuidora Nacional', rfc: '' },
  { id: 'c3', nombre: 'Cliente Sin RFC' },                         // rfc ausente (Magaya)
  { id: 'c4', nombre: 'Cliente RFC nulo', rfc: null },
  { id: 'c5', nombre: undefined, rfc: 'XAXX010101000' },           // nombre ausente
  { id: 'c6', nombre: null, rfc: null },
];

describe('buscarClientes', () => {
  it('no truena con rfc ausente o nulo cuando la consulta no coincide con el nombre (el bug)', () => {
    expect(() => buscarClientes(clientes, 'zzz')).not.toThrow();
    expect(buscarClientes(clientes, 'zzz')).toEqual([]);
  });
  it('no truena con nombre ausente o nulo', () => {
    expect(buscarClientes(clientes, 'XAXX').map(c => c.id)).toEqual(['c5']);
  });
  it('busca por nombre parcial sin importar mayúsculas ni acentos', () => {
    expect(buscarClientes(clientes, 'plasticos').map(c => c.id)).toEqual(['c1']);
    expect(buscarClientes(clientes, 'PLÁS').map(c => c.id)).toEqual(['c1']);
  });
  it('busca por RFC parcial', () => {
    expect(buscarClientes(clientes, 'pra7506').map(c => c.id)).toEqual(['c1']);
  });
  it('consulta vacía o solo espacios no abre resultados', () => {
    expect(buscarClientes(clientes, '')).toEqual([]);
    expect(buscarClientes(clientes, '   ')).toEqual([]);
  });
  it('respeta el máximo', () => {
    const muchos = Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, nombre: `Cliente ${i}` }));
    expect(buscarClientes(muchos, 'cliente')).toHaveLength(6);
    expect(buscarClientes(muchos, 'cliente', 3)).toHaveLength(3);
  });
});
