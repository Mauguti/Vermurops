import { describe, it, expect } from 'vitest';
import { catalogoOperable } from './estatusCatalogo';

describe('catalogoOperable', () => {
  it('activo explícito es operable', () => expect(catalogoOperable({ activo: true })).toBe(true));
  it('sin el campo es operable', () => expect(catalogoOperable({})).toBe(true));
  it('solo false explícito queda fuera', () => expect(catalogoOperable({ activo: false })).toBe(false));
  it('null o basura no esconden el registro', () => {
    expect(catalogoOperable({ activo: null })).toBe(true);
    expect(catalogoOperable({ activo: 0 })).toBe(true);
  });
});
