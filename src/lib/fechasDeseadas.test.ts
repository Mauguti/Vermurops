import { describe, it, expect } from 'vitest';
import { leerFechaDeseada, fechasDeseadasDe, problemasFechasDeseadas, formatearFechaDeseada, textoFechasDeseadas } from './fechasDeseadas';

describe('leerFechaDeseada', () => {
  it('acepta YYYY-MM-DD válido', () => expect(leerFechaDeseada('2026-10-12')).toBe('2026-10-12'));
  it.each(['', null, undefined, '12/10/2026', '2026-02-31', '2026-13-01', 5])('descarta %s', v => {
    expect(leerFechaDeseada(v)).toBeNull();
  });
});

describe('problemasFechasDeseadas', () => {
  const hoy = '2026-10-09';
  it('entrega antes de recolección es error', () => {
    expect(problemasFechasDeseadas('2026-10-20', '2026-10-15', hoy).error).toMatch(/antes de la recolección/);
  });
  it('mismo día no es error', () => {
    expect(problemasFechasDeseadas('2026-10-20', '2026-10-20', hoy).error).toBeNull();
  });
  it('fecha pasada avisa y no bloquea', () => {
    const p = problemasFechasDeseadas('2026-10-01', '2026-10-20', hoy);
    expect(p.error).toBeNull();
    expect(p.avisos).toEqual(['La fecha de recolección ya pasó.']);
  });
  it('ambas pasadas dan dos avisos', () => {
    expect(problemasFechasDeseadas('2026-09-01', '2026-09-05', hoy).avisos).toHaveLength(2);
  });
  it('con una sola fecha no hay error', () => {
    expect(problemasFechasDeseadas(null, '2026-10-15', hoy).error).toBeNull();
    expect(problemasFechasDeseadas('2026-10-15', undefined, hoy).error).toBeNull();
  });
  it('hoy no es pasado', () => expect(problemasFechasDeseadas(hoy, hoy, hoy).avisos).toEqual([]));
});

describe('lectura y formato', () => {
  it('cotización legacy sin campos', () => {
    expect(fechasDeseadasDe({})).toEqual({ recoleccion: null, entrega: null });
    expect(textoFechasDeseadas({})).toBe('');
  });
  it('formatea sin correr de día por zona horaria', () => {
    expect(formatearFechaDeseada('2026-10-01')).toBe('1 oct 2026');
    expect(formatearFechaDeseada(null)).toBe('—');
  });
  it('texto del PDF con una o dos fechas', () => {
    expect(textoFechasDeseadas({ fechaEntregaDeseada: '2026-10-20' })).toBe('Entrega deseada: 20 oct 2026');
    expect(textoFechasDeseadas({ fechaRecoleccionDeseada: '2026-10-12', fechaEntregaDeseada: '2026-10-20' }))
      .toBe('Recolección deseada: 12 oct 2026 · Entrega deseada: 20 oct 2026');
  });
});
