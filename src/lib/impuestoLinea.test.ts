import { describe, it, expect } from 'vitest';
import type { ServicioSolicitado } from '../components/quotes/QuotesData';
import {
  impuestoDeLinea, montoImpuesto, montoRetenido, totalesConImpuesto,
  TASA_DE_OPCION,
} from './impuestoLinea';

const srv = (over: Partial<ServicioSolicitado> = {}): ServicioSolicitado => ({
  id: 'S1', tipo: 'maritimo', ruta: { origen: 'Shanghai', destino: 'Manzanillo' },
  incoterm: 'FOB', mercancia: 'General', peso: 1000, volumen: 10, estado: 'cotizado',
  cotizacionesProveedor: [], profit: 0, recargosPct: 0, conceptos: [],
  trafico: 'importacion', ubicacion: 'destino',
  ...over,
} as ServicioSolicitado);

describe('lo capturado manda', () => {
  it('sobre la regla del catálogo', () => {
    // El seguro es exento, pero este cliente lo pidió con IVA.
    const r = impuestoDeLinea('iva16', 'exento', srv());
    expect(r.opcion).toBe('iva16');
    expect(r.tasa).toBe(16);
    expect(r.origen).toBe('capturado');
  });

  it('y también cuando el servicio no tiene tráfico', () => {
    const r = impuestoDeLinea('iva0', null, srv({ trafico: undefined, ruta: undefined } as never));
    expect(r.tasa).toBe(0);
    expect(r.origen).toBe('capturado');
  });

  it('exento y 0% dan lo mismo en dinero y no son la misma opción', () => {
    expect(TASA_DE_OPCION.exento).toBe(TASA_DE_OPCION.iva0);
    expect(impuestoDeLinea('exento', null, srv()).opcion).toBe('exento');
  });
});

describe('lo derivado del catálogo', () => {
  it('la regla espejo en importación + destino da 16%', () => {
    const r = impuestoDeLinea(null, 'espejo', srv({ trafico: 'importacion', ubicacion: 'destino' }));
    expect(r.opcion).toBe('iva16');
    expect(r.origen).toBe('derivado');
  });

  it('la regla espejo en importación + origen da 0%', () => {
    const r = impuestoDeLinea(null, 'espejo', srv({ trafico: 'importacion', ubicacion: 'origen' }));
    expect(r.opcion).toBe('iva0');
  });

  it('el seguro es exento sin mirar tráfico ni ubicación', () => {
    const r = impuestoDeLinea(null, 'exento', srv({ trafico: undefined, ubicacion: undefined } as never));
    expect(r.opcion).toBe('exento');
    expect(r.origen).toBe('derivado');
  });

  it('fijo16 y fijo0 se mapean directo', () => {
    expect(impuestoDeLinea(null, 'fijo16', srv()).opcion).toBe('iva16');
    expect(impuestoDeLinea(null, 'fijo0', srv()).opcion).toBe('iva0');
  });
});

describe('los dos casos que no caben en las tres opciones', () => {
  it('el flete aéreo se parte 25/75 y su tasa efectiva es 4%', () => {
    const r = impuestoDeLinea(null, 'aereo_split', srv());
    expect(r.especial).toBe('aereo_split');
    expect(r.opcion).toBeNull();
    expect(r.tasa).toBe(4);
    expect(r.detalle).toMatch(/SAT/);
    // 1,000 × 25% × 16% = 40
    expect(montoImpuesto(1000, r)).toBe(40);
  });

  it('el terrestre nacional lleva 16% con retención del 4%', () => {
    const r = impuestoDeLinea(null, 'terrestre_retencion', srv());
    expect(r.especial).toBe('terrestre_retencion');
    expect(r.tasa).toBe(16);
    expect(r.retencion).toBe(4);
    expect(montoImpuesto(1000, r)).toBe(160);
    expect(montoRetenido(1000, r)).toBe(40);
  });

  it('elegir una opción a mano reemplaza el caso especial', () => {
    const r = impuestoDeLinea('iva0', 'aereo_split', srv());
    expect(r.especial).toBeUndefined();
    expect(r.tasa).toBe(0);
  });
});

describe('lo que NO se inventa', () => {
  it('sin concepto del catálogo queda indeterminado', () => {
    const r = impuestoDeLinea(null, null, srv());
    expect(r.tasa).toBeNull();
    expect(r.origen).toBe('indeterminado');
    expect(r.detalle).toBeTruthy();
  });

  it('un concepto «revisar» queda indeterminado', () => {
    const r = impuestoDeLinea(null, 'revisar', srv());
    expect(r.tasa).toBeNull();
    expect(r.detalle).toMatch(/revisar/i);
  });

  it('sin ubicación no se asume ninguna tasa', () => {
    const r = impuestoDeLinea(null, 'espejo', srv({ ubicacion: undefined } as never));
    expect(r.tasa).toBeNull();
    expect(r.origen).toBe('indeterminado');
  });

  it('un indeterminado no aporta impuesto', () => {
    expect(montoImpuesto(1000, impuestoDeLinea(null, null, srv()))).toBe(0);
  });
});

describe('totales: subtotal, impuestos y total', () => {
  const imp = (o: 'iva16' | 'iva0') => impuestoDeLinea(o, null, srv());

  it('separa los tres números', () => {
    const [t] = totalesConImpuesto([
      { moneda: 'USD', venta: 1000, impuesto: imp('iva16') },
      { moneda: 'USD', venta: 500, impuesto: imp('iva0') },
    ]);
    expect(t.subtotal).toBe(1500);
    expect(t.impuestos).toBe(160);
    expect(t.total).toBe(1660);
    expect(t.indeterminadas).toBe(0);
  });

  it('§4.3: una fila por moneda, nunca sumadas', () => {
    const filas = totalesConImpuesto([
      { moneda: 'USD', venta: 1000, impuesto: imp('iva0') },
      { moneda: 'MXN', venta: 20000, impuesto: imp('iva16') },
    ]);
    expect(filas).toHaveLength(2);
    expect(filas.find(f => f.moneda === 'MXN')!.impuestos).toBe(3200);
    expect(filas.find(f => f.moneda === 'USD')!.impuestos).toBe(0);
  });

  it('la retención se resta del total, no se suma', () => {
    const [t] = totalesConImpuesto([
      { moneda: 'MXN', venta: 10000, impuesto: impuestoDeLinea(null, 'terrestre_retencion', srv()) },
    ]);
    expect(t.impuestos).toBe(1600);
    expect(t.retenciones).toBe(400);
    expect(t.total).toBe(11200);
  });

  it('cuenta las líneas que no pudieron determinar su tasa', () => {
    const [t] = totalesConImpuesto([
      { moneda: 'USD', venta: 1000, impuesto: imp('iva16') },
      { moneda: 'USD', venta: 300, impuesto: impuestoDeLinea(null, 'revisar', srv()) },
    ]);
    expect(t.indeterminadas).toBe(1);
    // El subtotal las incluye; el impuesto no las inventa.
    expect(t.subtotal).toBe(1300);
    expect(t.impuestos).toBe(160);
  });

  it('una lista vacía no truena', () => {
    expect(totalesConImpuesto([])).toEqual([]);
  });
});

// ─── La elección viaja con la línea ───────────────────────────────────────────

describe('aplanarCotizacion y aplicarEdicionLinea conservan la elección', () => {
  it('se guarda, se lee y se puede quitar', async () => {
    const { aplanarCotizacion, aplicarEdicionLinea } = await import('./lineasCotizacion');
    const quote = {
      id: 'COT-1', etapa: 'consolidada', servicios: [{
        id: 'S1', tipo: 'maritimo', trafico: 'importacion', ubicacion: 'destino',
        cotizacionesProveedor: [], profit: 0, recargosPct: 0,
        conceptos: [{
          id: 'c1', nombre: 'Seguro', conceptoId: 'CON-003',
          costo: 100, profit: 20, venta: 120, margen: 0,
          subconceptos: [], tarifas: [], proveedoresOficialIds: [],
        }],
      }],
    } as never;

    expect(aplanarCotizacion(quote)[0].impuesto).toBeUndefined();

    const conIva = aplicarEdicionLinea(quote, aplanarCotizacion(quote)[0].id, { impuesto: 'iva16' });
    expect(aplanarCotizacion(conIva)[0].impuesto).toBe('iva16');

    const sinIva = aplicarEdicionLinea(conIva, aplanarCotizacion(conIva)[0].id, { impuesto: null });
    expect(aplanarCotizacion(sinIva)[0].impuesto).toBeUndefined();
    expect('impuesto' in (sinIva as never as { servicios: { conceptos: object[] }[] })
      .servicios[0].conceptos[0]).toBe(false);
  });

  it('editar otra cosa no borra la elección', async () => {
    const { aplanarCotizacion, aplicarEdicionLinea } = await import('./lineasCotizacion');
    const quote = {
      id: 'COT-1', etapa: 'consolidada', servicios: [{
        id: 'S1', tipo: 'maritimo', trafico: 'importacion', ubicacion: 'destino',
        cotizacionesProveedor: [], profit: 0, recargosPct: 0,
        conceptos: [{
          id: 'c1', nombre: 'Seguro', conceptoId: 'CON-003', impuesto: 'exento',
          costo: 100, profit: 20, venta: 120, margen: 0,
          subconceptos: [], tarifas: [], proveedoresOficialIds: [],
        }],
      }],
    } as never;
    const r = aplicarEdicionLinea(quote, aplanarCotizacion(quote)[0].id, { profit: 50 });
    expect(aplanarCotizacion(r)[0].impuesto).toBe('exento');
  });
});
