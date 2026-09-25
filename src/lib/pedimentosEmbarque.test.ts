import { describe, it, expect } from 'vitest';
import {
  pedimentosDe, renglonesPedimento, guardarPedimentos, aplicaSoloExportacion,
} from './pedimentosEmbarque';

describe('respaldo del campo viejo', () => {
  it('sin arreglo, el singular es el primer elemento', () => {
    expect(pedimentosDe({ pedimento: '26-47-3849-6012489' })).toEqual(['26-47-3849-6012489']);
  });

  it('con arreglo, manda el arreglo', () => {
    expect(pedimentosDe({ pedimento: 'viejo', pedimentos: ['A', 'B'] })).toEqual(['A', 'B']);
  });

  it('un arreglo vacío es «no tiene ninguno», aunque el singular traiga algo', () => {
    // Quitar todos los pedimentos a mano es una decisión, no un dato perdido.
    expect(pedimentosDe({ pedimento: 'viejo', pedimentos: [] })).toEqual([]);
  });

  it('sin aduana, sin pedimentos', () => {
    expect(pedimentosDe(undefined)).toEqual([]);
    expect(pedimentosDe(null)).toEqual([]);
    expect(pedimentosDe({})).toEqual([]);
  });

  it('nunca devuelve cadenas vacías ni espacios', () => {
    expect(pedimentosDe({ pedimento: '   ' })).toEqual([]);
    expect(pedimentosDe({ pedimentos: ['A', '', '  ', 'B'] })).toEqual(['A', 'B']);
  });
});

describe('renglones del formulario', () => {
  it('siempre al menos dos', () => {
    expect(renglonesPedimento({})).toEqual(['', '']);
    expect(renglonesPedimento({ pedimento: 'A' })).toEqual(['A', '']);
  });

  it('con más de dos, los enseña todos', () => {
    expect(renglonesPedimento({ pedimentos: ['A', 'B', 'C'] })).toEqual(['A', 'B', 'C']);
  });
});

describe('guardar', () => {
  it('escribe el arreglo y el singular con el primero', () => {
    const r = guardarPedimentos({ aes: true, pedimento: 'viejo' }, ['A', 'B']);
    expect(r.pedimentos).toEqual(['A', 'B']);
    expect(r.pedimento).toBe('A');
    expect(r.aes).toBe(true);
  });

  it('tira los vacíos que dejó el formulario', () => {
    expect(guardarPedimentos({}, ['A', '', '  ']).pedimentos).toEqual(['A']);
  });

  it('borrarlos todos deja el singular vacío, no el anterior', () => {
    const r = guardarPedimentos({ pedimento: 'viejo' }, ['', '']);
    expect(r.pedimentos).toEqual([]);
    expect(r.pedimento).toBe('');
  });

  it('no muta la aduana que recibe', () => {
    const original = { pedimento: 'A', pedimentos: ['A'] };
    guardarPedimentos(original, ['B']);
    expect(original.pedimentos).toEqual(['A']);
  });
});

describe('campos de solo exportación', () => {
  it('se enseñan en expo', () => {
    expect(aplicaSoloExportacion('expo')).toBe(true);
  });
  it('no en impo', () => {
    expect(aplicaSoloExportacion('impo')).toBe(false);
  });
  it('ni cuando el tráfico no se pudo determinar', () => {
    // De los dos errores posibles, esconder de más se nota al capturar;
    // enseñar de más se cuela al cliente en un booking confirmation.
    expect(aplicaSoloExportacion(null)).toBe(false);
    expect(aplicaSoloExportacion(undefined)).toBe(false);
  });
});
