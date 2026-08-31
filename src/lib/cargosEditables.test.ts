/**
 * cargosEditables.test.ts
 *
 * A-3. Corregir un costo en el embarque sin perder lo que se cotizó.
 *
 * Lo que protegen: la diferencia entre lo pactado y lo que costó de verdad es
 * el dato que dirección revisa (D-5). Si una corrección lo sobrescribe, el
 * embarque se ve consistente y el profit real desaparece sin que nadie lo note.
 */

import { describe, it, expect } from 'vitest';
import {
  agruparCargos, editarMontoCargo, restaurarMontoCargo,
  desviacionDe, desviacionDelEmbarque, montoOriginal, GRUPO_EXTRA,
} from './cargosEditables';
import { CargoDetalle } from '../components/shipments/EmbarquesData';

const EDITOR = { nombre: 'Julio', cuando: '2026-08-31T12:00:00.000Z' };

function heredado(p: Partial<CargoDetalle> & { id: string; monto: number }): CargoDetalle {
  return {
    concepto: 'Flete marítimo', tipo: 'gasto', moneda: 'USD',
    origen: 'heredado',
    origenCotizacion: { cotizacionId: 'COT-1', servicioId: 'srv-1', conceptoId: 'c1' },
    ...p,
  } as CargoDetalle;
}
function manual(p: Partial<CargoDetalle> & { id: string; monto: number }): CargoDetalle {
  return { concepto: 'Demoras', tipo: 'gasto', moneda: 'USD', origen: 'manual', ...p } as CargoDetalle;
}

const BASE: CargoDetalle[] = [
  heredado({ id: 'ing-1', tipo: 'ingreso', monto: 2500 }),
  heredado({ id: 'gas-1', monto: 2000, proveedorId: 'PRV-001' }),
];

// ─── A · La marca de lo heredado ─────────────────────────────────────────────

describe('A · montoHeredado', () => {
  it('la primera edición guarda el importe original', () => {
    const r = editarMontoCargo(BASE, 'gas-1', 2200, EDITOR);
    const c = r.find(x => x.id === 'gas-1')!;
    expect(c.monto).toBe(2200);
    expect(c.montoHeredado).toBe(2000);
    expect(c.editadoPor).toBe('Julio');
  });

  it('la SEGUNDA edición no lo pisa: sigue midiéndose contra lo cotizado', () => {
    let r = editarMontoCargo(BASE, 'gas-1', 2200, EDITOR);
    r = editarMontoCargo(r, 'gas-1', 2350, EDITOR);
    const c = r.find(x => x.id === 'gas-1')!;
    expect(c.montoHeredado).toBe(2000);
    expect(desviacionDe(c)).toBe(350);
  });

  it('no muta el arreglo que recibe', () => {
    editarMontoCargo(BASE, 'gas-1', 9999, EDITOR);
    expect(BASE.find(c => c.id === 'gas-1')!.monto).toBe(2000);
  });

  it('editar al mismo importe no marca nada', () => {
    const r = editarMontoCargo(BASE, 'gas-1', 2000, EDITOR);
    expect(r.find(c => c.id === 'gas-1')!.montoHeredado).toBeUndefined();
  });

  it('volver al original a mano deja la marca: alguien lo tocó', () => {
    let r = editarMontoCargo(BASE, 'gas-1', 2200, EDITOR);
    r = editarMontoCargo(r, 'gas-1', 2000, EDITOR);
    const c = r.find(x => x.id === 'gas-1')!;
    expect(c.montoHeredado).toBe(2000);
    expect(desviacionDe(c)).toBe(0);
  });

  it('restaurar sí borra la marca y devuelve el importe', () => {
    const r = restaurarMontoCargo(editarMontoCargo(BASE, 'gas-1', 2200, EDITOR), 'gas-1');
    const c = r.find(x => x.id === 'gas-1')!;
    expect(c.monto).toBe(2000);
    expect(c.montoHeredado).toBeUndefined();
    expect(c.editadoPor).toBeUndefined();
  });

  it('sin editar, el original es el monto actual', () => {
    expect(montoOriginal(BASE[1])).toBe(2000);
    expect(desviacionDe(BASE[1])).toBe(0);
  });
});

// ─── B · Agrupación ──────────────────────────────────────────────────────────

describe('B · agrupación por concepto', () => {
  it('el ingreso y sus gastos caen en el mismo grupo', () => {
    const g = agruparCargos(BASE);
    expect(g).toHaveLength(1);
    expect(g[0].cargos.map(c => c.id)).toEqual(['ing-1', 'gas-1']);
    expect(g[0].titulo).toBe('Flete marítimo');
  });

  it('cada concepto de la cotización es su propio grupo', () => {
    const otro = heredado({
      id: 'gas-2', monto: 300, concepto: 'Maniobras',
      origenCotizacion: { cotizacionId: 'COT-1', servicioId: 'srv-1', conceptoId: 'c2' },
    });
    expect(agruparCargos([...BASE, otro])).toHaveLength(2);
  });

  it('lo capturado en el embarque va a un grupo aparte, al final', () => {
    const g = agruparCargos([manual({ id: 'm1', monto: 150 }), ...BASE]);
    expect(g.map(x => x.clave)).toEqual(['c1', GRUPO_EXTRA]);
    expect(g[1].heredado).toBe(false);
  });

  it('los totales van por moneda, nunca sumados (§4.3)', () => {
    const enPesos = heredado({ id: 'gas-mx', monto: 8000, moneda: 'MXN' });
    const g = agruparCargos([...BASE, enPesos])[0];
    expect(g.porMoneda.USD).toEqual({ ingresos: 2500, gastos: 2000, ganancia: 500 });
    expect(g.porMoneda.MXN).toEqual({ ingresos: 0, gastos: 8000, ganancia: -8000 });
  });

  it('marca el grupo que cobra en una moneda y paga en otra', () => {
    const g = agruparCargos([
      heredado({ id: 'ing-1', tipo: 'ingreso', monto: 50000, moneda: 'MXN' }),
      heredado({ id: 'gas-1', monto: 2000, moneda: 'USD' }),
    ])[0];
    expect(g.mezclaMonedas).toBe(true);
  });

  it('un grupo de una sola moneda no se marca como mezclado', () => {
    expect(agruparCargos(BASE)[0].mezclaMonedas).toBe(false);
  });

  it('la desviación del grupo suma solo los gastos, por moneda', () => {
    const r = editarMontoCargo(BASE, 'gas-1', 2200, EDITOR);
    const g = agruparCargos(r)[0];
    expect(g.desviacionGasto.USD).toBe(200);
    expect(g.editado).toBe(true);
  });
});

// ─── C · El dato del profit real ─────────────────────────────────────────────

describe('C · desviación del embarque', () => {
  it('separa lo que se cobró de más de lo que costó de más', () => {
    let r = editarMontoCargo(BASE, 'gas-1', 2200, EDITOR);
    r = editarMontoCargo(r, 'ing-1', 2600, EDITOR);
    expect(desviacionDelEmbarque(r).USD).toEqual({ ingresos: 100, gastos: 200 });
  });

  it('sin ediciones es cero, no un número inventado', () => {
    expect(desviacionDelEmbarque(BASE)).toEqual({
      USD: { ingresos: 0, gastos: 0 },
      MXN: { ingresos: 0, gastos: 0 },
    });
  });

  it('no mezcla monedas al acumular', () => {
    const mixto = [...BASE, heredado({ id: 'gas-mx', monto: 8000, moneda: 'MXN' })];
    const r = editarMontoCargo(mixto, 'gas-mx', 8500, EDITOR);
    const d = desviacionDelEmbarque(r);
    expect(d.MXN.gastos).toBe(500);
    expect(d.USD.gastos).toBe(0);
  });

  it('un costo menor al cotizado da desviación negativa', () => {
    const r = editarMontoCargo(BASE, 'gas-1', 1800, EDITOR);
    expect(desviacionDelEmbarque(r).USD.gastos).toBe(-200);
  });
});
