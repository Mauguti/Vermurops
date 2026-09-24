import { describe, it, expect } from 'vitest';
import { razonSinCliente, exigirClienteVinculado, esRazonSinCliente, RAZON_SIN_CLIENTE } from './frenoCliente';

describe('frenoCliente', () => {
  it('con clienteId no hay razón', () => {
    expect(razonSinCliente({ clienteId: 'CLI-1' })).toBeNull();
    expect(() => exigirClienteVinculado({ clienteId: 'CLI-1' })).not.toThrow();
  });
  it('sin clienteId (ausente, null o vacío) frena con la razón completa', () => {
    for (const q of [{}, { clienteId: null }, { clienteId: '' }]) {
      expect(razonSinCliente(q)).toBe(RAZON_SIN_CLIENTE);
      expect(() => exigirClienteVinculado(q)).toThrow(RAZON_SIN_CLIENTE);
    }
  });
  it('la razón se reconoce para ofrecer el camino', () => {
    expect(esRazonSinCliente(RAZON_SIN_CLIENTE)).toBe(true);
    expect(esRazonSinCliente('otra')).toBe(false);
    expect(esRazonSinCliente(undefined)).toBe(false);
  });
});
