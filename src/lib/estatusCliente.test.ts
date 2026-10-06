import { describe, it, expect } from 'vitest';
import { clienteOperable, estatusDeCliente, visibleEnAltas, contarSinEstatus, ETIQUETA_ESTATUS } from './estatusCliente';

describe('estatusCliente', () => {
  it('lee los dos valores válidos', () => {
    expect(estatusDeCliente({ statusOperativo: 'ACTIVO' })).toBe('activo');
    expect(estatusDeCliente({ statusOperativo: 'INACTIVO' })).toBe('inactivo');
  });
  it('ausente o fuera de la lista es sin estatus', () => {
    expect(estatusDeCliente({})).toBe('sin_estatus');
    expect(estatusDeCliente({ statusOperativo: undefined })).toBe('sin_estatus');
    expect(estatusDeCliente({ statusOperativo: null })).toBe('sin_estatus');
    expect(estatusDeCliente({ statusOperativo: '' })).toBe('sin_estatus');
    expect(estatusDeCliente({ statusOperativo: 'Activo' })).toBe('sin_estatus');
    expect(estatusDeCliente({ statusOperativo: 'SUSPENDIDO' })).toBe('sin_estatus');
  });
  it('la lista no esconde a los sin estatus, ni siquiera por omisión', () => {
    expect(visibleEnAltas({}, false)).toBe(true);
    expect(visibleEnAltas({ statusOperativo: 'XYZ' }, false)).toBe(true);
    expect(visibleEnAltas({ statusOperativo: 'ACTIVO' }, false)).toBe(true);
  });
  it('los inactivos solo se ven si se piden', () => {
    expect(visibleEnAltas({ statusOperativo: 'INACTIVO' }, false)).toBe(false);
    expect(visibleEnAltas({ statusOperativo: 'INACTIVO' }, true)).toBe(true);
  });
  it('cuenta el hueco', () => {
    expect(contarSinEstatus([{ statusOperativo: 'ACTIVO' }, {}, { statusOperativo: 'x' }, { statusOperativo: 'INACTIVO' }])).toBe(2);
  });
  it('la etiqueta es «Sin estatus»', () => {
    expect(ETIQUETA_ESTATUS.sin_estatus).toBe('Sin estatus');
  });

  describe('clienteOperable', () => {
    it('ACTIVO es operable', () => expect(clienteOperable({ statusOperativo: 'ACTIVO' })).toBe(true));
    it('INACTIVO no', () => expect(clienteOperable({ statusOperativo: 'INACTIVO' })).toBe(false));
    it('sin campo es operable', () => {
      expect(clienteOperable({})).toBe(true);
      expect(clienteOperable({ statusOperativo: null })).toBe(true);
    });
    it('un valor raro es operable (sin estatus)', () => {
      expect(clienteOperable({ statusOperativo: 'SUSPENDIDO' })).toBe(true);
      expect(clienteOperable({ statusOperativo: 'inactivo' })).toBe(true);
    });
    it('coincide con la lista de Altas por omisión', () => {
      for (const v of ['ACTIVO', 'INACTIVO', undefined, 'x']) {
        expect(clienteOperable({ statusOperativo: v })).toBe(visibleEnAltas({ statusOperativo: v }, false));
      }
    });
  });
});
