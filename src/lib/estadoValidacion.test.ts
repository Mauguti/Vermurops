import { describe, it, expect } from 'vitest';
import {
  estadoValidacion, etiquetaValidacion, esEntidadDeMagaya,
  type EntidadValidable,
} from './estadoValidacion';
import type { ProveedorVermur } from '../components/proveedores/ProveedoresData';
import type { ClienteVermur } from '../components/clientes/ClientesData';

// ── Proveedores de prueba ────────────────────────────────────────────────────

const provBase: EntidadValidable = { origenDatos: 'manual' };
const provMagaya: EntidadValidable = { origenDatos: 'magaya', numeroEntidadMagaya: 'RFC123' };
const provSoloNumero: EntidadValidable = { origenDatos: 'manual', numeroEntidadMagaya: 'XYZ' };
const provValidado: EntidadValidable = {
  origenDatos: 'manual',
  expedienteValidado: { por: 'Julio', fecha: '2026-10-01T10:00:00.000Z' },
};
const provMagayaYValidado: EntidadValidable = {
  origenDatos: 'magaya',
  numeroEntidadMagaya: 'RFC123',
  expedienteValidado: { por: 'Julio', fecha: '2026-10-01T10:00:00.000Z' },
};

describe('estadoValidacion — proveedores', () => {
  it('proveedor de Magaya cuenta como heredado', () => {
    expect(estadoValidacion(provMagaya)).toBe('heredado_magaya');
  });

  it('proveedor con solo numeroEntidadMagaya también es heredado', () => {
    expect(estadoValidacion(provSoloNumero)).toBe('heredado_magaya');
  });

  it('proveedor manual sin validar queda en sin_validar', () => {
    expect(estadoValidacion(provBase)).toBe('sin_validar');
  });

  it('proveedor manual con expedienteValidado queda como validado', () => {
    expect(estadoValidacion(provValidado)).toBe('validado');
  });

  it('validado formal manda sobre Magaya', () => {
    expect(estadoValidacion(provMagayaYValidado)).toBe('validado');
  });

  it('null y undefined son sin_validar', () => {
    expect(estadoValidacion(null)).toBe('sin_validar');
    expect(estadoValidacion(undefined)).toBe('sin_validar');
  });
});

describe('esEntidadDeMagaya', () => {
  it('detecta por origenDatos', () => {
    expect(esEntidadDeMagaya({ origenDatos: 'magaya' })).toBe(true);
  });

  it('detecta por numeroEntidadMagaya', () => {
    expect(esEntidadDeMagaya({ numeroEntidadMagaya: 'ABC' })).toBe(true);
  });

  it('manual sin número no es de Magaya', () => {
    expect(esEntidadDeMagaya({ origenDatos: 'manual' })).toBe(false);
    expect(esEntidadDeMagaya({})).toBe(false);
  });
});

describe('etiquetaValidacion — proveedores', () => {
  it('heredado de Magaya', () => {
    expect(etiquetaValidacion(provMagaya)).toBe('Validado · heredado de Magaya');
  });

  it('validado formalmente muestra quién y cuándo', () => {
    expect(etiquetaValidacion(provValidado)).toBe('Validado por Julio el 2026-10-01');
  });

  it('sin validar', () => {
    expect(etiquetaValidacion(provBase)).toBe('Expediente sin validar');
    expect(etiquetaValidacion(null)).toBe('Expediente sin validar');
  });
});

describe('compatibilidad con ClienteVermur', () => {
  const clienteBase = { id: 'CLI-1', nombre: 'Test' } as unknown as ClienteVermur;
  const clienteMagaya = { ...clienteBase, origenDatos: 'magaya', numeroEntidadMagaya: '123' } as ClienteVermur;
  const clienteNuevo = { ...clienteBase, origenDatos: 'manual' } as ClienteVermur;
  const clienteValidado = {
    ...clienteBase,
    expedienteValidado: { por: 'Admin', fecha: '2026-09-25T10:00:00.000Z' },
  } as ClienteVermur;

  it('ClienteVermur funciona igual que antes', () => {
    expect(estadoValidacion(clienteMagaya)).toBe('heredado_magaya');
    expect(estadoValidacion(clienteNuevo)).toBe('sin_validar');
    expect(estadoValidacion(clienteValidado)).toBe('validado');
  });
});

describe('compatibilidad con ProveedorVermur tipado', () => {
  it('ProveedorVermur cumple EntidadValidable', () => {
    const p = {
      origenDatos: 'manual',
      expedienteValidado: null,
    } as unknown as ProveedorVermur;

    expect(estadoValidacion(p)).toBe('sin_validar');
  });

  it('ProveedorVermur de Magaya con expedienteValidado', () => {
    const p = {
      origenDatos: 'magaya',
      numeroEntidadMagaya: 'RFC456',
      expedienteValidado: { por: 'Gaby', fecha: '2026-10-01T08:00:00.000Z', notas: 'OK' },
    } as unknown as ProveedorVermur;

    expect(estadoValidacion(p)).toBe('validado');
    expect(etiquetaValidacion(p)).toBe('Validado por Gaby el 2026-10-01');
  });
});
