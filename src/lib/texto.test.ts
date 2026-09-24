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
