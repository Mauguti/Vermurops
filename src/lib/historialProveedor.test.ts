/**
 * historialProveedor.test.ts
 *
 * Tests para la extracción de historial y resumen de proveedor
 * recorriendo la estructura anidada quotes → servicios → conceptos → tarifas.
 */

import { describe, it, expect } from 'vitest';
import {
  extraerHistorialProveedor,
  calcularResumenProveedor,
  formatTotalesPorMoneda,
  type RegistroHistorialProveedor,
} from './historialProveedor';
import type { KanbanQuote, CotizacionProveedor, ConceptoCotizacion, ServicioSolicitado } from '../components/quotes/QuotesData';

// ─── Helpers para construir fixtures ─────────────────────────────────────────

function makeTarifa(overrides: Partial<CotizacionProveedor> = {}): CotizacionProveedor {
  return {
    id: `cp-${Date.now()}-${Math.random()}`,
    proveedor: 'Naviera Test',
    contacto: 'Juan',
    monto: 1000,
    moneda: 'USD',
    seleccionada: false,
    estadoRespuesta: 'recibida',
    proveedorId: 'PROV-001',
    conceptoId: 'CON-001',
    ...overrides,
  };
}

function makeConcepto(nombre: string, tarifas: CotizacionProveedor[] = []): ConceptoCotizacion {
  return {
    id: `conc-${Date.now()}-${Math.random()}`,
    nombre,
    costo: 0,
    profit: 0,
    venta: 0,
    margen: 0,
    subconceptos: [],
    tarifas,
  };
}

function makeServicio(conceptos: ConceptoCotizacion[] = []): ServicioSolicitado {
  return {
    id: `srv-${Date.now()}-${Math.random()}`,
    tipo: 'maritimo',
    ruta: { origen: 'Shanghai', destino: 'Manzanillo' },
    incoterm: 'FOB',
    mercancia: 'Test',
    peso: 1000,
    volumen: 10,
    estado: 'cotizado',
    cotizacionesProveedor: [],
    profit: 0,
    recargosPct: 0,
    conceptos,
  };
}

function makeQuote(overrides: Partial<KanbanQuote> = {}): KanbanQuote {
  return {
    id: 'COT-2026-0001',
    etapa: 'pricing_solicitando',
    prospecto: { empresa: 'Test', contacto: 'Test', telefono: '', email: '', origen: 'formulario' },
    vendedorId: 'ventas',
    pricingId: null,
    servicios: [],
    valorTotalConsolidado: 0,
    moneda: 'USD',
    estadoFinal: null,
    motivoPerdida: null,
    createdAt: '2026-06-01 10:00',
    updatedAt: '2026-06-01 10:00',
    historialEtapas: [],
    actividades: [],
    chat: [],
    ...overrides,
  };
}

// ─── Tests: extraerHistorialProveedor ────────────────────────────────────────

describe('extraerHistorialProveedor', () => {
  it('extrae cotizaciones de un proveedor en varios conceptos de varias cotizaciones', () => {
    const quotes: KanbanQuote[] = [
      makeQuote({
        id: 'COT-001',
        createdAt: '2026-06-10 10:00',
        etapa: 'cotizaciones_recibidas',
        servicios: [
          makeServicio([
            makeConcepto('Flete Marítimo', [
              makeTarifa({ proveedorId: 'PROV-001', monto: 2500, moneda: 'USD' }),
              makeTarifa({ proveedorId: 'PROV-002', monto: 2800, moneda: 'USD' }),
            ]),
            makeConcepto('Maniobras', [
              makeTarifa({ proveedorId: 'PROV-001', monto: 500, moneda: 'USD', seleccionada: true }),
            ]),
          ]),
        ],
      }),
      makeQuote({
        id: 'COT-002',
        createdAt: '2026-07-01 09:00',
        etapa: 'ganada',
        servicios: [
          makeServicio([
            makeConcepto('Flete Marítimo', [
              makeTarifa({ proveedorId: 'PROV-001', monto: 3000, moneda: 'MXN', estadoRespuesta: 'pendiente' }),
            ]),
          ]),
        ],
      }),
    ];

    const registros = extraerHistorialProveedor(quotes, 'PROV-001');

    expect(registros).toHaveLength(3);
    // Más reciente primero
    expect(registros[0].folio).toBe('COT-002');
    expect(registros[0].monto).toBe(3000);
    expect(registros[0].moneda).toBe('MXN');

    expect(registros[1].folio).toBe('COT-001');
    expect(registros[1].concepto).toBe('Flete Marítimo');
    expect(registros[1].monto).toBe(2500);

    expect(registros[2].folio).toBe('COT-001');
    expect(registros[2].concepto).toBe('Maniobras');
    expect(registros[2].seleccionada).toBe(true);
  });

  it('proveedor sin ninguna cotización devuelve array vacío', () => {
    const quotes: KanbanQuote[] = [
      makeQuote({
        servicios: [
          makeServicio([
            makeConcepto('Flete', [
              makeTarifa({ proveedorId: 'PROV-OTRO', monto: 1000 }),
            ]),
          ]),
        ],
      }),
    ];

    const registros = extraerHistorialProveedor(quotes, 'PROV-INEXISTENTE');
    expect(registros).toEqual([]);
  });

  it('no rompe con conceptos sin tarifas', () => {
    const quotes: KanbanQuote[] = [
      makeQuote({
        servicios: [
          makeServicio([
            makeConcepto('Flete Marítimo', []),  // sin tarifas
            makeConcepto('Maniobras'),            // tarifas = [] por default
          ]),
        ],
      }),
    ];

    const registros = extraerHistorialProveedor(quotes, 'PROV-001');
    expect(registros).toEqual([]);
  });

  it('no rompe con servicios sin conceptos', () => {
    const quotes: KanbanQuote[] = [
      makeQuote({
        servicios: [
          { ...makeServicio(), conceptos: [] },
        ],
      }),
    ];

    const registros = extraerHistorialProveedor(quotes, 'PROV-001');
    expect(registros).toEqual([]);
  });

  it('no rompe con cotizaciones sin servicios', () => {
    const quotes: KanbanQuote[] = [
      makeQuote({ servicios: [] }),
    ];

    const registros = extraerHistorialProveedor(quotes, 'PROV-001');
    expect(registros).toEqual([]);
  });

  it('maneja servicios/conceptos/tarifas undefined (estructuras incompletas)', () => {
    const quotes: KanbanQuote[] = [
      makeQuote({
        servicios: undefined as any,
      }),
      makeQuote({
        servicios: [
          { ...makeServicio(), conceptos: undefined as any },
        ],
      }),
      makeQuote({
        servicios: [
          makeServicio([
            { ...makeConcepto('Test'), tarifas: undefined as any },
          ]),
        ],
      }),
    ];

    // No debe lanzar error
    const registros = extraerHistorialProveedor(quotes, 'PROV-001');
    expect(registros).toEqual([]);
  });

  it('deduplica cuando la misma tarifa aparece en concepto.tarifas y servicio.cotizacionesProveedor', () => {
    const sharedTarifa = makeTarifa({ id: 'SHARED-001', proveedorId: 'PROV-001', monto: 1000 });
    const quotes: KanbanQuote[] = [
      makeQuote({
        servicios: [{
          ...makeServicio([
            makeConcepto('Flete', [sharedTarifa]),
          ]),
          // Misma tarifa (mismo id) también en vista plana
          cotizacionesProveedor: [sharedTarifa],
        }],
      }),
    ];

    const registros = extraerHistorialProveedor(quotes, 'PROV-001');
    // Solo 1 registro — deduplicado por id
    expect(registros).toHaveLength(1);
    // Debe tomar el concepto de la vista detallada (se procesa primero)
    expect(registros[0].concepto).toBe('Flete');
  });

  it('fallback por nombre: match sin proveedorId', () => {
    const quotes: KanbanQuote[] = [
      makeQuote({
        servicios: [
          makeServicio([
            makeConcepto('Flete Marítimo', [
              makeTarifa({ proveedor: 'Hapag-Lloyd', proveedorId: undefined as any, monto: 5000 }),
            ]),
          ]),
        ],
      }),
    ];

    const registros = extraerHistorialProveedor(quotes, 'PROV-HAPAG', 'Hapag-Lloyd');
    expect(registros).toHaveLength(1);
    expect(registros[0].monto).toBe(5000);
  });

  it('fallback por nombre normaliza acentos y mayúsculas', () => {
    const quotes: KanbanQuote[] = [
      makeQuote({
        id: 'COT-ACCENT-1',
        servicios: [
          makeServicio([
            makeConcepto('Flete', [
              makeTarifa({ proveedor: 'HAPAG-LLOYD', proveedorId: undefined as any, monto: 1000 }),
            ]),
            makeConcepto('Maniobras', [
              makeTarifa({ proveedor: 'Línea Naviera', proveedorId: undefined as any, monto: 2000 }),
            ]),
          ]),
        ],
      }),
    ];

    // Case-insensitive match
    const r1 = extraerHistorialProveedor(quotes, 'PROV-X', 'hapag-lloyd');
    expect(r1).toHaveLength(1);
    expect(r1[0].monto).toBe(1000);

    // Accent-insensitive match
    const r2 = extraerHistorialProveedor(quotes, 'PROV-Y', 'linea naviera');
    expect(r2).toHaveLength(1);
    expect(r2[0].monto).toBe(2000);
  });

  it('fallback por nombre no produce falsos positivos', () => {
    const quotes: KanbanQuote[] = [
      makeQuote({
        servicios: [
          makeServicio([
            makeConcepto('Flete', [
              makeTarifa({ proveedor: 'Hapag-Lloyd', proveedorId: undefined as any, monto: 1000 }),
            ]),
          ]),
        ],
      }),
    ];

    const registros = extraerHistorialProveedor(quotes, 'PROV-NONE', 'MSC Mediterranean');
    expect(registros).toEqual([]);
  });

  it('incluye cotizaciones de servicio.cotizacionesProveedor (service-level)', () => {
    const quotes: KanbanQuote[] = [
      makeQuote({
        servicios: [{
          ...makeServicio(),  // sin conceptos
          cotizacionesProveedor: [
            makeTarifa({ proveedorId: 'PROV-001', monto: 3500 }),
          ],
        }],
      }),
    ];

    const registros = extraerHistorialProveedor(quotes, 'PROV-001');
    expect(registros).toHaveLength(1);
    expect(registros[0].concepto).toBe('(servicio maritimo)');
    expect(registros[0].monto).toBe(3500);
  });

  it('combina entradas de ambos niveles y ambos métodos de match', () => {
    const quotes: KanbanQuote[] = [
      makeQuote({
        id: 'COT-MIX',
        createdAt: '2026-07-15 10:00',
        servicios: [{
          ...makeServicio([
            makeConcepto('Flete Marítimo', [
              // Match por proveedorId
              makeTarifa({ id: 'T1', proveedorId: 'PROV-001', monto: 2000 }),
            ]),
            makeConcepto('Maniobras', [
              // Match por nombre (legacy)
              makeTarifa({ id: 'T2', proveedor: 'Naviera Test', proveedorId: undefined as any, monto: 800 }),
            ]),
          ]),
          cotizacionesProveedor: [
            // Service-level, match por proveedorId
            makeTarifa({ id: 'T3', proveedorId: 'PROV-001', monto: 1500 }),
            // Service-level, match por nombre (legacy)
            makeTarifa({ id: 'T4', proveedor: 'Naviera Test', proveedorId: undefined as any, monto: 600 }),
          ],
        }],
      }),
    ];

    const registros = extraerHistorialProveedor(quotes, 'PROV-001', 'Naviera Test');
    expect(registros).toHaveLength(4);

    // Verificar que los 4 ids únicos están presentes
    const montos = registros.map(r => r.monto).sort((a, b) => a - b);
    expect(montos).toEqual([600, 800, 1500, 2000]);

    // Verificar conceptos para service-level
    const serviceLevelEntries = registros.filter(r => r.concepto.startsWith('(servicio'));
    expect(serviceLevelEntries).toHaveLength(2);
  });
});

// ─── Tests: calcularResumenProveedor ─────────────────────────────────────────

describe('calcularResumenProveedor', () => {
  it('calcula totales separados por moneda — nunca mezcla USD y MXN', () => {
    const registros: RegistroHistorialProveedor[] = [
      { folio: 'COT-001', fecha: '2026-06-01', etapa: 'ganada', concepto: 'Flete', monto: 2500, moneda: 'USD', seleccionada: true, estadoRespuesta: 'recibida' },
      { folio: 'COT-001', fecha: '2026-06-01', etapa: 'ganada', concepto: 'Maniobras', monto: 500, moneda: 'USD', seleccionada: false, estadoRespuesta: 'recibida' },
      { folio: 'COT-002', fecha: '2026-07-01', etapa: 'consolidada', concepto: 'Flete', monto: 85000, moneda: 'MXN', seleccionada: true, estadoRespuesta: 'recibida' },
    ];

    const resumen = calcularResumenProveedor(registros);

    expect(resumen.totalCotizado.USD).toBe(3000);
    expect(resumen.totalCotizado.MXN).toBe(85000);
    expect(resumen.cotizacionesAtendidas).toBe(3);
    expect(resumen.cotizacionesTotal).toBe(3);
    expect(resumen.vecesSeleccionado).toBe(2);
    expect(resumen.cotizacionesUnicas).toBe(2); // 2 folios distintos
  });

  it('total cotizado no duplica cuando hay varias tarifas en la misma cotización', () => {
    const registros: RegistroHistorialProveedor[] = [
      { folio: 'COT-001', fecha: '2026-06-01', etapa: 'ganada', concepto: 'Flete', monto: 1000, moneda: 'USD', seleccionada: false, estadoRespuesta: 'recibida' },
      { folio: 'COT-001', fecha: '2026-06-01', etapa: 'ganada', concepto: 'Maniobras', monto: 500, moneda: 'USD', seleccionada: false, estadoRespuesta: 'recibida' },
      { folio: 'COT-001', fecha: '2026-06-01', etapa: 'ganada', concepto: 'Aduanal', monto: 300, moneda: 'USD', seleccionada: false, estadoRespuesta: 'recibida' },
    ];

    const resumen = calcularResumenProveedor(registros);
    // Cada registro se suma — no se "agrupa" por folio para el total
    // El total es la suma de todos los montos cotizados por este proveedor
    expect(resumen.totalCotizado.USD).toBe(1800);
    expect(resumen.cotizacionesUnicas).toBe(1); // 1 solo folio
  });

  it('resumen vacío para proveedor sin registros', () => {
    const resumen = calcularResumenProveedor([]);

    expect(resumen.totalCotizado.USD).toBe(0);
    expect(resumen.totalCotizado.MXN).toBe(0);
    expect(resumen.cotizacionesAtendidas).toBe(0);
    expect(resumen.cotizacionesTotal).toBe(0);
    expect(resumen.vecesSeleccionado).toBe(0);
    expect(resumen.cotizacionesUnicas).toBe(0);
  });

  it('cuenta correctamente atendidas vs no atendidas', () => {
    const registros: RegistroHistorialProveedor[] = [
      { folio: 'COT-001', fecha: '2026-06-01', etapa: 'ganada', concepto: 'A', monto: 100, moneda: 'USD', seleccionada: false, estadoRespuesta: 'recibida' },
      { folio: 'COT-002', fecha: '2026-06-02', etapa: 'perdida', concepto: 'B', monto: 200, moneda: 'USD', seleccionada: false, estadoRespuesta: 'pendiente' },
      { folio: 'COT-003', fecha: '2026-06-03', etapa: 'consolidada', concepto: 'C', monto: 300, moneda: 'USD', seleccionada: false, estadoRespuesta: 'sin_respuesta' },
      { folio: 'COT-004', fecha: '2026-06-04', etapa: 'negociacion', concepto: 'D', monto: 400, moneda: 'USD', seleccionada: true, estadoRespuesta: 'recibida' },
    ];

    const resumen = calcularResumenProveedor(registros);
    expect(resumen.cotizacionesAtendidas).toBe(2); // solo 'recibida'
    expect(resumen.cotizacionesTotal).toBe(4);
    expect(resumen.vecesSeleccionado).toBe(1);
  });

  it('redondea a 2 decimales', () => {
    const registros: RegistroHistorialProveedor[] = [
      { folio: 'COT-001', fecha: '2026-06-01', etapa: 'ganada', concepto: 'A', monto: 100.555, moneda: 'USD', seleccionada: false, estadoRespuesta: 'recibida' },
      { folio: 'COT-002', fecha: '2026-06-02', etapa: 'ganada', concepto: 'B', monto: 200.449, moneda: 'USD', seleccionada: false, estadoRespuesta: 'recibida' },
    ];

    const resumen = calcularResumenProveedor(registros);
    expect(resumen.totalCotizado.USD).toBe(301);
  });
});

// ─── Tests: formatTotalesPorMoneda ───────────────────────────────────────────

describe('formatTotalesPorMoneda', () => {
  it('muestra ambas monedas separadas por " · "', () => {
    const result = formatTotalesPorMoneda({ USD: 12400, MXN: 85000 });
    expect(result).toBe('USD $12,400 · MXN $85,000');
  });

  it('muestra solo USD si MXN es 0', () => {
    const result = formatTotalesPorMoneda({ USD: 5000, MXN: 0 });
    expect(result).toBe('USD $5,000');
  });

  it('muestra solo MXN si USD es 0', () => {
    const result = formatTotalesPorMoneda({ USD: 0, MXN: 150000 });
    expect(result).toBe('MXN $150,000');
  });

  it('devuelve "—" si ambos son 0', () => {
    const result = formatTotalesPorMoneda({ USD: 0, MXN: 0 });
    expect(result).toBe('—');
  });
});
