import { describe, it, expect } from 'vitest';
import { proveedorOperable } from './estatusProveedor';
import { clienteOperable, statusOperativoDesdeActivo } from './estatusCliente';
import { filtrarProveedores } from './filtrarProveedores';

describe('proveedorOperable', () => {
  it('con activo: true es operable', () => expect(proveedorOperable({ activo: true })).toBe(true));
  it('sin el campo es operable', () => expect(proveedorOperable({})).toBe(true));
  it('INACTIVO explícito no', () => expect(proveedorOperable({ activo: false })).toBe(false));
  it('mismo criterio que el cliente en los tres casos', () => {
    expect(proveedorOperable({ activo: true })).toBe(clienteOperable({ statusOperativo: 'ACTIVO' }));
    expect(proveedorOperable({})).toBe(clienteOperable({}));
    expect(proveedorOperable({ activo: false })).toBe(clienteOperable({ statusOperativo: 'INACTIVO' }));
  });
  it('soloActivos de la lista no esconde al que no trae el campo', () => {
    const lista = [{ id: 'a', nombre: 'A', activo: true }, { id: 'b', nombre: 'B' }, { id: 'c', nombre: 'C', activo: false }] as any[];
    expect(filtrarProveedores(lista, { soloActivos: true }).map(p => p.id)).toEqual(['a', 'b']);
  });
});

describe('statusOperativoDesdeActivo (seed de clientes)', () => {
  it('true → ACTIVO', () => expect(statusOperativoDesdeActivo(true)).toBe('ACTIVO'));
  it('false → INACTIVO', () => expect(statusOperativoDesdeActivo(false)).toBe('INACTIVO'));
  it('ausente NO es INACTIVO', () => {
    expect(statusOperativoDesdeActivo(undefined)).toBeUndefined();
    expect(clienteOperable({ statusOperativo: statusOperativoDesdeActivo(undefined) })).toBe(true);
  });
});
