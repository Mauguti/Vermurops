import { describe, it, expect } from 'vitest';
import { cambioDeLista } from './cambioDeLista';

const a = { id: 'a', v: 1 }, b = { id: 'b', v: 1 };

describe('cambioDeLista', () => {
  it('una cotización nueva es alta', () => {
    expect(cambioDeLista([a], [{ id: 'n', v: 0 }, a])).toEqual({ tipo: 'alta', quote: { id: 'n', v: 0 } });
  });
  it('escribe la que dice anterior, no la primera con otra referencia', () => {
    const a2 = { ...a }, b2 = { ...b, v: 2 };
    const r = cambioDeLista([a, b], [a2, b2], b);
    expect(r).toEqual({ tipo: 'cambio', quote: b2, anterior: b });
  });
  it('sin anterior y sin alta no adivina', () => {
    expect(cambioDeLista([a, b], [{ ...a }, b])).toEqual({ tipo: 'sin_anterior' });
  });
  it('la misma referencia no es cambio', () => {
    expect(cambioDeLista([a], [a], a)).toEqual({ tipo: 'nada' });
  });
});
