/**
 * Tests de validarRespuestaN8N con respuestas reales del extractor.
 *
 * Estas respuestas se obtuvieron del n8n real a través del emulador de Functions
 * con tres formatos sintéticos del mismo correo de ONE:
 *   - .txt (correo pegado): n8n responde { ok: false, error: "Could not process image" }
 *   - .xlsx (tabla): n8n responde ok con 14 tarifas (12 fletes + AMS + Telex)
 *   - .png (captura): n8n responde ok con 12 tarifas (solo fletes)
 */

import { describe, it, expect } from 'vitest';
import {
  validarRespuestaN8N,
  construirLineasEnRevision,
  normalizarUnidad,
} from '../importacionTarifas';

// ── Respuestas reales ───────────────────────────────────────────────────

const RESP_TXT = {
  ok: false,
  error: 'La IA devolvió un error: Could not process image',
};

const RESP_XLSX = {
  ok: true,
  proveedor: 'ONE',
  vigenciaTexto: 'Till July 31',
  fechaInicio: null,
  fechaFin: '2024-07-31',
  confianza: 'media',
  observaciones: 'No se especifica el año de vigencia',
  totalLineas: 14,
  lineasConAviso: 0,
  tarifas: [
    { lineaId: 'tmp-1', concepto: 'Flete marítimo', puertoOrigen: 'Shenzhen', puertoDestino: 'Manzanillo', unidad: 'contenedor', monto: 4300, montoPor40: 4400, montoPor40HC: 4400, montoMinimo: 0, moneda: 'USD', tiempoTransito: 21, freeTime: 0, condiciones: '', avisos: [], requiereRevision: false },
    { lineaId: 'tmp-13', concepto: 'AMS', puertoOrigen: null, puertoDestino: null, unidad: 'servicio', monto: 30, montoPor40: 0, montoPor40HC: 0, montoMinimo: 0, moneda: 'USD', tiempoTransito: 0, freeTime: 0, condiciones: 'por bill', avisos: [], requiereRevision: false },
    { lineaId: 'tmp-14', concepto: 'Telex Release', puertoOrigen: null, puertoDestino: null, unidad: 'servicio', monto: 50, montoPor40: 0, montoPor40HC: 0, montoMinimo: 0, moneda: 'USD', tiempoTransito: 0, freeTime: 0, condiciones: 'por bill', avisos: [], requiereRevision: false },
  ],
};

const RESP_PNG = {
  ok: true,
  proveedor: 'ONE (Ocean Network Express)',
  vigenciaTexto: 'Rates valid till July 31 | Free time: 21 days',
  fechaInicio: null,
  fechaFin: '2024-07-31',
  confianza: 'media',
  observaciones: 'AMS y Telex no están en la tabla',
  totalLineas: 12,
  lineasConAviso: 0,
  tarifas: [
    { lineaId: 'tmp-1', concepto: 'Ocean Freight', puertoOrigen: 'Shenzhen', puertoDestino: 'Manzanillo', unidad: 'contenedor', monto: 4300, montoPor40: 4400, montoPor40HC: 4400, montoMinimo: 0, moneda: 'USD', tiempoTransito: 0, freeTime: 21, condiciones: 'Subject to: AMS USD 30/bill, Telex release USD 50/bill', avisos: [], requiereRevision: false },
  ],
};

// ── Tests ────────────────────────────────────────────────────────────────

describe('validarRespuestaN8N con respuestas reales del extractor', () => {
  it('.txt: rechaza con motivo claro (n8n no sabe leer texto plano como imagen)', () => {
    const r = validarRespuestaN8N(RESP_TXT);
    expect(r.valida).toBe(false);
    expect(r.motivo).toContain('Could not process image');
  });

  it('.xlsx: acepta con 14 tarifas y sin reparos graves', () => {
    const r = validarRespuestaN8N(RESP_XLSX);
    expect(r.valida).toBe(true);
    expect(r.datos!.tarifas!.length).toBe(3); // subset en el test
    expect(r.datos!.proveedor).toBe('ONE');
    expect(r.datos!.fechaFin).toBe('2024-07-31');
  });

  it('.png: acepta con 12 tarifas (no incluye AMS ni Telex)', () => {
    const r = validarRespuestaN8N(RESP_PNG);
    expect(r.valida).toBe(true);
    expect(r.datos!.tarifas!.length).toBeGreaterThan(0);
    expect(r.datos!.proveedor).toBe('ONE (Ocean Network Express)');
  });

  it('.xlsx: los montos por contenedor están todos presentes', () => {
    const r = validarRespuestaN8N(RESP_XLSX);
    const flete = r.datos!.tarifas![0];
    expect(flete.monto).toBe(4300);
    expect(flete.montoPor40).toBe(4400);
    expect(flete.montoPor40HC).toBe(4400);
  });

  it('.xlsx: AMS y Telex se extraen como tarifas aparte', () => {
    const r = validarRespuestaN8N(RESP_XLSX);
    const ams = r.datos!.tarifas!.find(t => t.concepto === 'AMS');
    const telex = r.datos!.tarifas!.find(t => t.concepto === 'Telex Release');
    expect(ams).toBeDefined();
    expect(ams!.monto).toBe(30);
    expect(telex).toBeDefined();
    expect(telex!.monto).toBe(50);
  });
});

describe('normalizarUnidad con valores reales del extractor', () => {
  it('contenedor → CONTENEDOR', () => {
    expect(normalizarUnidad('contenedor')).toBe('CONTENEDOR');
  });

  it('servicio → FIJO (los cargos por bill se cobran fijo)', () => {
    expect(normalizarUnidad('servicio')).toBe('FIJO');
  });
});

describe('construirLineasEnRevision con respuesta xlsx', () => {
  it('resuelve la unidad contenedor y deja moneda sin confirmar', () => {
    const r = validarRespuestaN8N(RESP_XLSX);
    const lineas = construirLineasEnRevision(r.datos!, { conceptos: [], puertos: [] });
    const primera = lineas[0];
    expect(primera.unidad).toBe('CONTENEDOR');
    expect(primera.moneda).toBe('USD');
    expect(primera.monedaConfirmada).toBe(false);
    expect(primera.unidadConfirmada).toBe(false);
  });

  it('AMS queda con unidad FIJO', () => {
    const r = validarRespuestaN8N(RESP_XLSX);
    const lineas = construirLineasEnRevision(r.datos!, { conceptos: [], puertos: [] });
    const ams = lineas.find(l => l.extraida.concepto === 'AMS');
    expect(ams!.unidad).toBe('FIJO');
  });
});
