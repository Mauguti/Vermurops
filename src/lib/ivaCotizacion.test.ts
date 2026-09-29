import { describe, it, expect } from 'vitest';
import { ivaDeLinea, ubicacionDeLinea, necesitaContextoIVA } from './ivaCotizacion';


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

// ─── 1b · Solo se exige el dato que la regla va a leer ───────────────────────

describe('un servicio sin tráfico ni ubicación', () => {
  /*
   * Es el estado NORMAL de una cotización recién nacida: la ubicación no la
   * escribe ningún camino de alta —ni el formulario de solicitud, ni «Agregar
   * servicio», ni el alta rápida del Kanban—, solo se pone a mano en
   * Información → Operación.
   *
   * El bug: `ivaDeLinea` exigía los dos datos antes de mirar la regla, así que
   * un concepto de tasa fija salía «Sin determinar» por faltarle algo que su
   * regla nunca iba a leer. Son 56 de los 105 conceptos.
   */
  const pelado = {
    id: 'S1', tipo: 'maritimo',
    ruta: { origen: 'Por definir', destino: 'Por definir' },
    cotizacionesProveedor: [], profit: 0, recargosPct: 0, conceptos: [],
  } as never;

  it('fijo16 precarga 16% igual: su regla no mira el tráfico', () => {
    expect(ivaDeLinea('fijo16', pelado).iva).toEqual({ tasa: 16 });
  });

  it('fijo0 precarga 0%', () => {
    expect(ivaDeLinea('fijo0', pelado).iva).toEqual({ tasa: 0 });
  });

  it('exento precarga 0%', () => {
    expect(ivaDeLinea('exento', pelado).iva).toEqual({ tasa: 0 });
  });

  it('el flete terrestre conserva su retención del 4%', () => {
    expect(ivaDeLinea('terrestre_retencion', pelado).iva)
      .toEqual({ tasa: 16, retencion: 4 });
  });

  it('el flete aéreo conserva su división 25/75', () => {
    expect(ivaDeLinea('aereo_split', pelado).iva?.split)
      .toEqual([{ porcentaje: 25, tasa: 16 }, { porcentaje: 75, tasa: 0 }]);
  });

  it('espejo SÍ se queda sin determinar, y dice cuál de los dos falta', () => {
    // Aquí el dato no es un trámite: es la mitad de la regla (§4.2).
    expect(ivaDeLinea('espejo', pelado).motivo).toBe('sin_trafico');
  });

  it('con tráfico pero sin ubicación, espejo lo dice también', () => {
    const conTrafico = { ...(pelado as object), trafico: 'importacion' } as never;
    expect(ivaDeLinea('espejo', conTrafico).motivo).toBe('sin_ubicacion');
  });

  it('«revisar» sigue siendo captura manual, no un dato que falte', () => {
    expect(ivaDeLinea('revisar', pelado).motivo).toBe('requiere_revision');
  });

  it('sin concepto del catálogo no hay regla que precargar', () => {
    expect(ivaDeLinea(null, pelado).motivo).toBe('sin_concepto');
  });
});

describe('necesitaContextoIVA', () => {
  it('solo espejo mira el tráfico y la ubicación', () => {
    expect(necesitaContextoIVA('espejo')).toBe(true);
    (['fijo16', 'fijo0', 'exento', 'aereo_split', 'terrestre_retencion', 'revisar'] as const)
      .forEach(r => expect(necesitaContextoIVA(r)).toBe(false));
  });
});
