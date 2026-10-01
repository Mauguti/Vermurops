import { describe, it, expect } from 'vitest';
import {
  aduanaSugerida,
  precargarAduanas,
  esAduanaPrecargada,
  type PuertoParaAduana,
} from './aduanaDesdePuerto';

// ── Puertos de prueba ─────────────────────────────────────────────────────────

const MANZANILLO: PuertoParaAduana = { id: 'PTO-001', nombre: 'Manzanillo', codigoPais: 'MEX' };
const LAZARO: PuertoParaAduana = { id: 'PTO-002', nombre: 'Lázaro Cárdenas', codigoPais: 'MEX' };
const VERACRUZ: PuertoParaAduana = { id: 'PTO-003', nombre: 'Veracruz', codigoPais: 'MEX' };
const SHANGHAI: PuertoParaAduana = { id: 'PTO-006', nombre: 'Shanghai', codigoPais: 'CHN' };
const LONG_BEACH: PuertoParaAduana = { id: 'PTO-014', nombre: 'Long Beach', codigoPais: 'USA' };

const PUERTOS = [MANZANILLO, LAZARO, VERACRUZ, SHANGHAI, LONG_BEACH];

// ── aduanaSugerida ────────────────────────────────────────────────────────────

describe('aduanaSugerida', () => {
  it('importación: sugiere aduanaRecepcion con el puerto destino mexicano', () => {
    const r = aduanaSugerida(PUERTOS, SHANGHAI.id, LAZARO.id);
    expect(r.aduanaRecepcion).toBe('Lázaro Cárdenas');
    expect(r.aduanaSalida).toBeNull();
  });

  it('exportación: sugiere aduanaSalida con el puerto origen mexicano', () => {
    const r = aduanaSugerida(PUERTOS, MANZANILLO.id, LONG_BEACH.id);
    expect(r.aduanaSalida).toBe('Manzanillo');
    expect(r.aduanaRecepcion).toBeNull();
  });

  it('Lázaro Cárdenas como destino de importación', () => {
    const r = aduanaSugerida(PUERTOS, SHANGHAI.id, LAZARO.id);
    expect(r.aduanaRecepcion).toBe('Lázaro Cárdenas');
  });

  it('Manzanillo como destino de importación', () => {
    const r = aduanaSugerida(PUERTOS, SHANGHAI.id, MANZANILLO.id);
    expect(r.aduanaRecepcion).toBe('Manzanillo');
  });

  it('exportación desde Veracruz', () => {
    const r = aduanaSugerida(PUERTOS, VERACRUZ.id, LONG_BEACH.id);
    expect(r.aduanaSalida).toBe('Veracruz');
    expect(r.aduanaRecepcion).toBeNull();
  });

  it('nacional: sugiere ambas aduanas', () => {
    const r = aduanaSugerida(PUERTOS, MANZANILLO.id, VERACRUZ.id);
    expect(r.aduanaSalida).toBe('Manzanillo');
    expect(r.aduanaRecepcion).toBe('Veracruz');
  });

  it('cross-trade: no sugiere nada', () => {
    const r = aduanaSugerida(PUERTOS, SHANGHAI.id, LONG_BEACH.id);
    expect(r.aduanaSalida).toBeNull();
    expect(r.aduanaRecepcion).toBeNull();
  });

  it('sin puertos seleccionados: no sugiere nada', () => {
    const r = aduanaSugerida(PUERTOS, null, null);
    expect(r.aduanaSalida).toBeNull();
    expect(r.aduanaRecepcion).toBeNull();
  });

  it('puerto no encontrado: no sugiere', () => {
    const r = aduanaSugerida(PUERTOS, 'PTO-999', MANZANILLO.id);
    expect(r.aduanaSalida).toBeNull();
    expect(r.aduanaRecepcion).toBe('Manzanillo');
  });
});

// ── precargarAduanas ──────────────────────────────────────────────────────────

describe('precargarAduanas', () => {
  it('precarga aduanaRecepcion cuando está vacía y el destino es mexicano', () => {
    const patch = precargarAduanas(PUERTOS, SHANGHAI.id, LAZARO.id, '', '');
    expect(patch.aduanaRecepcion).toBe('Lázaro Cárdenas');
    expect(patch.aduanaSalida).toBeUndefined();
  });

  it('precarga aduanaSalida cuando está vacía y el origen es mexicano', () => {
    const patch = precargarAduanas(PUERTOS, MANZANILLO.id, LONG_BEACH.id, '', '');
    expect(patch.aduanaSalida).toBe('Manzanillo');
    expect(patch.aduanaRecepcion).toBeUndefined();
  });

  it('NO pisa la aduana si ya tiene valor', () => {
    const patch = precargarAduanas(
      PUERTOS, SHANGHAI.id, LAZARO.id,
      '', 'Aduana Interior de Pantaco',
    );
    expect(patch.aduanaRecepcion).toBeUndefined();
  });

  it('NO pisa la aduana de salida si ya tiene valor', () => {
    const patch = precargarAduanas(
      PUERTOS, MANZANILLO.id, LONG_BEACH.id,
      'Aduana especial', '',
    );
    expect(patch.aduanaSalida).toBeUndefined();
  });

  it('trata undefined como vacío', () => {
    const patch = precargarAduanas(PUERTOS, SHANGHAI.id, MANZANILLO.id, undefined, undefined);
    expect(patch.aduanaRecepcion).toBe('Manzanillo');
  });

  it('trata espacios como vacío', () => {
    const patch = precargarAduanas(PUERTOS, SHANGHAI.id, MANZANILLO.id, '  ', '  ');
    expect(patch.aduanaRecepcion).toBe('Manzanillo');
  });

  it('devuelve objeto vacío si no hay nada que precargar', () => {
    const patch = precargarAduanas(PUERTOS, SHANGHAI.id, LONG_BEACH.id, '', '');
    expect(Object.keys(patch)).toHaveLength(0);
  });
});

// ── esAduanaPrecargada ────────────────────────────────────────────────────────

describe('esAduanaPrecargada', () => {
  it('es precargada si coincide con el nombre del puerto mexicano', () => {
    expect(esAduanaPrecargada(PUERTOS, LAZARO.id, 'Lázaro Cárdenas')).toBe(true);
  });

  it('no es precargada si el usuario editó el campo', () => {
    expect(esAduanaPrecargada(PUERTOS, LAZARO.id, 'Aduana Interior de Pantaco')).toBe(false);
  });

  it('no es precargada si el puerto no es mexicano', () => {
    expect(esAduanaPrecargada(PUERTOS, SHANGHAI.id, 'Shanghai')).toBe(false);
  });

  it('no es precargada si el campo está vacío', () => {
    expect(esAduanaPrecargada(PUERTOS, LAZARO.id, '')).toBe(false);
  });

  it('no es precargada sin puerto', () => {
    expect(esAduanaPrecargada(PUERTOS, null, 'Manzanillo')).toBe(false);
  });
});
