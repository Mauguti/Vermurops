import { describe, it, expect } from 'vitest';
import { texto, normalizarTexto, contiene, compararTexto, antesDeLaComa } from './texto';

describe('texto', () => {
  it('ausente o nulo → cadena vacía; números → string', () => {
    expect(texto(undefined)).toBe('');
    expect(texto(null)).toBe('');
    expect(texto('hola')).toBe('hola');
    expect(texto(42)).toBe('42');
  });
});

describe('normalizarTexto / contiene', () => {
  it('ignora mayúsculas y acentos y no truena con ausentes', () => {
    expect(normalizarTexto(' Plásticos ')).toBe('plasticos');
    expect(contiene('Plásticos Ramírez', 'plasticos')).toBe(true);
    expect(contiene(undefined, 'x')).toBe(false);
    expect(contiene(null, '')).toBe(true);
  });

  it('encuentra nombres mexicanos con y sin acentos', () => {
    // Tarea 46: estos casos antes fallaban con .toLowerCase().includes()
    expect(contiene('García Hernández', 'garcia')).toBe(true);
    expect(contiene('Álvarez López', 'alvarez')).toBe(true);
    expect(contiene('Pérez Muñoz', 'perez')).toBe(true);
    expect(contiene('Pérez Muñoz', 'munoz')).toBe(true);
    // Y al revés: buscar con acento en dato sin acento
    expect(contiene('Alvarez Lopez', 'Álvarez')).toBe(true);
    // RFC y folios (sin acento, pero verificamos que no truena)
    expect(contiene('XAXX010101000', 'XAXX')).toBe(true);
    expect(contiene('COT-2026-0003', '0003')).toBe(true);
  });
});

describe('compararTexto', () => {
  it('ordena en español y manda los ausentes al final sin tronar', () => {
    const lista = [{ n: 'Zapata' }, { n: undefined }, { n: 'Álvarez' }, { n: null }, { n: 'ávila' }];
    const orden = [...lista].sort((a, b) => compararTexto(a.n, b.n)).map(x => x.n);
    expect(orden.slice(0, 3)).toEqual(['Álvarez', 'ávila', 'Zapata']);
    expect(orden.slice(3)).toEqual([undefined, null]);
  });
});

describe('antesDeLaComa', () => {
  it('recorta la ruta y tolera ausentes', () => {
    expect(antesDeLaComa('Shanghai, CHN')).toBe('Shanghai');
    expect(antesDeLaComa('Manzanillo')).toBe('Manzanillo');
    expect(antesDeLaComa(undefined)).toBe('');
  });
});
