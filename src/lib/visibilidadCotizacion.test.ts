/**
 * visibilidadCotizacion.test.ts
 *
 * Sesión de feedback del 30-ago-2026. Gabi: «veo un sistema para todo Vermur,
 * menos para mí». Estos tests fijan qué ve Ventas y qué no, porque es fácil
 * que un cambio futuro le devuelva por accidente el desglose de costos.
 */

import { describe, it, expect } from 'vitest';
import {
  visibilidadDe, tabsVisibles, lineaTiempoColapsada,
  pasoDeVentas, indicePasoVentas, esEtapaInternaPricing,
  LINEA_TIEMPO_VENTAS,
} from './visibilidadCotizacion';
import { UserRole } from '../auth/users';
import { PIPELINE_STAGES, PipelineStageId } from '../components/quotes/QuotesData';

describe('lo que Ventas NO ve', () => {
  const v = visibilidadDe('ventas');

  it('no ve el desglose por concepto', () => expect(v.desglosePorConcepto).toBe(false));
  it('no ve los proveedores', () => expect(v.proveedores).toBe(false));
  it('no ve los adjuntos de tarifas', () => expect(v.adjuntosTarifa).toBe(false));

  it('la pestaña Servicios no está entre sus pestañas', () => {
    expect(tabsVisibles('ventas')).not.toContain('servicios');
  });
});

describe('lo que Ventas SÍ ve', () => {
  it('el margen de la operación completa', () => {
    // «que vean la coti, o sea, la información que tiene una cotización, y el
    // margen. Eso es todo.»
    expect(visibilidadDe('ventas').margenGeneral).toBe(true);
  });

  it('la línea del tiempo', () => {
    expect(visibilidadDe('ventas').lineaTiempo).toBe(true);
  });

  it('información, actividades, historial y chat', () => {
    expect(tabsVisibles('ventas')).toEqual(['info', 'actividades', 'historial', 'chat']);
  });
});

describe('los demás roles conservan el desglose', () => {
  const OTROS: UserRole[] = ['pricing', 'operaciones', 'administracion', 'admin'];

  OTROS.forEach(rol => {
    it(`${rol} ve costos, proveedores y adjuntos`, () => {
      const v = visibilidadDe(rol);
      expect(v.desglosePorConcepto).toBe(true);
      expect(v.proveedores).toBe(true);
      expect(v.adjuntosTarifa).toBe(true);
    });

    it(`${rol} conserva la pestaña Servicios`, () => {
      expect(tabsVisibles(rol)).toContain('servicios');
    });
  });

  it('sin rol se aplica lo restrictivo por defecto… salvo que no sea ventas', () => {
    // Un rol desconocido NO debería ver menos que pricing por accidente, pero
    // tampoco llega aquí sin pasar por isAllowed.
    expect(visibilidadDe(undefined).desglosePorConcepto).toBe(true);
  });
});

describe('línea del tiempo de Ventas', () => {
  it('solo la de Ventas se colapsa', () => {
    expect(lineaTiempoColapsada('ventas')).toBe(true);
    expect(lineaTiempoColapsada('pricing')).toBe(false);
    expect(lineaTiempoColapsada('admin')).toBe(false);
  });

  it('tiene cinco pasos', () => {
    expect(LINEA_TIEMPO_VENTAS.map(p => p.label)).toEqual([
      'Solicitud', 'En pricing', 'Enviada al cliente', 'Negociación', 'Ganada / Perdida',
    ]);
  });

  it('las tres etapas internas de Pricing se colapsan en «En pricing»', () => {
    ['pricing_solicitando', 'cotizaciones_recibidas', 'consolidada'].forEach(e => {
      expect(pasoDeVentas(e as PipelineStageId)?.label).toBe('En pricing');
    });
  });

  it('«solicitado a pricing» también cae en «En pricing»', () => {
    expect(pasoDeVentas('solicitado_pricing')?.label).toBe('En pricing');
  });

  it('INVARIANTE: toda etapa del pipeline cae en algún paso de Ventas', () => {
    // Si se añade una etapa y nadie actualiza esto, Ventas vería una línea del
    // tiempo con un hueco: su cotización desaparecería del avance.
    PIPELINE_STAGES.forEach(s => {
      expect(pasoDeVentas(s.id), `la etapa ${s.id} no cae en ningún paso`).not.toBeNull();
    });
  });

  it('el avance es monótono: las etapas posteriores no retroceden de paso', () => {
    expect(indicePasoVentas('solicitud_cliente')).toBe(0);
    expect(indicePasoVentas('solicitado_pricing')).toBe(1);
    expect(indicePasoVentas('consolidada')).toBe(1);
    expect(indicePasoVentas('enviada_cliente')).toBe(2);
    expect(indicePasoVentas('negociacion')).toBe(3);
    expect(indicePasoVentas('ganada')).toBe(4);
    expect(indicePasoVentas('perdida')).toBe(4);
  });

  it('esEtapaInternaPricing distingue lo interno de lo que Ventas sí nombra', () => {
    expect(esEtapaInternaPricing('cotizaciones_recibidas')).toBe(true);
    expect(esEtapaInternaPricing('solicitado_pricing')).toBe(false);
    expect(esEtapaInternaPricing('negociacion')).toBe(false);
  });
});
