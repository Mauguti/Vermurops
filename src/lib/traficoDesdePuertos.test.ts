/**
 * Lo que protege: del tráfico salen el prefijo del folio (VLIM/VLEM) y el
 * IVA (§4.2). Derivarlo mal imprime un folio equivocado en documentos.
 */
import { describe, it, expect } from 'vitest';
import { traficoDesdePuertos } from './traficoDesdePuertos';

const MX = { codigoPais: 'MEX' };
const CN = { codigoPais: 'CHN' };
const US = { codigoPais: 'USA' };

describe('traficoDesdePuertos', () => {
  it('destino en México es importación', () =>
    expect(traficoDesdePuertos(CN, MX)).toBe('importacion'));
  it('origen en México es exportación', () =>
    expect(traficoDesdePuertos(MX, US)).toBe('exportacion'));
  it('los dos en México: nacional, NO se adivina', () =>
    expect(traficoDesdePuertos(MX, MX)).toBeNull());
  it('ninguno en México: cross-trade, NO se adivina', () =>
    expect(traficoDesdePuertos(CN, US)).toBeNull());
  it('falta un puerto: no se deriva', () => {
    expect(traficoDesdePuertos(null, MX)).toBeNull();
    expect(traficoDesdePuertos(CN, null)).toBeNull();
  });
  it('el código de país se compara sin caso ni espacios', () =>
    expect(traficoDesdePuertos(CN, { codigoPais: ' mex ' })).toBe('importacion'));
});
