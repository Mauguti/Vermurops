/**
 * historialCliente.test.ts
 *
 * Tests para la extracción de historial y resumen de cliente.
 * La consulta es más directa que proveedor (KanbanQuote.clienteId),
 * pero los tests cubren distintas etapas y estados finales.
 */

import { describe, it, expect } from 'vitest';
import {
  extraerHistorialCliente,
  calcularResumenCliente,
  formatTotalesPorMoneda,
} from './historialCliente';
import type { KanbanQuote } from '../components/quotes/QuotesData';

// ─── Helper para construir fixtures ──────────────────────────────────────────

function makeQuote(overrides: Partial<KanbanQuote> = {}): KanbanQuote {
  return {
    id: 'COT-2026-0001',
    etapa: 'solicitud_cliente',
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

// ─── Tests: extraerHistorialCliente ──────────────────────────────────────────

describe('extraerHistorialCliente', () => {
  it('extrae cotizaciones de un cliente en distintas etapas', () => {
    const quotes: KanbanQuote[] = [
      makeQuote({
        id: 'COT-001',
        clienteId: 'CLI-001',
        createdAt: '2026-06-01 10:00',
        etapa: 'ganada',
        estadoFinal: 'ganada',
        valorTotalConsolidado: 5000,
        moneda: 'USD',
        servicios: [{ id: 'srv-1', tipo: 'maritimo', ruta: { origen: 'A', destino: 'B' }, incoterm: 'FOB', mercancia: 'X', peso: 100, volumen: 1, estado: 'cotizado', cotizacionesProveedor: [], profit: 0, recargosPct: 0, conceptos: [] }],
      }),
      makeQuote({
        id: 'COT-002',
        clienteId: 'CLI-001',
        createdAt: '2026-07-01 09:00',
        etapa: 'perdida',
        estadoFinal: 'perdida',
        motivoPerdida: 'Precio',
        valorTotalConsolidado: 3000,
        moneda: 'USD',
        servicios: [
          { id: 'srv-2a', tipo: 'maritimo', ruta: { origen: 'A', destino: 'B' }, incoterm: 'FOB', mercancia: 'X', peso: 100, volumen: 1, estado: 'cotizado', cotizacionesProveedor: [], profit: 0, recargosPct: 0, conceptos: [] },
          { id: 'srv-2b', tipo: 'terrestre', ruta: { origen: 'B', destino: 'C' }, incoterm: 'DAP', mercancia: 'Y', peso: 50, volumen: 2, estado: 'cotizado', cotizacionesProveedor: [], profit: 0, recargosPct: 0, conceptos: [] },
        ],
      }),
      makeQuote({
        id: 'COT-003',
        clienteId: 'CLI-001',
        createdAt: '2026-08-01 08:00',
        etapa: 'negociacion',
        estadoFinal: null,
        valorTotalConsolidado: 12000,
        moneda: 'MXN',
        servicios: [],
      }),
    ];

    const registros = extraerHistorialCliente(quotes, 'CLI-001');

    expect(registros).toHaveLength(3);
    // Más reciente primero
    expect(registros[0].folio).toBe('COT-003');
    expect(registros[0].moneda).toBe('MXN');
    expect(registros[0].estadoFinal).toBeNull();

    expect(registros[1].folio).toBe('COT-002');
    expect(registros[1].estadoFinal).toBe('perdida');
    expect(registros[1].servicios).toBe(2);

    expect(registros[2].folio).toBe('COT-001');
    expect(registros[2].estadoFinal).toBe('ganada');
    expect(registros[2].totalConsolidado).toBe(5000);
    expect(registros[2].servicios).toBe(1);
  });

  it('cliente sin cotizaciones devuelve array vacío', () => {
    const quotes: KanbanQuote[] = [
      makeQuote({ clienteId: 'CLI-OTRO' }),
    ];

    const registros = extraerHistorialCliente(quotes, 'CLI-INEXISTENTE');
    expect(registros).toEqual([]);
  });

  it('ignora cotizaciones sin clienteId (legacy)', () => {
    const quotes: KanbanQuote[] = [
      makeQuote({ clienteId: undefined }),
      makeQuote({ clienteId: null }),
      makeQuote({ clienteId: 'CLI-001', id: 'COT-MATCH' }),
    ];

    const registros = extraerHistorialCliente(quotes, 'CLI-001');
    expect(registros).toHaveLength(1);
    expect(registros[0].folio).toBe('COT-MATCH');
  });

  it('quotes vacíos devuelve array vacío', () => {
    const registros = extraerHistorialCliente([], 'CLI-001');
    expect(registros).toEqual([]);
  });
});

// ─── Tests: calcularResumenCliente ───────────────────────────────────────────

describe('calcularResumenCliente', () => {
  it('clasifica correctamente ganadas, perdidas y en curso', () => {
    const registros = [
      { folio: 'COT-001', fecha: '2026-06-01', etapa: 'ganada' as const, estadoFinal: 'ganada' as const, totalConsolidado: 5000, moneda: 'USD' as const, servicios: 1 },
      { folio: 'COT-002', fecha: '2026-06-02', etapa: 'perdida' as const, estadoFinal: 'perdida' as const, totalConsolidado: 3000, moneda: 'USD' as const, servicios: 2 },
      { folio: 'COT-003', fecha: '2026-06-03', etapa: 'negociacion' as const, estadoFinal: null, totalConsolidado: 8000, moneda: 'USD' as const, servicios: 1 },
      { folio: 'COT-004', fecha: '2026-06-04', etapa: 'consolidada' as const, estadoFinal: null, totalConsolidado: 2000, moneda: 'MXN' as const, servicios: 3 },
      { folio: 'COT-005', fecha: '2026-06-05', etapa: 'ganada' as const, estadoFinal: 'ganada' as const, totalConsolidado: 15000, moneda: 'MXN' as const, servicios: 1 },
    ];

    const resumen = calcularResumenCliente(registros);

    expect(resumen.totalCotizaciones).toBe(5);
    expect(resumen.ganadas).toBe(2);
    expect(resumen.perdidas).toBe(1);
    expect(resumen.enCurso).toBe(2);

    // Montos ganados separados por moneda
    expect(resumen.montoGanado.USD).toBe(5000);
    expect(resumen.montoGanado.MXN).toBe(15000);

    // Montos totales separados por moneda
    expect(resumen.montoTotal.USD).toBe(16000); // 5000 + 3000 + 8000
    expect(resumen.montoTotal.MXN).toBe(17000); // 2000 + 15000
  });

  it('resumen vacío para cliente sin registros', () => {
    const resumen = calcularResumenCliente([]);

    expect(resumen.totalCotizaciones).toBe(0);
    expect(resumen.ganadas).toBe(0);
    expect(resumen.perdidas).toBe(0);
    expect(resumen.enCurso).toBe(0);
    expect(resumen.montoGanado.USD).toBe(0);
    expect(resumen.montoGanado.MXN).toBe(0);
    expect(resumen.montoTotal.USD).toBe(0);
    expect(resumen.montoTotal.MXN).toBe(0);
  });

  it('no mezcla monedas — montos separados correctamente', () => {
    const registros = [
      { folio: 'COT-001', fecha: '2026-06-01', etapa: 'ganada' as const, estadoFinal: 'ganada' as const, totalConsolidado: 12400, moneda: 'USD' as const, servicios: 1 },
      { folio: 'COT-002', fecha: '2026-06-02', etapa: 'ganada' as const, estadoFinal: 'ganada' as const, totalConsolidado: 85000, moneda: 'MXN' as const, servicios: 1 },
    ];

    const resumen = calcularResumenCliente(registros);

    expect(resumen.montoGanado.USD).toBe(12400);
    expect(resumen.montoGanado.MXN).toBe(85000);
    expect(resumen.montoTotal.USD).toBe(12400);
    expect(resumen.montoTotal.MXN).toBe(85000);
  });

  it('redondea montos a 2 decimales', () => {
    const registros = [
      { folio: 'COT-001', fecha: '2026-06-01', etapa: 'ganada' as const, estadoFinal: 'ganada' as const, totalConsolidado: 100.555, moneda: 'USD' as const, servicios: 1 },
      { folio: 'COT-002', fecha: '2026-06-02', etapa: 'ganada' as const, estadoFinal: 'ganada' as const, totalConsolidado: 200.449, moneda: 'USD' as const, servicios: 1 },
    ];

    const resumen = calcularResumenCliente(registros);
    expect(resumen.montoTotal.USD).toBe(301);
    expect(resumen.montoGanado.USD).toBe(301);
  });
});

// ─── Tests: formatTotalesPorMoneda ───────────────────────────────────────────

describe('formatTotalesPorMoneda (cliente)', () => {
  it('muestra ambas monedas', () => {
    expect(formatTotalesPorMoneda({ USD: 5000, MXN: 80000 })).toBe('USD $5,000 · MXN $80,000');
  });

  it('solo una moneda si la otra es 0', () => {
    expect(formatTotalesPorMoneda({ USD: 0, MXN: 50000 })).toBe('MXN $50,000');
  });

  it('"—" si ambos son 0', () => {
    expect(formatTotalesPorMoneda({ USD: 0, MXN: 0 })).toBe('—');
  });
});
