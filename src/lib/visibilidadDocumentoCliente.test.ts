import { describe, it, expect } from 'vitest';
import type { EmbarqueDocumento } from '../components/shipments/EmbarquesData';
import {
  reglaDeTipo, esVisibleParaCliente, esExcepcion, advertenciaAlMostrar,
  documentosParaCliente,
} from './visibilidadDocumentoCliente';

const doc = (over: Partial<EmbarqueDocumento> & { tipo: string }): EmbarqueDocumento => ({
  id: 'd1', nombre: 'doc.pdf', url: '', fechaCarga: '2026-09-24', cargadoPor: 'op',
  ...over,
} as EmbarqueDocumento);

describe('la regla por tipo', () => {
  it('la factura al cliente nace visible', () => {
    const r = reglaDeTipo('factura_cliente');
    expect(r.clase).toBe('visible');
    expect(r.porDefecto).toBe(true);
  });

  it.each(['factura_proveedor', 'carta_encomienda', 'pedimento'])(
    '%s es sensible y nace oculta', tipo => {
      const r = reglaDeTipo(tipo);
      expect(r.clase).toBe('sensible');
      expect(r.porDefecto).toBe(false);
      expect(r.razon).not.toBe('');
    });

  it('la factura de proveedor explica que revela el margen', () => {
    expect(reglaDeTipo('factura_proveedor').razon).toMatch(/margen/i);
  });

  it('todo lo demás nace interno', () => {
    expect(reglaDeTipo('bl_maritimo').clase).toBe('interno');
    expect(reglaDeTipo('packing_list').porDefecto).toBe(false);
  });

  it('un tipo desconocido cae en interno, que es lo seguro', () => {
    const r = reglaDeTipo('algo_que_n8n_inventó');
    expect(r.clase).toBe('interno');
    expect(r.porDefecto).toBe(false);
  });
});

describe('respaldo del valor viejo', () => {
  it('sin el campo, manda el tipo', () => {
    expect(esVisibleParaCliente(doc({ tipo: 'factura_cliente' }))).toBe(true);
    expect(esVisibleParaCliente(doc({ tipo: 'bl_maritimo' }))).toBe(false);
    expect(esVisibleParaCliente(doc({ tipo: 'factura_proveedor' }))).toBe(false);
  });

  it('el legacy «factura» se lee como factura del cliente', () => {
    expect(esVisibleParaCliente(doc({ tipo: 'factura' }))).toBe(true);
  });

  it('con el campo, manda el campo', () => {
    expect(esVisibleParaCliente(doc({ tipo: 'bl_maritimo', visibleCliente: true }))).toBe(true);
    expect(esVisibleParaCliente(doc({ tipo: 'factura_cliente', visibleCliente: false }))).toBe(false);
  });

  it('false explícito no se confunde con ausente', () => {
    const marcado = doc({ tipo: 'factura_cliente', visibleCliente: false });
    expect(esVisibleParaCliente(marcado)).toBe(false);
    expect(esExcepcion(marcado)).toBe(true);
  });
});

describe('excepciones', () => {
  it('marcar lo que ya era su valor no es excepción', () => {
    expect(esExcepcion(doc({ tipo: 'bl_maritimo', visibleCliente: false }))).toBe(false);
  });
  it('sin marcar, nunca es excepción', () => {
    expect(esExcepcion(doc({ tipo: 'pedimento' }))).toBe(false);
  });
  it('enseñar un pedimento sí lo es', () => {
    expect(esExcepcion(doc({ tipo: 'pedimento', visibleCliente: true }))).toBe(true);
  });
});

describe('advertencia al marcar visible', () => {
  it('los sensibles avisan con su razón', () => {
    expect(advertenciaAlMostrar('factura_proveedor')).toMatch(/margen/i);
    expect(advertenciaAlMostrar('carta_encomienda')).toMatch(/poder/i);
    expect(advertenciaAlMostrar('pedimento')).toMatch(/fiscal/i);
  });
  it('los demás no avisan nada', () => {
    expect(advertenciaAlMostrar('bl_maritimo')).toBeNull();
    expect(advertenciaAlMostrar('factura_cliente')).toBeNull();
  });
});

describe('lo que el portal leerá', () => {
  it('solo los visibles, respetando marcas y respaldo', () => {
    const docs = [
      doc({ id: 'a', tipo: 'factura_cliente' }),
      doc({ id: 'b', tipo: 'factura_proveedor' }),
      doc({ id: 'c', tipo: 'bl_maritimo', visibleCliente: true }),
      doc({ id: 'd', tipo: 'pedimento' }),
    ];
    expect(documentosParaCliente(docs).map(d => d.id)).toEqual(['a', 'c']);
  });

  it('una lista vacía no truena', () => {
    expect(documentosParaCliente([])).toEqual([]);
  });
});
