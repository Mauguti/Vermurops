import { describe, it, expect } from 'vitest';
import { anioMexico, claveAnio, escrituraDelAnio, ultimoDelAnio } from './consecutivoPorAnio';

describe('anioMexico', () => {
  it('31-dic 23:30 en México sigue siendo ese año aunque en UTC ya sea enero', () => {
    expect(anioMexico(new Date('2027-01-01T05:30:00Z'))).toBe(2026);
  });
  it('1-ene 00:30 en México ya es el año nuevo', () => {
    expect(anioMexico(new Date('2027-01-01T06:30:00Z'))).toBe(2027);
  });
});

describe('ultimoDelAnio', () => {
  it('el mapa manda sobre `ultimo`', () => {
    expect(ultimoDelAnio({ ultimo: 5, ultimoPorAnio: { '26': 9 } }, 2026)).toBe(9);
  });
  it('sin mapa, 2026 lee `ultimo`', () => {
    expect(ultimoDelAnio({ ultimo: 201 }, 2026)).toBe(201);
  });
  it('sin mapa, otro año es 0', () => {
    expect(ultimoDelAnio({ ultimo: 201 }, 2027)).toBe(0);
  });
  it('documento ausente es 0', () => {
    expect(ultimoDelAnio(undefined, 2026)).toBe(0);
  });
  it('valores basura se ignoran', () => {
    expect(ultimoDelAnio({ ultimo: 'x', ultimoPorAnio: { '26': -1, '27': 1.5 } }, 2026)).toBe(0);
    expect(ultimoDelAnio({ ultimoPorAnio: 'hola' }, 2027)).toBe(0);
  });
});

describe('escrituraDelAnio', () => {
  it('2026 escribe también `ultimo`', () => {
    expect(escrituraDelAnio({ ultimo: 3 }, 2026, 4)).toEqual({ ultimoPorAnio: { '26': 4 }, ultimo: 4 });
  });
  it('2027 no toca `ultimo` y conserva los otros años', () => {
    expect(escrituraDelAnio({ ultimoPorAnio: { '26': 320 } }, 2027, 1))
      .toEqual({ ultimoPorAnio: { '26': 320, '27': 1 } });
  });
  it('claveAnio', () => { expect(claveAnio(2027)).toBe('27'); });
});
