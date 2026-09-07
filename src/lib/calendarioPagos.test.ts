/**
 * Tests de calendarioPagos.ts (1.4).
 *
 * Los pagos no admiten errores de un día, y el más fácil de cometer es el de
 * zona horaria: `new Date('2026-09-15')` en México crea el día 14 a las 18:00.
 * Varios de estos tests existen solo para fijar que eso no pasa.
 */

import { describe, it, expect } from 'vitest';
import {
  esHabil, esFinDeSemana, sumarDiasNaturales, siguienteHabil, programarPago,
  siguienteDiaDeLaSemana, ultimoHabilDelMes, agruparParaPago, regimenDe, FESTIVOS_2026,
} from './calendarioPagos';

// ─── A · Aritmética sin zona horaria ─────────────────────────────────────────

describe('las fechas no se corren por zona horaria', () => {
  it('sumar cero días devuelve el mismo día', () => {
    expect(sumarDiasNaturales('2026-09-15', 0)).toBe('2026-09-15');
  });

  it('sumar cruza meses y años correctamente', () => {
    expect(sumarDiasNaturales('2026-01-31', 1)).toBe('2026-02-01');
    expect(sumarDiasNaturales('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDiasNaturales('2026-02-28', 1)).toBe('2026-03-01'); // 2026 no es bisiesto
  });

  it('reconoce el fin de semana', () => {
    expect(esFinDeSemana('2026-09-12')).toBe(true);  // sábado
    expect(esFinDeSemana('2026-09-13')).toBe(true);  // domingo
    expect(esFinDeSemana('2026-09-14')).toBe(false); // lunes
  });
});

// ─── B · Días hábiles ────────────────────────────────────────────────────────

describe('esHabil y siguienteHabil', () => {
  it('un festivo no es hábil aunque sea entre semana', () => {
    expect(esHabil('2026-09-16')).toBe(false); // Independencia, miércoles
    expect(esHabil('2026-09-17')).toBe(true);
  });

  it('§4.7: el vencimiento en fin de semana se recorre al LUNES', () => {
    expect(siguienteHabil('2026-09-12')).toBe('2026-09-14'); // sábado → lunes
    expect(siguienteHabil('2026-09-13')).toBe('2026-09-14'); // domingo → lunes
  });

  it('si ya es hábil, no se mueve', () => {
    expect(siguienteHabil('2026-09-15')).toBe('2026-09-15');
  });

  it('salta el puente cuando el lunes es festivo', () => {
    // 2026-11-14 sábado, 15 domingo, 16 festivo (Revolución) → martes 17
    expect(siguienteHabil('2026-11-14')).toBe('2026-11-17');
  });

  it('nunca retrocede: adelantar el pago regalaría días de crédito', () => {
    const r = siguienteHabil('2026-09-12');
    expect(r >= '2026-09-12').toBe(true);
  });
});

// ─── C · Programación ────────────────────────────────────────────────────────

describe('programarPago — crédito natural, pago hábil', () => {
  it('el crédito corre en días NATURALES, no hábiles', () => {
    // 30 días naturales desde el 15 de agosto = 14 de septiembre (lunes)
    const p = programarPago('2026-08-15', 30);
    expect(p.fechaVencimiento).toBe('2026-09-14');
    expect(p.fechaPago).toBe('2026-09-14');
  });

  it('si el vencimiento cae en sábado, el pago es el lunes y lo explica', () => {
    const p = programarPago('2026-08-13', 30); // → 12 de septiembre, sábado
    expect(p.fechaVencimiento).toBe('2026-09-12');
    expect(p.fechaPago).toBe('2026-09-14');
    expect(p.explicacion).toContain('fin de semana');
  });

  it('si cae en festivo, también se recorre y lo dice', () => {
    const p = programarPago('2026-09-16', 0);
    expect(p.fechaPago).toBe('2026-09-17');
    expect(p.explicacion).toContain('festivo');
  });

  it('contado: se paga el siguiente hábil', () => {
    expect(programarPago('2026-09-15', 0).fechaPago).toBe('2026-09-15');
  });

  it('días de crédito negativos no adelantan nada', () => {
    expect(programarPago('2026-09-15', -10).fechaVencimiento).toBe('2026-09-15');
  });
});

// ─── D · Excepciones por proveedor ───────────────────────────────────────────

describe('las excepciones son acuerdos comerciales, no casos de borde', () => {
  it('Oñate solo cobra viernes', () => {
    const p = programarPago('2026-09-01', 14, 'Grupo Oñate S.A. de C.V.');
    expect(p.fechaVencimiento).toBe('2026-09-15'); // martes
    expect(p.fechaPago).toBe('2026-09-18');        // viernes
    expect(p.explicacion).toContain('viernes');
  });

  it('reconoce Oñate escrito sin la eñe', () => {
    expect(regimenDe('Transportes Onate').regimen.tipo).toBe('dia_fijo');
  });

  it('Aseguranza Peninsular se consolida al último hábil del mes', () => {
    const p = programarPago('2026-09-01', 5, 'Aseguranza Peninsular');
    expect(p.fechaPago).toBe('2026-09-30'); // miércoles, hábil
    expect(p.explicacion).toContain('consolidado');
  });

  it('un proveedor sin excepción paga en su fecha normal', () => {
    expect(regimenDe('Hapag-Lloyd').regimen.tipo).toBe('normal');
  });

  it('el último hábil del mes retrocede si cae en fin de semana', () => {
    // 31 de octubre de 2026 es sábado → viernes 30
    expect(ultimoHabilDelMes('2026-10-15')).toBe('2026-10-30');
  });

  it('siguienteDiaDeLaSemana salta un viernes festivo', () => {
    // 2026-05-01 es viernes Y festivo → el siguiente viernes hábil es el 8
    expect(siguienteDiaDeLaSemana('2026-04-28', 5)).toBe('2026-05-08');
  });
});

// ─── E · Agrupación ──────────────────────────────────────────────────────────

describe('agruparParaPago — una transferencia por proveedor, día y moneda', () => {
  const f = (over: Partial<{ proveedorId: string; proveedorNombre: string; folio: string; monto: number; moneda: string; fecha: string }> = {}) => ({
    proveedorId: 'PRV-1', proveedorNombre: 'Hapag', folio: 'OC-1',
    monto: 1000, moneda: 'MXN', fecha: '2026-09-15', ...over,
  });

  it('junta las facturas del mismo proveedor y día, con sus folios', () => {
    const g = agruparParaPago(
      [f({ folio: 'OC-1', monto: 1000 }), f({ folio: 'OC-2', monto: 2500 })],
      x => x.fecha,
    );
    expect(g).toHaveLength(1);
    expect(g[0].total).toBe(3500);
    expect(g[0].folios).toEqual(['OC-1', 'OC-2']);
  });

  it('§4.3: distinta MONEDA es otra transferencia, no se suman', () => {
    const g = agruparParaPago([f({ moneda: 'MXN' }), f({ moneda: 'USD' })], x => x.fecha);
    expect(g).toHaveLength(2);
  });

  it('distinto proveedor o distinto día también separan', () => {
    const g = agruparParaPago([
      f({ proveedorId: 'A' }), f({ proveedorId: 'B' }), f({ fecha: '2026-09-16' }),
    ], x => x.fecha);
    expect(g).toHaveLength(3);
  });

  it('sale ordenado por fecha', () => {
    const g = agruparParaPago([
      f({ fecha: '2026-09-20' }), f({ fecha: '2026-09-15', proveedorId: 'Z' }),
    ], x => x.fecha);
    expect(g[0].fechaPago).toBe('2026-09-15');
  });

  it('sin nada que pagar devuelve vacío', () => {
    expect(agruparParaPago([], x => x.fecha)).toEqual([]);
  });

  it('la lista de festivos no está vacía', () => {
    expect(FESTIVOS_2026.length).toBeGreaterThan(0);
  });
});
