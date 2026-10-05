/**
 * traficoEmbarque.test.ts — tarea 59.
 *
 * Lo que amarran estos tests: que el tráfico se lea del folio cuando el folio
 * lo dice, de la ruta cuando no, y que NO se invente cuando ninguna de las dos
 * alcanza; y que el mes de cierre use la fecha del lado mexicano de la
 * operación (arribo en impo, salida en expo) y nunca las dos.
 */

import { describe, it, expect } from 'vitest';
import {
  campoDeCierre, cierreDelEmbarque, etiquetaMes, mesDeCierre,
  mesesDeCierrePresentes, traficoDeEmbarque, type EmbarqueParaTrafico,
} from './traficoEmbarque';

function emb(p: Partial<EmbarqueParaTrafico> & {
  folio?: string; origen?: string; destino?: string; eta?: string; etd?: string;
}): EmbarqueParaTrafico {
  return {
    folio: p.folio ?? '',
    ruta: {
      origen: { puertoCarga: p.origen ?? '' },
      destino: { puertoDescarga: p.destino ?? '' },
    },
    fechas: { arribo: p.eta ?? '', salida: p.etd ?? '' },
  };
}

describe('traficoDeEmbarque · del folio', () => {
  it('lee las seis series de Vermur', () => {
    const casos: [string, 'impo' | 'expo'][] = [
      ['VLIM-26-001', 'impo'], ['VLEM-26-001', 'expo'],
      ['VLIT-24-107', 'impo'], ['VLET-24-107', 'expo'],
      ['VLIA-24-020', 'impo'], ['VLEA-24-020', 'expo'],
    ];
    casos.forEach(([folio, esperado]) => {
      const r = traficoDeEmbarque(emb({ folio }));
      expect(r.trafico).toBe(esperado);
      expect(r.fuente).toBe('folio');
      expect(r.detalle).toContain(folio);
    });
  });

  it('el folio manda sobre la ruta: la serie la reservó quien abrió el embarque', () => {
    // Ruta que derivaría exportación (origen México), folio de importación.
    const r = traficoDeEmbarque(emb({
      folio: 'VLIM-26-004', origen: 'Manzanillo, MEX', destino: 'Shanghai, CHN',
    }));
    expect(r.trafico).toBe('impo');
    expect(r.fuente).toBe('folio');
  });

  it('la serie provisional «VL-» no dice el tráfico y cae a la ruta', () => {
    const r = traficoDeEmbarque(emb({
      folio: 'VL-26-009', origen: 'Shanghai, CHN', destino: 'Manzanillo, MEX',
    }));
    expect(r.trafico).toBe('impo');
    expect(r.fuente).toBe('ruta');
  });
});

describe('traficoDeEmbarque · de la ruta', () => {
  it('destino en México es importación', () => {
    const r = traficoDeEmbarque(emb({
      folio: 'SHP-26-0001',
      origen: 'Shanghai (CNSHA), CHN', destino: 'Lázaro Cárdenas (MXLZC), MEX',
    }));
    expect(r.trafico).toBe('impo');
    expect(r.fuente).toBe('ruta');
    expect(r.detalle).toContain('Lázaro Cárdenas');
  });

  it('origen en México es exportación', () => {
    const r = traficoDeEmbarque(emb({
      folio: 'BOL 9016543',
      origen: 'Veracruz (MXVER), MEX', destino: 'Houston, USA',
    }));
    expect(r.trafico).toBe('expo');
    expect(r.fuente).toBe('ruta');
  });

  it('un folio de Magaya que no es una serie de Vermur no estorba', () => {
    const r = traficoDeEmbarque(emb({
      folio: 'EASHA2406487',
      origen: 'Beijing (PEK), CHN', destino: 'Ciudad de México (MEX), CDMX, MEX',
    }));
    expect(r.trafico).toBe('impo');
  });
});

describe('traficoDeEmbarque · ante la duda no se inventa', () => {
  it('sin folio de serie y sin ruta: desconocido con motivo', () => {
    const r = traficoDeEmbarque(emb({ folio: 'SHP-26-0099' }));
    expect(r.trafico).toBeNull();
    expect(r.fuente).toBe('desconocido');
    expect(r.detalle.length).toBeGreaterThan(10);
  });

  it('los dos extremos en México: nacional, no se clasifica', () => {
    const r = traficoDeEmbarque(emb({
      folio: 'SHP-26-0100', origen: 'Monterrey, MEX', destino: 'Querétaro, MEX',
    }));
    expect(r.trafico).toBeNull();
  });

  it('ningún extremo en México: cross-trade, no se clasifica', () => {
    const r = traficoDeEmbarque(emb({
      folio: 'SHP-26-0101', origen: 'Shanghai, CHN', destino: 'Houston, USA',
    }));
    expect(r.trafico).toBeNull();
  });

  it('un embarque sin folio ni ruta no truena', () => {
    expect(traficoDeEmbarque({}).trafico).toBeNull();
  });
});

describe('cierreDelEmbarque · la fecha del lado mexicano', () => {
  it('importación cierra con el arribo', () => {
    expect(campoDeCierre('impo')).toBe('arribo');
    const c = cierreDelEmbarque(emb({ folio: 'VLIM-26-001', eta: '2026-09-28', etd: '2026-08-15' }));
    expect(c.trafico).toBe('impo');
    expect(c.campo).toBe('arribo');
    expect(c.fecha).toBe('2026-09-28');
    expect(c.mes).toBe('2026-09');
  });

  it('exportación cierra con la salida', () => {
    expect(campoDeCierre('expo')).toBe('salida');
    const c = cierreDelEmbarque(emb({ folio: 'VLEM-26-001', eta: '2026-10-20', etd: '2026-09-03' }));
    expect(c.trafico).toBe('expo');
    expect(c.campo).toBe('salida');
    expect(c.mes).toBe('2026-09');
  });

  it('un embarque cae en UN mes, no en dos: el otro extremo no cuenta', () => {
    // Zarpa en agosto y arriba en septiembre. Como importación es septiembre.
    const impo = emb({ folio: 'VLIM-26-002', etd: '2026-08-30', eta: '2026-09-12' });
    expect(mesDeCierre(impo)).toBe('2026-09');
    expect(mesDeCierre(impo)).not.toBe('2026-08');
  });

  it('tráfico desconocido usa el arribo, que es la fecha por omisión de la lista', () => {
    const c = cierreDelEmbarque(emb({ folio: 'SHP-26-0102', eta: '2026-07-04', etd: '2026-06-01' }));
    expect(c.trafico).toBeNull();
    expect(c.campo).toBe('arribo');
    expect(c.mes).toBe('2026-07');
  });

  it('sin la fecha que su tráfico exige, no cae en ningún mes', () => {
    // Exportación sin ETD: la ETA no la rescata, se contaría en otro mes.
    const c = cierreDelEmbarque(emb({ folio: 'VLEM-26-003', eta: '2026-09-15', etd: '' }));
    expect(c.fecha).toBe('');
    expect(c.mes).toBe('');
  });

  it('una fecha con hora se recorta al día', () => {
    expect(mesDeCierre(emb({ folio: 'VLIM-26-005', eta: '2026-11-02T13:45:00Z' }))).toBe('2026-11');
  });
});

describe('mesesDeCierrePresentes y etiquetaMes', () => {
  it('devuelve los meses que existen, del más reciente al más viejo, sin repetir', () => {
    const meses = mesesDeCierrePresentes([
      emb({ folio: 'VLIM-26-001', eta: '2026-09-10' }),
      emb({ folio: 'VLIM-26-002', eta: '2026-09-28' }),
      emb({ folio: 'VLEM-26-001', etd: '2026-10-02', eta: '2026-12-01' }),
      emb({ folio: 'SHP-26-0103' }),              // sin fecha: no aporta mes
    ]);
    expect(meses).toEqual(['2026-10', '2026-09']);
  });

  it('etiqueta el mes en español y deja pasar lo que no es un mes', () => {
    expect(etiquetaMes('2026-10')).toBe('octubre 2026');
    expect(etiquetaMes('2026-01')).toBe('enero 2026');
    expect(etiquetaMes('')).toBe('');
    expect(etiquetaMes('2026-13')).toBe('2026-13');
  });
});
