/**
 * cargosEmbarque.test.ts
 *
 * E-2. Dos reglas de negocio que este modelo tiene que sostener:
 *
 *  §4.3 — los totales nunca se mezclan entre monedas. La versión anterior
 *  convertía MXN a USD con una tasa fija de 18.0 escrita en el código y
 *  devolvía un único número. Se veía creíble y era basura.
 *
 *  §4.8 (28-ago-2026) — al facturar se elige entre una factura general que
 *  cubre todo el embarque, o facturas separadas por grupo de conceptos. Una
 *  línea no puede quedar en dos facturas.
 */

import { describe, it, expect } from 'vitest';
import {
  calcularTotalesPorMoneda,
  monedasConMovimiento,
  lineasFacturables,
  gruposDeFacturacion,
  recalcularCargos,
  totalesDe,
  CargoDetalle,
  EmbarqueCargos,
} from '../components/shipments/EmbarquesData';

const cargo = (p: Partial<CargoDetalle> & Pick<CargoDetalle, 'tipo' | 'monto' | 'moneda'>): CargoDetalle => ({
  id: p.id ?? `c-${Math.abs(p.monto)}-${p.tipo}-${p.moneda}`,
  concepto: p.concepto ?? 'Concepto',
  ...p,
});

// Escenario típico de Vermur: flete internacional en USD, maniobras en MXN.
const MIXTO: CargoDetalle[] = [
  cargo({ id: 'c1', concepto: 'Flete marítimo',  tipo: 'ingreso', monto: 2500, moneda: 'USD' }),
  cargo({ id: 'c2', concepto: 'Flete marítimo',  tipo: 'gasto',   monto: 1800, moneda: 'USD' }),
  cargo({ id: 'c3', concepto: 'Maniobras',       tipo: 'ingreso', monto: 15000, moneda: 'MXN' }),
  cargo({ id: 'c4', concepto: 'Maniobras',       tipo: 'gasto',   monto: 11000, moneda: 'MXN' }),
];

describe('§4.3 — los totales nunca se mezclan', () => {
  it('cada moneda lleva su propia cuenta', () => {
    const t = calcularTotalesPorMoneda(MIXTO);
    expect(t.USD).toEqual({ ingresos: 2500, gastos: 1800, ganancia: 700 });
    expect(t.MXN).toEqual({ ingresos: 15000, gastos: 11000, ganancia: 4000 });
  });

  it('NO convierte MXN a USD: 15000 MXN no se suman a los 2500 USD', () => {
    const t = calcularTotalesPorMoneda(MIXTO);
    // Con la tasa fija de 18.0 que había antes, ingresos USD daban 3333.33.
    expect(t.USD.ingresos).toBe(2500);
    expect(t.USD.ingresos).not.toBeCloseTo(2500 + 15000 / 18, 1);
  });

  it('una moneda sin movimiento queda en ceros, no ausente', () => {
    const t = calcularTotalesPorMoneda([cargo({ tipo: 'ingreso', monto: 100, moneda: 'USD' })]);
    expect(t.MXN).toEqual({ ingresos: 0, gastos: 0, ganancia: 0 });
  });

  it('sin líneas, todo en cero', () => {
    const t = calcularTotalesPorMoneda([]);
    expect(t.USD).toEqual({ ingresos: 0, gastos: 0, ganancia: 0 });
    expect(t.MXN).toEqual({ ingresos: 0, gastos: 0, ganancia: 0 });
  });

  it('la ganancia puede ser negativa y no se recorta a cero', () => {
    const t = calcularTotalesPorMoneda([
      cargo({ tipo: 'ingreso', monto: 100, moneda: 'USD' }),
      cargo({ tipo: 'gasto',   monto: 250, moneda: 'USD' }),
    ]);
    expect(t.USD.ganancia).toBe(-150);
  });

  it('redondea a dos decimales sin arrastrar error de punto flotante', () => {
    const t = calcularTotalesPorMoneda([
      cargo({ id: 'a', tipo: 'ingreso', monto: 0.1, moneda: 'USD' }),
      cargo({ id: 'b', tipo: 'ingreso', monto: 0.2, moneda: 'USD' }),
    ]);
    expect(t.USD.ingresos).toBe(0.3);
  });

  it('monedasConMovimiento solo lista las que aparecen', () => {
    expect(monedasConMovimiento(MIXTO)).toEqual(['USD', 'MXN']);
    expect(monedasConMovimiento([cargo({ tipo: 'gasto', monto: 5, moneda: 'MXN' })])).toEqual(['MXN']);
    expect(monedasConMovimiento([])).toEqual([]);
  });
});

describe('§4.8 — factura general o separada', () => {
  const CON_GRUPOS: CargoDetalle[] = [
    cargo({ id: 'g1', tipo: 'ingreso', monto: 100, moneda: 'USD', grupoFacturacion: 'flete' }),
    cargo({ id: 'g2', tipo: 'ingreso', monto: 200, moneda: 'USD', grupoFacturacion: 'aduana' }),
    cargo({ id: 'g3', tipo: 'ingreso', monto: 300, moneda: 'USD' }),
    cargo({ id: 'g4', tipo: 'gasto',   monto: 400, moneda: 'USD', grupoFacturacion: 'flete' }),
  ];

  it('la factura GENERAL cubre todos los ingresos sin facturar', () => {
    const l = lineasFacturables(CON_GRUPOS);
    expect(l.map(c => c.id)).toEqual(['g1', 'g2', 'g3']);
  });

  it('nunca incluye líneas de gasto: al cliente no se le factura lo que pagamos', () => {
    expect(lineasFacturables(CON_GRUPOS).every(c => c.tipo === 'ingreso')).toBe(true);
  });

  it('la factura SEPARADA cubre solo su grupo', () => {
    expect(lineasFacturables(CON_GRUPOS, 'flete').map(c => c.id)).toEqual(['g1']);
    expect(lineasFacturables(CON_GRUPOS, 'aduana').map(c => c.id)).toEqual(['g2']);
  });

  it('una línea ya facturada no se vuelve a facturar', () => {
    const yaFacturada = CON_GRUPOS.map(c =>
      c.id === 'g1' ? { ...c, facturaId: 'FAC-001' } : c,
    );
    expect(lineasFacturables(yaFacturada).map(c => c.id)).toEqual(['g2', 'g3']);
    expect(lineasFacturables(yaFacturada, 'flete')).toEqual([]);
  });

  it('facturaId en null cuenta como no facturada', () => {
    const l = lineasFacturables([cargo({ id: 'x', tipo: 'ingreso', monto: 1, moneda: 'USD', facturaId: null })]);
    expect(l.map(c => c.id)).toEqual(['x']);
  });

  it('gruposDeFacturacion lista los grupos de ingreso, ordenados y sin repetir', () => {
    expect(gruposDeFacturacion(CON_GRUPOS)).toEqual(['aduana', 'flete']);
  });

  it('facturar todo por grupos cubre exactamente lo mismo que la general', () => {
    // Salvo las líneas sin grupo, que solo entran en la general.
    const conGrupoTodas = CON_GRUPOS.map(c =>
      c.grupoFacturacion ? c : { ...c, grupoFacturacion: 'otros' },
    );
    const general = lineasFacturables(conGrupoTodas).map(c => c.id).sort();
    const porGrupos = gruposDeFacturacion(conGrupoTodas)
      .flatMap(g => lineasFacturables(conGrupoTodas, g).map(c => c.id))
      .sort();
    expect(porGrupos).toEqual(general);
  });
});

describe('recalcularCargos y compatibilidad', () => {
  it('devuelve totales por moneda y conserva las líneas', () => {
    const c = recalcularCargos(MIXTO);
    expect(c.totalesPorMoneda!.MXN.ganancia).toBe(4000);
    expect(c.detalles).toHaveLength(4);
  });

  it('los campos deprecados traen USD sin convertir, no una mezcla', () => {
    const c = recalcularCargos(MIXTO);
    expect(c.ingresos).toBe(2500);
    expect(c.gastos).toBe(1800);
    expect(c.ganancia).toBe(700);
    expect(c.moneda).toBe('USD');
  });

  it('totalesDe() recalcula cuando el documento es anterior a E-2', () => {
    // Un embarque creado durante la validación de E-1: sin totalesPorMoneda.
    const viejo = {
      ingresos: 0, gastos: 0, ganancia: 0, moneda: 'USD',
      detalles: MIXTO,
    } as EmbarqueCargos;
    expect(totalesDe(viejo).MXN.ingresos).toBe(15000);
    expect(totalesDe(viejo).USD.ganancia).toBe(700);
  });

  it('totalesDe() tolera un documento sin líneas', () => {
    const vacio = { ingresos: 0, gastos: 0, ganancia: 0, moneda: 'USD' } as unknown as EmbarqueCargos;
    expect(totalesDe(vacio).USD).toEqual({ ingresos: 0, gastos: 0, ganancia: 0 });
  });
});
