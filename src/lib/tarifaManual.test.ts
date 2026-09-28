import { describe, it, expect } from 'vitest';
import {
  capturarTarifaManual, razonInvalida, tarifaCapturadaAqui,
} from './tarifaManual';
import { aplanarCotizacion } from './lineasCotizacion';
import type { KanbanQuote } from '../components/quotes/QuotesData';

/** El caso real: «Inland Freight Coordination» de COT-2026-0034. */
const quote = (): KanbanQuote => ({
  id: 'COT-2026-0034', etapa: 'consolidada',
  servicios: [{
    id: 'S1', tipo: 'maritimo', trafico: 'importacion', ubicacion: 'destino',
    cotizacionesProveedor: [], profit: 0, recargosPct: 0,
    conceptos: [{
      id: 'c1', nombre: 'Inland Freight Coordination', conceptoId: 'CON-055',
      costo: 110, costoCapturado: true, profit: 0, venta: 110, margen: 0,
      subconceptos: [], tarifas: [], proveedoresOficialIds: [],
    }],
  }],
} as never);

const DATOS = {
  proveedorId: 'PRV-0042', proveedorNombre: 'Promotora Amacarga',
  monto: 110, moneda: 'MXN' as const,
};

describe('lo que hace inválida una captura', () => {
  it('sin proveedor no se crea', () => {
    expect(razonInvalida({ ...DATOS, proveedorNombre: '  ' })).toMatch(/proveedor/i);
  });
  it('sin moneda tampoco: no se asume ninguna', () => {
    expect(razonInvalida({ ...DATOS, moneda: undefined })).toMatch(/moneda/i);
  });
  it('un costo en cero o negativo tampoco', () => {
    expect(razonInvalida({ ...DATOS, monto: 0 })).toMatch(/mayor que cero/i);
    expect(razonInvalida({ ...DATOS, monto: -5 })).toMatch(/mayor que cero/i);
  });
  it('con todo, adelante', () => {
    expect(razonInvalida(DATOS)).toBeNull();
  });
  it('una captura inválida devuelve la cotización intacta', () => {
    const q = quote();
    expect(capturarTarifaManual(q, 'S1', 'c1', { ...DATOS, monto: 0 })).toBe(q);
  });
});

describe('la tarifa capturada en la cotización', () => {
  const r = () => capturarTarifaManual(quote(), 'S1', 'c1', DATOS, 'tm-1');

  it('nace dentro del concepto, no en el tarifario general', () => {
    const c = r().servicios[0].conceptos[0];
    expect(c.tarifas).toHaveLength(1);
    expect(c.tarifas[0].capturadaEnCotizacion).toBe(true);
    expect(c.tarifas[0].tarifaOrigenId).toBeNull();
  });

  it('conserva la moneda ELEGIDA, no cae a USD', () => {
    // Era justo así como un costo en pesos terminaba rotulado en dólares.
    expect(r().servicios[0].conceptos[0].tarifas[0].moneda).toBe('MXN');
  });

  it('nace con la modalidad del servicio', () => {
    expect(r().servicios[0].conceptos[0].tarifas[0].modalidad).toBe('maritimo');
  });

  it('escribe las DOS marcas de elegida en la misma operación', () => {
    // Actualizar una sola es lo que produjo «comparativa 60, tabla 20».
    const c = r().servicios[0].conceptos[0];
    expect(c.proveedoresOficialIds).toEqual(['tm-1']);
    expect(c.tarifas[0].seleccionada).toBe(true);
  });

  it('deselecciona las anteriores', () => {
    const conPrevia = quote();
    conPrevia.servicios[0].conceptos[0].tarifas = [
      { id: 'vieja', proveedor: 'Otro', contacto: '', monto: 60, moneda: 'MXN', seleccionada: true },
    ] as never;
    const c = capturarTarifaManual(conPrevia, 'S1', 'c1', DATOS, 'tm-1')
      .servicios[0].conceptos[0];
    expect(c.tarifas.find(t => t.id === 'vieja')!.seleccionada).toBe(false);
    expect(c.proveedoresOficialIds).toEqual(['tm-1']);
  });

  it('la línea ya tiene proveedor y deja de bloquear el freno', () => {
    const [l] = aplanarCotizacion(r());
    expect(l.proveedorNombre).toBe('Promotora Amacarga');
    expect(l.proveedorId).toBe('PRV-0042');
    expect(l.costo).toBe(110);
    expect(l.moneda).toBe('MXN');
    expect(l.costoDerivado).toBe(true);
  });

  it('no muta la cotización que recibe', () => {
    const q = quote();
    capturarTarifaManual(q, 'S1', 'c1', DATOS, 'tm-1');
    expect(q.servicios[0].conceptos[0].tarifas).toHaveLength(0);
  });

  it('un servicio o concepto inexistente la devuelve intacta', () => {
    const q = quote();
    expect(capturarTarifaManual(q, 'NO', 'c1', DATOS).servicios[0].conceptos[0].tarifas).toHaveLength(0);
    expect(capturarTarifaManual(q, 'S1', 'NO', DATOS).servicios[0].conceptos[0].tarifas).toHaveLength(0);
  });
});

describe('el candado sabe de dónde viene', () => {
  it('reconoce la capturada aquí', () => {
    const c = capturarTarifaManual(quote(), 'S1', 'c1', DATOS, 'tm-1')
      .servicios[0].conceptos[0];
    expect(tarifaCapturadaAqui(c.tarifas, c.proveedoresOficialIds!)?.id).toBe('tm-1');
  });

  it('una del tarifario NO cuenta como capturada aquí', () => {
    const t = [{ id: 't1', proveedor: 'X', contacto: '', monto: 20, moneda: 'MXN', seleccionada: true, tarifaOrigenId: 'TAR-9' }];
    expect(tarifaCapturadaAqui(t as never, ['t1'])).toBeNull();
  });

  it('con varias oficiales no hay una sola procedencia que enseñar', () => {
    expect(tarifaCapturadaAqui([], ['a', 'b'])).toBeNull();
  });
});
