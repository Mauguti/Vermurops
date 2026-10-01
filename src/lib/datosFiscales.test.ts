import { describe, it, expect } from 'vitest';
import {
  estadoFiscal, faltantesFiscales, validarCodigoPostal,
  esRFCExtranjero, REGIMENES_FISCALES, MAPA_REGIMENES,
} from './datosFiscales';

// ── Fixtures ────────────────────────────────────────────────────────────────

const completo = {
  nombre: 'Importaciones y Logística Vermur, S. de R.L. de C.V.',
  rfc: 'ILV190723FN1',
  codigoPostal: '76230',
  regimenFiscal: '601',
};

const sinRFC = { ...completo, rfc: undefined };
const sinCP = { ...completo, codigoPostal: undefined };
const sinRegimen = { ...completo, regimenFiscal: undefined };
const sinNada = { nombre: '', rfc: undefined, codigoPostal: undefined, regimenFiscal: undefined };

const extranjero = {
  nombre: 'Foreign Corp',
  rfc: 'XEXX010101000',
  codigoPostal: undefined,
  regimenFiscal: undefined,
};

// Cliente viejo de Magaya: tiene nombre y nada más
const legacyMagaya = {
  nombre: 'MULLER TECHNOPLASTICS DE MÉXICO',
  rfc: undefined,
  codigoPostal: undefined,
  regimenFiscal: undefined,
};

// ── estadoFiscal ────────────────────────────────────────────────────────────

describe('estadoFiscal', () => {
  it('completo con RFC, CP y régimen', () => {
    expect(estadoFiscal(completo)).toBe('completo');
  });

  it('incompleto sin RFC', () => {
    expect(estadoFiscal(sinRFC)).toBe('incompleto');
  });

  it('incompleto sin código postal', () => {
    expect(estadoFiscal(sinCP)).toBe('incompleto');
  });

  it('incompleto sin régimen fiscal', () => {
    expect(estadoFiscal(sinRegimen)).toBe('incompleto');
  });

  it('incompleto sin nada', () => {
    expect(estadoFiscal(sinNada)).toBe('incompleto');
  });

  it('extranjero con XEXX010101000 cuenta como completo sin CP ni régimen', () => {
    expect(estadoFiscal(extranjero)).toBe('completo');
  });

  it('extranjero en minúsculas también funciona', () => {
    expect(estadoFiscal({ ...extranjero, rfc: 'xexx010101000' })).toBe('completo');
  });

  it('cliente legacy de Magaya sin datos fiscales: incompleto', () => {
    expect(estadoFiscal(legacyMagaya)).toBe('incompleto');
  });

  it('RFC vacío cuenta como sin RFC', () => {
    expect(estadoFiscal({ ...completo, rfc: '' })).toBe('incompleto');
    expect(estadoFiscal({ ...completo, rfc: '  ' })).toBe('incompleto');
  });

  it('null en los campos opcionales no truena', () => {
    expect(estadoFiscal({ nombre: 'X', rfc: null, codigoPostal: null, regimenFiscal: null })).toBe('incompleto');
  });
});

// ── faltantesFiscales ───────────────────────────────────────────────────────

describe('faltantesFiscales', () => {
  it('devuelve lista vacía si todo está completo', () => {
    expect(faltantesFiscales(completo)).toEqual([]);
  });

  it('lista lo que falta', () => {
    expect(faltantesFiscales(sinRFC)).toContain('RFC');
    expect(faltantesFiscales(sinCP)).toContain('Código postal');
    expect(faltantesFiscales(sinRegimen)).toContain('Régimen fiscal');
  });

  it('sin nada: falta todo menos razón social si la hay', () => {
    const f = faltantesFiscales({ ...sinNada, nombre: 'X' });
    expect(f).toContain('RFC');
    expect(f).toContain('Código postal');
    expect(f).toContain('Régimen fiscal');
    expect(f).not.toContain('Razón social');
  });

  it('extranjero: no pide CP ni régimen', () => {
    expect(faltantesFiscales(extranjero)).toEqual([]);
  });
});

// ── validarCodigoPostal ─────────────────────────────────────────────────────

describe('validarCodigoPostal', () => {
  it('5 dígitos válido', () => {
    expect(validarCodigoPostal('76230')).toBe('');
    expect(validarCodigoPostal('01000')).toBe('');
  });

  it('vacío no da error (no es obligatorio aquí)', () => {
    expect(validarCodigoPostal('')).toBe('');
  });

  it('letras, 4 dígitos, 6 dígitos: error', () => {
    expect(validarCodigoPostal('ABCDE')).not.toBe('');
    expect(validarCodigoPostal('1234')).not.toBe('');
    expect(validarCodigoPostal('123456')).not.toBe('');
  });
});

// ── esRFCExtranjero ─────────────────────────────────────────────────────────

describe('esRFCExtranjero', () => {
  it('XEXX010101000 es extranjero', () => {
    expect(esRFCExtranjero('XEXX010101000')).toBe(true);
  });
  it('case insensitive', () => {
    expect(esRFCExtranjero('xexx010101000')).toBe(true);
  });
  it('null/undefined/vacío no es extranjero', () => {
    expect(esRFCExtranjero(null)).toBe(false);
    expect(esRFCExtranjero(undefined)).toBe(false);
    expect(esRFCExtranjero('')).toBe(false);
  });
  it('otro RFC no es extranjero', () => {
    expect(esRFCExtranjero('ILV190723FN1')).toBe(false);
  });
});

// ── Catálogo ────────────────────────────────────────────────────────────────

describe('catálogo c_RegimenFiscal', () => {
  it('tiene al menos 15 regímenes', () => {
    expect(REGIMENES_FISCALES.length).toBeGreaterThanOrEqual(15);
  });

  it('todas las claves son de 3 dígitos', () => {
    for (const r of REGIMENES_FISCALES) {
      expect(r.clave).toMatch(/^\d{3}$/);
    }
  });

  it('el mapa tiene las mismas claves', () => {
    for (const r of REGIMENES_FISCALES) {
      expect(MAPA_REGIMENES[r.clave]).toBe(r.descripcion);
    }
  });

  it('601 es General de Ley Personas Morales', () => {
    expect(MAPA_REGIMENES['601']).toBe('General de Ley Personas Morales');
  });

  it('626 es Régimen Simplificado de Confianza', () => {
    expect(MAPA_REGIMENES['626']).toBe('Régimen Simplificado de Confianza');
  });
});

// ── Respaldo de dias ────────────────────────────────────────────────────────

describe('cliente viejo sin campos nuevos abre sin perder nada', () => {
  it('estadoFiscal funciona con un cliente que no tiene regimenFiscal ni codigoPostal', () => {
    // Simula un documento de Firestore sin los campos nuevos
    const clienteViejo = { nombre: 'Acme', dias: 30, statusOperativo: 'ACTIVO' as const } as any;
    expect(estadoFiscal(clienteViejo)).toBe('incompleto');
    expect(faltantesFiscales(clienteViejo)).toContain('RFC');
  });

  it('estadoFiscal no truena con campos undefined', () => {
    expect(() => estadoFiscal({
      nombre: 'X',
      rfc: undefined,
      codigoPostal: undefined,
      regimenFiscal: undefined,
    })).not.toThrow();
  });
});
