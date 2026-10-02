/**
 * tipoCambioBanxico.test.ts
 *
 * Tests con la respuesta real del 1-oct-2026 como fixture.
 */

import { describe, it, expect } from 'vitest';
import {
  procesarRespuesta,
  estaDesactualizado,
  esDiaHabil,
  diaHabilAnterior,
  etiquetaFechaTC,
  SERIE_FIX,
  SERIE_FIX_LIQUIDACION,
  type RespuestaTipoCambio,
  type ErrorConsulta,
} from './tipoCambioBanxico';

// ── Fixture: respuesta real del 1-oct-2026 ──────────────────────────────────

const RESPUESTA_REAL: RespuestaTipoCambio = {
  ok: true,
  fuente: 'banxico',
  consultado: '2026-10-01T18:30:00.000Z',
  series: [
    { serie: 'SF43718', titulo: 'Tipo de cambio pesos por dólar E.U.A. Tipo de cambio para solventar obligaciones denominadas en moneda extranjera Fecha de determinación (FIX)', fecha: '2026-10-01', valor: 18.3688 },
    { serie: 'SF60653', titulo: 'Tipo de cambio pesos por dólar E.U.A. Tipo de cambio para solventar obligaciones denominadas en moneda extranjera Fecha de liquidación', fecha: '2026-10-05', valor: 18.3688 },
  ],
};

// ── procesarRespuesta ───────────────────────────────────────────────────────

describe('procesarRespuesta', () => {
  it('extrae el FIX y la fecha de liquidación de la respuesta real', () => {
    const r = procesarRespuesta(RESPUESTA_REAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.registro.valor).toBe(18.3688);
    expect(r.registro.fechaDeterminacion).toBe('2026-10-01');
    expect(r.registro.fechaLiquidacion).toBe('2026-10-05');
    expect(r.registro.fuente).toBe('banxico');
    expect(r.registro.serie).toBe(SERIE_FIX);
  });

  it('falla cuando la respuesta no es ok', () => {
    const r = procesarRespuesta({ ok: false, fuente: 'banxico', consultado: '', series: [], error: 'boom' });
    expect(r.ok).toBe(false);
    expect((r as ErrorConsulta).error).toContain('boom');
  });

  it('falla cuando SF43718 reporta N/E (valor null)', () => {
    const resp: RespuestaTipoCambio = {
      ok: true, fuente: 'banxico', consultado: '2026-10-01T00:00:00Z',
      series: [
        { serie: SERIE_FIX, titulo: 'FIX', fecha: '2026-10-01', valor: null },
        { serie: SERIE_FIX_LIQUIDACION, titulo: 'LIQ', fecha: '2026-10-05', valor: null },
      ],
    };
    const r = procesarRespuesta(resp);
    expect(r.ok).toBe(false);
    expect((r as ErrorConsulta).error).toContain('N/E');
  });

  it('funciona sin la serie de liquidación', () => {
    const resp: RespuestaTipoCambio = {
      ok: true, fuente: 'banxico', consultado: '2026-10-01T00:00:00Z',
      series: [
        { serie: SERIE_FIX, titulo: 'FIX', fecha: '2026-10-01', valor: 19.5 },
      ],
    };
    const r = procesarRespuesta(resp);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.registro.valor).toBe(19.5);
    expect(r.registro.fechaLiquidacion).toBeNull();
  });

  it('rechaza series vacías', () => {
    const r = procesarRespuesta({ ok: true, fuente: 'banxico', consultado: '', series: [] });
    expect(r.ok).toBe(false);
  });
});

// ── esDiaHabil ──────────────────────────────────────────────────────────────

describe('esDiaHabil', () => {
  it('un miércoles normal es hábil', () => {
    expect(esDiaHabil(new Date(2026, 9, 7))).toBe(true); // 7-oct-2026, miércoles
  });

  it('sábado no es hábil', () => {
    expect(esDiaHabil(new Date(2026, 9, 3))).toBe(false); // 3-oct-2026, sábado
  });

  it('domingo no es hábil', () => {
    expect(esDiaHabil(new Date(2026, 9, 4))).toBe(false); // 4-oct-2026, domingo
  });

  it('1 de enero no es hábil', () => {
    expect(esDiaHabil(new Date(2026, 0, 1))).toBe(false);
  });

  it('16 de septiembre no es hábil', () => {
    expect(esDiaHabil(new Date(2026, 8, 16))).toBe(false);
  });

  it('25 de diciembre no es hábil', () => {
    expect(esDiaHabil(new Date(2026, 11, 25))).toBe(false);
  });

  it('1er lunes de febrero (Constitución) no es hábil', () => {
    // 2026: 1-feb es domingo, primer lunes es 2-feb
    expect(esDiaHabil(new Date(2026, 1, 2))).toBe(false);
  });

  it('3er lunes de marzo (Benito Juárez) no es hábil', () => {
    // 2026: 1-mar es domingo, 1er lunes es 2, 3er lunes es 16
    expect(esDiaHabil(new Date(2026, 2, 16))).toBe(false);
  });

  it('3er lunes de noviembre (Revolución) no es hábil', () => {
    // 2026: 1-nov es domingo, 1er lunes es 2, 3er lunes es 16
    expect(esDiaHabil(new Date(2026, 10, 16))).toBe(false);
  });
});

// ── diaHabilAnterior ────────────────────────────────────────────────────────

describe('diaHabilAnterior', () => {
  it('un martes devuelve el lunes', () => {
    const r = diaHabilAnterior(new Date(2026, 9, 6)); // 6-oct martes
    expect(r.getDate()).toBe(5);
    expect(r.getMonth()).toBe(9);
  });

  it('un lunes devuelve el viernes', () => {
    const r = diaHabilAnterior(new Date(2026, 9, 5)); // 5-oct lunes
    expect(r.getDate()).toBe(2);
    expect(r.getMonth()).toBe(9);
  });

  it('salta fines de semana', () => {
    const r = diaHabilAnterior(new Date(2026, 9, 4)); // 4-oct domingo
    expect(r.getDate()).toBe(2);
  });
});

// ── estaDesactualizado ──────────────────────────────────────────────────────

describe('estaDesactualizado', () => {
  it('sin fecha siempre está desactualizado', () => {
    expect(estaDesactualizado(null)).toBe(true);
    expect(estaDesactualizado(undefined)).toBe(true);
  });

  it('un dato del viernes visto el lunes NO está desactualizado', () => {
    // Viernes 2-oct-2026, consultado el lunes 5-oct-2026
    const lunes = new Date(2026, 9, 5, 10, 0);
    expect(estaDesactualizado('2026-10-02', lunes)).toBe(false);
  });

  it('un dato del jueves visto el lunes SÍ está desactualizado', () => {
    // Hay un dato del viernes que no llegó
    const lunes = new Date(2026, 9, 5, 10, 0);
    expect(estaDesactualizado('2026-10-01', lunes)).toBe(true);
  });

  it('un dato de hoy (día hábil) visto hoy no está desactualizado', () => {
    // Miércoles 7-oct-2026, dato del 7-oct
    const hoy = new Date(2026, 9, 7, 14, 0);
    expect(estaDesactualizado('2026-10-07', hoy)).toBe(false);
  });

  it('un dato de ayer visto hoy tampoco está desactualizado', () => {
    // El esperado es el día hábil anterior (ayer si ayer fue hábil)
    const hoy = new Date(2026, 9, 7, 14, 0); // miércoles
    expect(estaDesactualizado('2026-10-06', hoy)).toBe(false); // martes
  });
});

// ── etiquetaFechaTC ─────────────────────────────────────────────────────────

describe('etiquetaFechaTC', () => {
  it('formatea una fecha ISO como "1 oct 2026"', () => {
    expect(etiquetaFechaTC('2026-10-01')).toBe('1 oct 2026');
  });

  it('formatea febrero', () => {
    expect(etiquetaFechaTC('2026-02-15')).toBe('15 feb 2026');
  });
});
