/**
 * diasCreditoServicio.test.ts
 *
 * Tarea 37: la cotización usa los días de crédito de cada modalidad.
 *
 * Casos:
 *   - Cliente con desglose completo (diasCreditoPorTipo)
 *   - Cliente solo con `dias` (legacy)
 *   - Cotización multimodal (marítimo + terrestre) contra cálculo a mano
 *   - Despacho aduanal usa general
 *   - Sin cliente → contado
 *   - Etiqueta legible
 */

import { describe, it, expect } from 'vitest';
import {
  diasCreditoDeModalidad,
  calcFinanciamientoPorServicio,
  etiquetaDiasCredito,
  type DatosCreditoCliente,
} from './diasCreditoServicio';

// ─── diasCreditoDeModalidad ───────────────────────────────────────────────────

describe('diasCreditoDeModalidad', () => {
  const clienteConDesglose: DatosCreditoCliente = {
    diasCreditoPorTipo: { maritimo: 45, terrestre: 15, aereo: 20, general: 30 },
    dias: 30,
  };

  const clienteSoloDias: DatosCreditoCliente = {
    dias: 60,
  };

  const clienteConDesgloseIncompleto: DatosCreditoCliente = {
    diasCreditoPorTipo: { maritimo: 45, general: 30 },
    dias: 25,
  };

  it('marítimo con desglose completo → usa dias del marítimo', () => {
    expect(diasCreditoDeModalidad(clienteConDesglose, 'maritimo')).toBe(45);
  });

  it('terrestre con desglose completo → usa dias del terrestre', () => {
    expect(diasCreditoDeModalidad(clienteConDesglose, 'terrestre')).toBe(15);
  });

  it('aéreo con desglose completo → usa dias del aéreo', () => {
    expect(diasCreditoDeModalidad(clienteConDesglose, 'aereo')).toBe(20);
  });

  it('despacho aduanal usa general (§37: "Despacho aduanal usa general")', () => {
    expect(diasCreditoDeModalidad(clienteConDesglose, 'despacho_aduanal')).toBe(30);
  });

  it('modalidad desconocida usa general', () => {
    expect(diasCreditoDeModalidad(clienteConDesglose, 'cargos_locales')).toBe(30);
  });

  it('cliente solo con dias → cae al campo plano legacy', () => {
    expect(diasCreditoDeModalidad(clienteSoloDias, 'maritimo')).toBe(60);
    expect(diasCreditoDeModalidad(clienteSoloDias, 'terrestre')).toBe(60);
    expect(diasCreditoDeModalidad(clienteSoloDias, 'aereo')).toBe(60);
    expect(diasCreditoDeModalidad(clienteSoloDias, 'despacho_aduanal')).toBe(60);
  });

  it('desglose incompleto: terrestre cae a general, luego a dias', () => {
    // terrestre no está en diasCreditoPorTipo → cae a general (30)
    expect(diasCreditoDeModalidad(clienteConDesgloseIncompleto, 'terrestre')).toBe(30);
    // maritimo sí está → 45
    expect(diasCreditoDeModalidad(clienteConDesgloseIncompleto, 'maritimo')).toBe(45);
  });

  it('sin diasCreditoPorTipo ni dias → 0 (contado)', () => {
    expect(diasCreditoDeModalidad({}, 'maritimo')).toBe(0);
  });

  it('null → 0 (contado)', () => {
    expect(diasCreditoDeModalidad(null, 'maritimo')).toBe(0);
    expect(diasCreditoDeModalidad(undefined, 'maritimo')).toBe(0);
  });

  it('0 días en la modalidad es contado, no fallback', () => {
    const cliente: DatosCreditoCliente = {
      diasCreditoPorTipo: { maritimo: 0, general: 30 },
      dias: 30,
    };
    // 0 es un valor real (contado para marítimo), no ausencia
    expect(diasCreditoDeModalidad(cliente, 'maritimo')).toBe(0);
  });
});

// ─── calcFinanciamientoPorServicio ────────────────────────────────────────────

describe('calcFinanciamientoPorServicio', () => {
  // Factor: 1/2000 por día

  it('cotización unimodal marítima con 45 días', () => {
    const lineas = [
      { servicioTipo: 'maritimo', venta: 7000 },
      { servicioTipo: 'maritimo', venta: 4500 },
    ];
    const cliente: DatosCreditoCliente = {
      diasCreditoPorTipo: { maritimo: 45, terrestre: 15, aereo: 20, general: 30 },
    };

    const result = calcFinanciamientoPorServicio(lineas, cliente);

    // venta total marítimo = 11500
    // financiamiento = 11500 * 45 / 2000 = 258.75
    expect(result.monto).toBeCloseTo(258.75, 2);
    expect(result.desglose).toHaveLength(1);
    expect(result.desglose[0].modalidad).toBe('maritimo');
    expect(result.desglose[0].dias).toBe(45);
    expect(result.desglose[0].venta).toBe(11500);
  });

  it('cotización multimodal: marítimo (45d) + terrestre (15d)', () => {
    const lineas = [
      { servicioTipo: 'maritimo', venta: 7000 },
      { servicioTipo: 'maritimo', venta: 4500 },
      { servicioTipo: 'terrestre', venta: 3000 },
    ];
    const cliente: DatosCreditoCliente = {
      diasCreditoPorTipo: { maritimo: 45, terrestre: 15, aereo: 20, general: 30 },
    };

    const result = calcFinanciamientoPorServicio(lineas, cliente);

    // marítimo: 11500 * 45 / 2000 = 258.75
    // terrestre: 3000 * 15 / 2000 = 22.50
    // total: 281.25
    expect(result.monto).toBeCloseTo(281.25, 2);
    expect(result.desglose).toHaveLength(2);

    const mar = result.desglose.find(d => d.modalidad === 'maritimo')!;
    const ter = result.desglose.find(d => d.modalidad === 'terrestre')!;
    expect(mar.monto).toBeCloseTo(258.75, 2);
    expect(ter.monto).toBeCloseTo(22.5, 2);
  });

  it('compara contra cálculo plano: multimodal NO es lo mismo que un solo número', () => {
    const lineas = [
      { servicioTipo: 'maritimo', venta: 10000 },
      { servicioTipo: 'terrestre', venta: 5000 },
    ];
    const cliente: DatosCreditoCliente = {
      diasCreditoPorTipo: { maritimo: 45, terrestre: 15, aereo: 20, general: 30 },
      dias: 30,
    };

    const result = calcFinanciamientoPorServicio(lineas, cliente);
    // multimodal: 10000 * 45/2000 + 5000 * 15/2000 = 225 + 37.5 = 262.5
    expect(result.monto).toBeCloseTo(262.5, 2);

    // Con el cálculo plano (30 días para todo): 15000 * 30/2000 = 225
    // Son distintos: la multimodal captura que el marítimo tiene más días
    const plano = 15000 * 30 / 2000;
    expect(plano).toBe(225);
    expect(result.monto).not.toBeCloseTo(plano, 2);
  });

  it('cliente solo con dias: todos los servicios usan el mismo valor', () => {
    const lineas = [
      { servicioTipo: 'maritimo', venta: 10000 },
      { servicioTipo: 'terrestre', venta: 5000 },
    ];
    const cliente: DatosCreditoCliente = { dias: 30 };

    const result = calcFinanciamientoPorServicio(lineas, cliente);
    // Ambos usan 30 días: 10000 * 30/2000 + 5000 * 30/2000 = 150 + 75 = 225
    expect(result.monto).toBeCloseTo(225, 2);
  });

  it('sin cliente → financiamiento = 0 (contado)', () => {
    const lineas = [{ servicioTipo: 'maritimo', venta: 10000 }];
    const result = calcFinanciamientoPorServicio(lineas, null);

    expect(result.monto).toBe(0);
    expect(result.desglose).toHaveLength(1);
    expect(result.desglose[0].dias).toBe(0);
  });
});

// ─── etiquetaDiasCredito ──────────────────────────────────────────────────────

describe('etiquetaDiasCredito', () => {
  it('sin desglose → "Contado"', () => {
    expect(etiquetaDiasCredito([])).toBe('Contado');
  });

  it('un servicio con 0 días → "Contado"', () => {
    expect(etiquetaDiasCredito([
      { modalidad: 'maritimo', dias: 0, venta: 10000, monto: 0 },
    ])).toBe('Contado');
  });

  it('un solo servicio → "30 días de crédito"', () => {
    expect(etiquetaDiasCredito([
      { modalidad: 'maritimo', dias: 30, venta: 10000, monto: 150 },
    ])).toBe('30 días de crédito');
  });

  it('todos iguales → simplifica a un solo número', () => {
    expect(etiquetaDiasCredito([
      { modalidad: 'maritimo', dias: 30, venta: 10000, monto: 150 },
      { modalidad: 'terrestre', dias: 30, venta: 5000, monto: 75 },
    ])).toBe('30 días de crédito');
  });

  it('diferentes → desglose por modalidad', () => {
    const result = etiquetaDiasCredito([
      { modalidad: 'maritimo', dias: 45, venta: 10000, monto: 225 },
      { modalidad: 'terrestre', dias: 15, venta: 5000, monto: 37.5 },
    ]);
    expect(result).toBe('Marítimo 45 días · Terrestre 15 días');
  });

  it('usa etiquetas legibles para las modalidades', () => {
    const result = etiquetaDiasCredito([
      { modalidad: 'aereo', dias: 20, venta: 8000, monto: 80 },
      { modalidad: 'despacho_aduanal', dias: 30, venta: 2000, monto: 30 },
    ]);
    expect(result).toBe('Aéreo 20 días · Despacho aduanal 30 días');
  });
});
