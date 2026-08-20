/**
 * clasificarBandeja.test.ts (BP-1 + BP-2)
 *
 * Tests para las funciones de clasificación y conteo de tarifas de la Bandeja de Pricing.
 */

import { describe, it, expect } from 'vitest';
import {
  calcularProgreso,
  clasificarCotizacion,
  clasificarBandeja,
  diasEsperando,
  buildTarifaCountMap,
  contarTarifasDisponibles,
} from './clasificarBandeja';
import type { KanbanQuote, ServicioSolicitado, ConceptoCotizacion } from '../components/quotes/QuotesData';
import type { TarifaVermur } from '../components/tarifas/TarifasData';
import { buildConceptoMap, type ConceptoMatch } from '../components/tarifas/tarifaMatching';

// ─── Factories ──────────────────────────────────────────────────────────────

function makeConcepto(overrides: Partial<ConceptoCotizacion> = {}): ConceptoCotizacion {
  return {
    id: `c-${Math.random().toString(36).slice(2, 6)}`,
    nombre: 'Flete Marítimo',
    costo: 0, profit: 0, venta: 0, margen: 0,
    subconceptos: [],
    tarifas: [],
    ...overrides,
  };
}

function makeServicio(overrides: Partial<ServicioSolicitado> = {}): ServicioSolicitado {
  return {
    id: `s-${Math.random().toString(36).slice(2, 6)}`,
    tipo: 'maritimo',
    ruta: { origen: 'Shanghai', destino: 'Manzanillo' },
    incoterm: 'FOB',
    mercancia: 'Electrónicos',
    peso: 1000, volumen: 5,
    estado: 'pendiente',
    cotizacionesProveedor: [],
    profit: 0, recargosPct: 0,
    conceptos: [],
    ...overrides,
  };
}

function makeQuote(overrides: Partial<KanbanQuote> = {}): KanbanQuote {
  return {
    id: 'COT-TEST-0001',
    etapa: 'solicitado_pricing',
    prospecto: { empresa: 'Acme', contacto: 'Juan', telefono: '', email: '', origen: 'web' },
    vendedorId: 'vendedor1',
    pricingId: null,
    servicios: [],
    valorTotalConsolidado: 0,
    moneda: 'USD',
    estadoFinal: null,
    motivoPerdida: null,
    createdAt: '2026-08-10 09:00',
    updatedAt: '2026-08-10 09:00',
    historialEtapas: [],
    actividades: [],
    chat: [],
    ...overrides,
  };
}

// ─── calcularProgreso ────────────────────────────────────────────────────────

describe('calcularProgreso', () => {
  it('sin servicios → 0/0', () => {
    const q = makeQuote({ servicios: [] });
    expect(calcularProgreso(q)).toEqual({ conOficial: 0, total: 0 });
  });

  it('servicios sin conceptos → 0/0', () => {
    const q = makeQuote({ servicios: [makeServicio({ conceptos: [] })] });
    expect(calcularProgreso(q)).toEqual({ conOficial: 0, total: 0 });
  });

  it('3 conceptos, ninguno con oficial → 0/3', () => {
    const q = makeQuote({
      servicios: [makeServicio({
        conceptos: [makeConcepto(), makeConcepto(), makeConcepto()],
      })],
    });
    expect(calcularProgreso(q)).toEqual({ conOficial: 0, total: 3 });
  });

  it('3 conceptos, 2 con proveedoresOficialIds → 2/3', () => {
    const q = makeQuote({
      servicios: [makeServicio({
        conceptos: [
          makeConcepto({ proveedoresOficialIds: ['cp-1'] }),
          makeConcepto({ proveedoresOficialIds: ['cp-2'] }),
          makeConcepto(),
        ],
      })],
    });
    expect(calcularProgreso(q)).toEqual({ conOficial: 2, total: 3 });
  });

  it('todos con oficial → progreso completo', () => {
    const q = makeQuote({
      servicios: [makeServicio({
        conceptos: [
          makeConcepto({ proveedoresOficialIds: ['cp-1'] }),
          makeConcepto({ proveedoresOficialIds: ['cp-2'] }),
        ],
      })],
    });
    expect(calcularProgreso(q)).toEqual({ conOficial: 2, total: 2 });
  });

  it('usa proveedorOficialId legacy como fallback', () => {
    const q = makeQuote({
      servicios: [makeServicio({
        conceptos: [
          makeConcepto({ proveedorOficialId: 'legacy-id' }),
          makeConcepto(),
        ],
      })],
    });
    expect(calcularProgreso(q)).toEqual({ conOficial: 1, total: 2 });
  });

  it('suma conceptos de múltiples servicios', () => {
    const q = makeQuote({
      servicios: [
        makeServicio({ conceptos: [makeConcepto({ proveedoresOficialIds: ['cp-1'] }), makeConcepto()] }),
        makeServicio({ conceptos: [makeConcepto({ proveedoresOficialIds: ['cp-2'] })] }),
      ],
    });
    expect(calcularProgreso(q)).toEqual({ conOficial: 2, total: 3 });
  });
});

// ─── clasificarCotizacion ────────────────────────────────────────────────────

describe('clasificarCotizacion', () => {
  it('consolidada → null (fuera de bandeja)', () => {
    expect(clasificarCotizacion(makeQuote({ etapa: 'consolidada' }))).toBeNull();
  });

  it('enviada_cliente → null', () => {
    expect(clasificarCotizacion(makeQuote({ etapa: 'enviada_cliente' }))).toBeNull();
  });

  it('ganada → null', () => {
    expect(clasificarCotizacion(makeQuote({ etapa: 'ganada' }))).toBeNull();
  });

  it('solicitado_pricing → te_toca', () => {
    expect(clasificarCotizacion(makeQuote({ etapa: 'solicitado_pricing' }))).toBe('te_toca');
  });

  it('pricing_solicitando con servicios pendientes → te_toca', () => {
    const q = makeQuote({
      etapa: 'pricing_solicitando',
      servicios: [makeServicio({ estado: 'pendiente' })],
    });
    expect(clasificarCotizacion(q)).toBe('te_toca');
  });

  it('pricing_solicitando con algún servicio solicitado → esperando', () => {
    const q = makeQuote({
      etapa: 'pricing_solicitando',
      servicios: [
        makeServicio({ estado: 'solicitado_proveedores', conceptos: [makeConcepto()] }),
        makeServicio({ estado: 'pendiente', conceptos: [makeConcepto()] }),
      ],
    });
    expect(clasificarCotizacion(q)).toBe('esperando');
  });

  it('cotizaciones_recibidas con conceptos sin oficial → esperando', () => {
    const q = makeQuote({
      etapa: 'cotizaciones_recibidas',
      servicios: [makeServicio({ conceptos: [makeConcepto(), makeConcepto()] })],
    });
    expect(clasificarCotizacion(q)).toBe('esperando');
  });

  it('cotizaciones_recibidas con todos los conceptos con oficial → listas', () => {
    const q = makeQuote({
      etapa: 'cotizaciones_recibidas',
      servicios: [makeServicio({
        conceptos: [
          makeConcepto({ proveedoresOficialIds: ['cp-1'] }),
          makeConcepto({ proveedoresOficialIds: ['cp-2'] }),
        ],
      })],
    });
    expect(clasificarCotizacion(q)).toBe('listas');
  });

  it('pricing_solicitando con progreso completo → listas (promueve)', () => {
    const q = makeQuote({
      etapa: 'pricing_solicitando',
      servicios: [makeServicio({
        estado: 'cotizado',
        conceptos: [makeConcepto({ proveedoresOficialIds: ['cp-1'] })],
      })],
    });
    expect(clasificarCotizacion(q)).toBe('listas');
  });

  it('sin conceptos definidos → no es listas (0/0 no es progreso completo)', () => {
    const q = makeQuote({
      etapa: 'cotizaciones_recibidas',
      servicios: [makeServicio({ conceptos: [] })],
    });
    // 0/0 → no es progreso completo → cae en esperando
    expect(clasificarCotizacion(q)).toBe('esperando');
  });
});

// ─── clasificarBandeja ───────────────────────────────────────────────────────

describe('clasificarBandeja', () => {
  it('clasifica mix de cotizaciones en los tres bloques', () => {
    const quotes = [
      makeQuote({ id: 'Q1', etapa: 'solicitado_pricing' }),
      makeQuote({ id: 'Q2', etapa: 'pricing_solicitando', servicios: [
        makeServicio({ estado: 'solicitado_proveedores', conceptos: [makeConcepto()] }),
      ]}),
      makeQuote({ id: 'Q3', etapa: 'cotizaciones_recibidas', servicios: [
        makeServicio({ conceptos: [makeConcepto({ proveedoresOficialIds: ['cp-1'] })] }),
      ]}),
      makeQuote({ id: 'Q4', etapa: 'consolidada' }),
      makeQuote({ id: 'Q5', etapa: 'ganada' }),
    ];

    const result = clasificarBandeja(quotes);
    expect(result.teCotizar.map(q => q.id)).toEqual(['Q1']);
    expect(result.esperando.map(q => q.id)).toEqual(['Q2']);
    expect(result.listasConsolidar.map(q => q.id)).toEqual(['Q3']);
  });

  it('ordena por antigüedad dentro de cada bloque', () => {
    const quotes = [
      makeQuote({ id: 'B', etapa: 'solicitado_pricing', createdAt: '2026-08-15 10:00' }),
      makeQuote({ id: 'A', etapa: 'solicitado_pricing', createdAt: '2026-08-10 09:00' }),
      makeQuote({ id: 'C', etapa: 'solicitado_pricing', createdAt: '2026-08-20 08:00' }),
    ];

    const result = clasificarBandeja(quotes);
    expect(result.teCotizar.map(q => q.id)).toEqual(['A', 'B', 'C']);
  });

  it('bandeja vacía → tres arrays vacíos', () => {
    const result = clasificarBandeja([]);
    expect(result.teCotizar).toEqual([]);
    expect(result.esperando).toEqual([]);
    expect(result.listasConsolidar).toEqual([]);
  });
});

// ─── diasEsperando ───────────────────────────────────────────────────────────

describe('diasEsperando', () => {
  it('usa historialEtapas para encontrar entrada a pricing', () => {
    const q = makeQuote({
      createdAt: '2026-08-01 09:00',
      historialEtapas: [
        { etapa: 'solicitud_cliente', fecha: '2026-08-01' },
        { etapa: 'solicitado_pricing', fecha: '2026-08-05' },
      ],
    });
    expect(diasEsperando(q, '2026-08-10')).toBe(5);
  });

  it('fallback a createdAt si no hay historial de pricing', () => {
    const q = makeQuote({
      createdAt: '2026-08-10 09:00',
      historialEtapas: [],
    });
    expect(diasEsperando(q, '2026-08-13')).toBe(3);
  });

  it('mismo día → 0', () => {
    const q = makeQuote({ createdAt: '2026-08-20 09:00' });
    expect(diasEsperando(q, '2026-08-20')).toBe(0);
  });

  it('no devuelve negativos', () => {
    const q = makeQuote({ createdAt: '2026-08-25 09:00' });
    expect(diasEsperando(q, '2026-08-20')).toBe(0);
  });
});

// ─── BP-2: buildTarifaCountMap + contarTarifasDisponibles ────────────────────

const hoy = new Date().toISOString().split('T')[0];

function makeTarifa(id: string, conceptoId: string): TarifaVermur {
  return {
    id, conceptoId, proveedorId: 'PROV-1', tipo: 'tarifario',
    puertoOrigenId: null, puertoDestinoId: null, terminalId: null, rutaTexto: null,
    precios: { monto: 100, unidad: 'CONTENEDOR' }, moneda: 'USD',
    vigenciaTexto: 'Test', fechaInicio: '2026-01-01', fechaFin: null,
    tiempoTransitoDias: null, freeTimeDias: null, condiciones: '',
    activo: true, origenDatos: 'manual', creadoPor: 'test', fechaAlta: hoy, updatedAt: hoy,
  } as TarifaVermur;
}

const conceptosCatalogo: ConceptoMatch[] = [
  { id: 'CON-001', nombre: 'Flete Marítimo', categoria: 'flete' },
  { id: 'CON-002', nombre: 'Maniobras Portuarias', categoria: 'maniobras' },
  { id: 'CON-003', nombre: 'Despacho Aduanal', categoria: 'despacho' },
];
const conceptoMapTest = buildConceptoMap(conceptosCatalogo);

describe('buildTarifaCountMap', () => {
  it('agrupa tarifas vigentes por conceptoId', () => {
    const tarifas = [
      makeTarifa('T1', 'CON-001'),
      makeTarifa('T2', 'CON-001'),
      makeTarifa('T3', 'CON-002'),
    ];
    const map = buildTarifaCountMap(tarifas);
    expect(map.get('CON-001')).toBe(2);
    expect(map.get('CON-002')).toBe(1);
    expect(map.get('CON-003')).toBeUndefined();
  });

  it('excluye tarifas inactivas', () => {
    const t = makeTarifa('T1', 'CON-001');
    t.activo = false;
    expect(buildTarifaCountMap([t]).size).toBe(0);
  });

  it('excluye tarifas vencidas', () => {
    const t = makeTarifa('T1', 'CON-001');
    t.fechaFin = '2020-01-01';
    expect(buildTarifaCountMap([t]).size).toBe(0);
  });
});

describe('contarTarifasDisponibles', () => {
  const tarifaCountMap = buildTarifaCountMap([
    makeTarifa('T1', 'CON-001'),
    makeTarifa('T2', 'CON-001'),
    makeTarifa('T3', 'CON-002'),
    makeTarifa('T4', 'CON-003'),
    makeTarifa('T5', 'CON-003'),
    makeTarifa('T6', 'CON-003'),
  ]);

  it('cuenta tarifas matching por conceptoId', () => {
    const q = makeQuote({
      servicios: [makeServicio({
        conceptos: [
          makeConcepto({ conceptoId: 'CON-001', nombre: 'Flete Marítimo' }),
          makeConcepto({ conceptoId: 'CON-002', nombre: 'Maniobras Portuarias' }),
        ],
      })],
    });
    // CON-001 → 2 tarifas, CON-002 → 1 tarifa = 3
    expect(contarTarifasDisponibles(q, tarifaCountMap, conceptosCatalogo, conceptoMapTest)).toBe(3);
  });

  it('fallback por nombre si conceptoId falta', () => {
    const q = makeQuote({
      servicios: [makeServicio({
        conceptos: [makeConcepto({ nombre: 'Despacho Aduanal' })], // sin conceptoId
      })],
    });
    // Match por nombre → CON-003 → 3 tarifas
    expect(contarTarifasDisponibles(q, tarifaCountMap, conceptosCatalogo, conceptoMapTest)).toBe(3);
  });

  it('no duplica conteo si el mismo concepto aparece en dos servicios', () => {
    const q = makeQuote({
      servicios: [
        makeServicio({ conceptos: [makeConcepto({ conceptoId: 'CON-001', nombre: 'Flete' })] }),
        makeServicio({ conceptos: [makeConcepto({ conceptoId: 'CON-001', nombre: 'Flete' })] }),
      ],
    });
    // CON-001 aparece 2 veces pero se cuenta una → 2 tarifas
    expect(contarTarifasDisponibles(q, tarifaCountMap, conceptosCatalogo, conceptoMapTest)).toBe(2);
  });

  it('sin conceptos → 0', () => {
    const q = makeQuote({ servicios: [makeServicio({ conceptos: [] })] });
    expect(contarTarifasDisponibles(q, tarifaCountMap, conceptosCatalogo, conceptoMapTest)).toBe(0);
  });

  it('concepto sin match en catálogo → 0 para ese concepto', () => {
    const q = makeQuote({
      servicios: [makeServicio({
        conceptos: [makeConcepto({ nombre: 'Concepto Fantasma XYZ' })],
      })],
    });
    expect(contarTarifasDisponibles(q, tarifaCountMap, conceptosCatalogo, conceptoMapTest)).toBe(0);
  });
});
