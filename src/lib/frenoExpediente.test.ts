import { describe, it, expect } from 'vitest';
import {
  estadoValidacion, etiquetaValidacion, frenoExpediente, exigirExpediente, expedientePendiente,
  RAZON_EXPEDIENTE_SIN_VALIDAR, RAZON_JUSTIFICACION_OBLIGATORIA, RAZON_CLIENTE_NO_ENCONTRADO,
} from './frenoExpediente';
import { RAZON_SIN_CLIENTE } from './frenoCliente';
import type { ClienteVermur } from '../components/clientes/ClientesData';

const base = { id: 'CLI-1', nombre: 'Cliente', fechaAlta: '2026-01-01' } as unknown as ClienteVermur;
const magaya = { ...base, origenDatos: 'magaya', numeroEntidadMagaya: '123' } as ClienteVermur;
const soloNumero = { ...base, numeroEntidadMagaya: '123' } as ClienteVermur;
const nuevo = { ...base } as ClienteVermur;
const validado = { ...base, expedienteValidado: { por: 'Julio', fecha: '2026-09-25T10:00:00.000Z' } } as ClienteVermur;
const conCliente = { clienteId: 'CLI-1' };
const sinCliente = {};

describe('estadoValidacion / etiqueta', () => {
  it('Magaya cuenta como validado de origen, por origenDatos o por número de entidad', () => {
    expect(estadoValidacion(magaya)).toBe('heredado_magaya');
    expect(estadoValidacion(soloNumero)).toBe('heredado_magaya');
    expect(etiquetaValidacion(magaya)).toBe('Validado · heredado de Magaya');
  });
  it('creado en VermurOps sin validar; validado formal manda sobre Magaya', () => {
    expect(estadoValidacion(nuevo)).toBe('sin_validar');
    expect(estadoValidacion({ ...magaya, expedienteValidado: validado.expedienteValidado })).toBe('validado');
    expect(etiquetaValidacion(validado)).toBe('Validado por Julio el 2026-09-25');
    expect(estadoValidacion(null)).toBe('sin_validar');
  });
});

describe('frenoExpediente · los cuatro casos', () => {
  it('sin cliente: freno duro para todos, incluso admin con justificación', () => {
    for (const rol of ['ventas', 'pricing', 'admin'] as const) {
      const r = frenoExpediente(sinCliente, { cliente: magaya, rol, justificacion: 'urge' });
      expect(r).toEqual({ ok: false, razon: RAZON_SIN_CLIENTE });
    }
  });
  it('cliente que no existe en Altas: no', () => {
    expect(frenoExpediente(conCliente, { cliente: null, rol: 'admin', justificacion: 'x' })).toEqual({ ok: false, razon: RAZON_CLIENTE_NO_ENCONTRADO });
    expect(frenoExpediente(conCliente, { cliente: undefined, rol: 'admin' }).ok).toBe(false);
  });
  it('heredado de Magaya: pasa para cualquier rol, sin salto', () => {
    for (const rol of ['ventas', 'pricing', 'admin'] as const) {
      expect(frenoExpediente(conCliente, { cliente: magaya, rol })).toEqual({ ok: true, salto: null });
    }
  });
  it('validado formalmente: pasa, sin salto', () => {
    expect(frenoExpediente(conCliente, { cliente: validado, rol: 'ventas' })).toEqual({ ok: true, salto: null });
  });
  it('sin validar: ventas y pricing no pasan, con o sin justificación', () => {
    for (const rol of ['ventas', 'pricing'] as const) {
      expect(frenoExpediente(conCliente, { cliente: nuevo, rol })).toEqual({ ok: false, razon: RAZON_EXPEDIENTE_SIN_VALIDAR });
      expect(frenoExpediente(conCliente, { cliente: nuevo, rol, justificacion: 'urge' })).toEqual({ ok: false, razon: RAZON_EXPEDIENTE_SIN_VALIDAR });
    }
  });
  it('sin validar: admin sin justificación, vacía o solo espacios: no', () => {
    expect(frenoExpediente(conCliente, { cliente: nuevo, rol: 'admin' })).toEqual({ ok: false, razon: RAZON_JUSTIFICACION_OBLIGATORIA });
    expect(frenoExpediente(conCliente, { cliente: nuevo, rol: 'admin', justificacion: '' }).ok).toBe(false);
    expect(frenoExpediente(conCliente, { cliente: nuevo, rol: 'admin', justificacion: '   ' }).ok).toBe(false);
  });
  it('sin validar: admin con justificación pasa y deja el salto registrado', () => {
    const r = frenoExpediente(conCliente, { cliente: nuevo, rol: 'admin', justificacion: '  El cliente ya opera con nosotros desde 2019  ', por: 'Julio', ahora: '2026-09-25T12:00:00.000Z' });
    expect(r).toEqual({ ok: true, salto: { por: 'Julio', fecha: '2026-09-25T12:00:00.000Z', justificacion: 'El cliente ya opera con nosotros desde 2019' } });
  });
  it('sin validar con salto previo registrado (ruta manual, bandera apagada): pasa para Operaciones y hereda el salto', () => {
    const previo = { por: 'Julio', fecha: '2026-09-25T12:00:00.000Z', justificacion: 'urge' };
    expect(frenoExpediente(conCliente, { cliente: nuevo, rol: 'operaciones', saltoPrevio: previo })).toEqual({ ok: true, salto: previo });
  });
  it('exigirExpediente lanza con la razón', () => {
    expect(() => exigirExpediente(conCliente, { cliente: nuevo, rol: 'ventas' })).toThrow(RAZON_EXPEDIENTE_SIN_VALIDAR);
    expect(exigirExpediente(conCliente, { cliente: magaya, rol: 'ventas' })).toBeNull();
  });
});

describe('expedientePendiente', () => {
  const salto = { por: 'Julio', fecha: '2026-09-25', justificacion: 'urge' };
  it('hay salto y el cliente sigue sin validar → pendiente', () => {
    expect(expedientePendiente({ saltoExpediente: salto }, nuevo)).toBe(true);
  });
  it('al validar al cliente el aviso desaparece solo; el salto se queda', () => {
    expect(expedientePendiente({ saltoExpediente: salto }, validado)).toBe(false);
  });
  it('sin salto no hay aviso, aunque el cliente no esté validado', () => {
    expect(expedientePendiente({}, nuevo)).toBe(false);
    expect(expedientePendiente({ saltoExpediente: null }, nuevo)).toBe(false);
  });
});
