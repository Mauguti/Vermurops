import { describe, it, expect } from 'vitest';
import {
  COLECCION_POR_ROL, modalidadRelevantePara, refDe, estaValidada,
  vincular, escribirNombre, desvincular, clienteDelEmbarque, refsDesdeCotizacion,
} from './entidadesEmbarque';

describe('el nombre es texto; el enlace es aparte y opcional', () => {
  it('elegir del catálogo escribe nombre Y enlace', () => {
    const r = vincular(undefined, 'consignatario', { id: 'PRV-1', nombre: 'Alfa S.A.', coleccion: 'proveedores' });
    expect(r.nombre).toBe('Alfa S.A.');
    expect(refDe(r.refs, 'consignatario')).toEqual({ id: 'PRV-1', coleccion: 'proveedores' });
    expect(estaValidada(r.refs, 'consignatario')).toBe(true);
  });

  it('teclear un nombre distinto suelta el enlace', () => {
    const { refs } = vincular(undefined, 'consignatario', { id: 'PRV-1', nombre: 'Alfa S.A.', coleccion: 'proveedores' });
    const r = escribirNombre(refs, 'consignatario', 'Alfa Shanghai Ltd', 'Alfa S.A.');
    expect(r.nombre).toBe('Alfa Shanghai Ltd');
    expect(estaValidada(r.refs, 'consignatario')).toBe(false);
  });

  it('salir del campo sin cambiar el nombre NO desvalida', () => {
    const { refs } = vincular(undefined, 'consignatario', { id: 'PRV-1', nombre: 'Alfa S.A.', coleccion: 'proveedores' });
    const r = escribirNombre(refs, 'consignatario', 'Alfa S.A. ', 'Alfa S.A.');
    expect(estaValidada(r.refs, 'consignatario')).toBe(true);
  });

  it('soltar un rol no toca a los demás', () => {
    let refs = vincular(undefined, 'consignatario', { id: 'PRV-1', nombre: 'A', coleccion: 'proveedores' }).refs;
    refs = vincular(refs, 'clienteCobrar', { id: 'CLI-1', nombre: 'B', coleccion: 'clientes' }).refs;
    const sin = desvincular(refs, 'consignatario');
    expect(estaValidada(sin, 'consignatario')).toBe(false);
    expect(estaValidada(sin, 'clienteCobrar')).toBe(true);
    expect(estaValidada(refs, 'consignatario')).toBe(true); // el original no se muta
  });

  it('un proveedor como cliente a cobrar se rechaza: el crédito saldría de quien no es', () => {
    expect(() => vincular(undefined, 'clienteCobrar', { id: 'PRV-1', nombre: 'X', coleccion: 'proveedores' }))
      .toThrow('clientes');
  });
});

describe('qué catálogo le toca a cada rol', () => {
  it('cliente a cobrar e importador → clientes; el resto y el transportista → proveedores', () => {
    expect(COLECCION_POR_ROL.clienteCobrar).toBe('clientes');
    expect(COLECCION_POR_ROL.importador).toBe('clientes');
    expect(COLECCION_POR_ROL.expedidor).toBe('proveedores');
    expect(COLECCION_POR_ROL.agenteAduanal).toBe('proveedores');
    expect(COLECCION_POR_ROL.transportista).toBe('proveedores');
  });

  it('el agente aduanal ordena por aduanal; el transportista por la modalidad del embarque', () => {
    expect(modalidadRelevantePara('agenteAduanal', 'maritimo')).toBe('aduanal');
    expect(modalidadRelevantePara('transportista', 'aereo')).toBe('aereo');
    expect(modalidadRelevantePara('transportista', 'multimodal')).toBeUndefined();
    expect(modalidadRelevantePara('consignatario', 'maritimo')).toBeUndefined();
  });
});

describe('clienteDelEmbarque', () => {
  const clientes = [
    { id: 'CLI-1', nombre: 'Alfa Corporativo S.A.' },
    { id: 'CLI-2', nombre: 'Alfa Corporativo Norte S.A.' },
  ];

  it('por enlace primero, aunque el nombre esté tecleado distinto', () => {
    const e = { entidades: { clienteCobrar: 'ALFA CORP' }, entidadesRef: { clienteCobrar: { id: 'CLI-2', coleccion: 'clientes' as const } } };
    expect(clienteDelEmbarque(e, clientes)?.id).toBe('CLI-2');
  });

  it('sin enlace, por nombre EXACTO: los embarques anteriores al enlace', () => {
    expect(clienteDelEmbarque({ entidades: { clienteCobrar: 'Alfa Corporativo S.A.' } }, clientes)?.id).toBe('CLI-1');
    expect(clienteDelEmbarque({ entidades: { clienteCobrar: 'Alfa Corporativo' } }, clientes)).toBeNull();
  });

  it('un enlace a un cliente que ya no existe cae al nombre', () => {
    const e = { entidades: { clienteCobrar: 'Alfa Corporativo S.A.' }, entidadesRef: { clienteCobrar: { id: 'CLI-BORRADO', coleccion: 'clientes' as const } } };
    expect(clienteDelEmbarque(e, clientes)?.id).toBe('CLI-1');
  });

  it('sin nombre ni enlace, no hay cliente', () => {
    expect(clienteDelEmbarque({ entidades: { clienteCobrar: '' } }, clientes)).toBeNull();
  });
});

describe('refsDesdeCotizacion', () => {
  it('el cliente vinculado a la cotización es el cliente a cobrar', () => {
    expect(refsDesdeCotizacion({ clienteId: 'CLI-9' })).toEqual({ clienteCobrar: { id: 'CLI-9', coleccion: 'clientes' } });
  });
  it('una cotización legacy sin cliente no enlaza nada', () => {
    expect(refsDesdeCotizacion({ clienteId: null })).toEqual({});
    expect(refsDesdeCotizacion({})).toEqual({});
  });
});
