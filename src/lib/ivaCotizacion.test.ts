import { describe, it, expect } from 'vitest';
import { ivaDeLinea, ubicacionDeLinea } from './ivaCotizacion';


// ─── La ubicación del RENGLÓN, no solo la del servicio ───────────────────────

describe('ubicacionDeLinea', () => {
  const srvOrigen = { ubicacion: 'origen' as const };
  const srvDestino = { ubicacion: 'destino' as const };

  it('un concepto que SOLO aplica en destino ocurre en destino, aunque el servicio diga origen', () => {
    /*
     * El bug: la ubicación vivía solo en el servicio, así que un marítimo de
     * importación marcado «origen» ponía en 0% a TODOS sus conceptos —
     * incluidos los de destino. Sobre la regla espejo eso es IVA de menos.
     */
    expect(ubicacionDeLinea({ aplicaOrigen: false, aplicaDestino: true }, srvOrigen))
      .toBe('destino');
  });

  it('y al revés', () => {
    expect(ubicacionDeLinea({ aplicaOrigen: true, aplicaDestino: false }, srvDestino))
      .toBe('origen');
  });

  it('si el concepto aplica a los DOS lados, manda el servicio', () => {
    // El catálogo no sabe distinguir: se usa el único dato que queda.
    expect(ubicacionDeLinea({ aplicaOrigen: true, aplicaDestino: true }, srvOrigen))
      .toBe('origen');
  });

  it('si no declara ninguno, también manda el servicio', () => {
    // Son 87 de los 105 conceptos: la mayoría no trae las banderas.
    expect(ubicacionDeLinea({ aplicaOrigen: false, aplicaDestino: false }, srvDestino))
      .toBe('destino');
  });

  it('sin concepto del catálogo, manda el servicio', () => {
    expect(ubicacionDeLinea(null, srvDestino)).toBe('destino');
    expect(ubicacionDeLinea(undefined, srvOrigen)).toBe('origen');
  });

  it('sin ubicación en ninguno de los dos, no se inventa', () => {
    expect(ubicacionDeLinea(null, { ubicacion: undefined })).toBeUndefined();
  });
});

describe('ivaDeLinea con la ubicación del concepto', () => {
  const srv = {
    id: 'S1', tipo: 'maritimo', trafico: 'importacion', ubicacion: 'origen',
    cotizacionesProveedor: [], profit: 0, recargosPct: 0, conceptos: [],
  } as never;

  it('importación + concepto de destino: 16%, aunque el servicio diga origen', () => {
    const r = ivaDeLinea('espejo', srv, { aplicaOrigen: false, aplicaDestino: true });
    expect(r.iva?.tasa).toBe(16);
  });

  it('el mismo servicio, concepto de origen: 0%', () => {
    const r = ivaDeLinea('espejo', srv, { aplicaOrigen: true, aplicaDestino: false });
    expect(r.iva?.tasa).toBe(0);
  });

  it('sin concepto se comporta como antes: manda el servicio', () => {
    expect(ivaDeLinea('espejo', srv).iva?.tasa).toBe(0);
  });
});
