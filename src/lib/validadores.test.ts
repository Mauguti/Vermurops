/**
 * validadores.test.ts
 *
 * Tests de los validadores de formato RFC y CLABE (lógica pura). E7.
 *
 * Anclas externas (valores válidos verificables independientemente):
 *   - RFC física  : GODE561231GR8  (ejemplo canónico de la doc del SAT)
 *   - RFC moral   : WMX9707244T2   (estructura moral + dígito verificador correcto)
 *   - CLABE       : 646180157000000004 (STP, ejemplo de la doc de Banxico)
 *
 * Ejecutar: npx vitest run
 */

import { describe, it, expect } from 'vitest';
import { validarRFC, validarCLABE, bancoDeCLABE, BANCOS_CLABE } from './validadores';

// ════════════════════════════════════════════════════════════════════════════
describe('validarRFC', () => {
  // ── Casos válidos ──────────────────────────────────────────────────────────
  it('acepta un RFC de persona física con dígito verificador correcto', () => {
    expect(validarRFC('GODE561231GR8')).toEqual({ valido: true, error: '' });
  });

  it('acepta un RFC de persona moral con dígito verificador correcto', () => {
    expect(validarRFC('WMX9707244T2')).toEqual({ valido: true, error: '' });
  });

  it('normaliza minúsculas y espacios antes de validar', () => {
    expect(validarRFC('  gode561231gr8  ').valido).toBe(true);
  });

  it('acepta RFC moral con & en el nombre (formato permitido)', () => {
    // Estructura moral con & — solo verificamos que el formato no lo rechace
    // por el carácter; el dígito se calcula igual.
    const r = validarRFC('GOD&561231GR8');
    // El dígito verificador cambiará respecto a GODE..., así que esto NO debe
    // ser válido salvo que coincida; aquí basta confirmar que NO falla por
    // "formato" sino por dígito si no coincide.
    expect(r.error).not.toBe('El formato del RFC no es válido.');
  });

  // ── Casos inválidos ────────────────────────────────────────────────────────
  it('rechaza vacío', () => {
    const r = validarRFC('');
    expect(r.valido).toBe(false);
    expect(r.error).toMatch(/obligatorio/i);
  });

  it('rechaza longitud incorrecta (ni 12 ni 13)', () => {
    expect(validarRFC('ABC123').valido).toBe(false);
    expect(validarRFC('GODE561231GR8X').valido).toBe(false);
  });

  it('rechaza estructura inválida (letras donde van dígitos)', () => {
    const r = validarRFC('GODEXX1231GR8');
    expect(r.valido).toBe(false);
    expect(r.error).toMatch(/formato/i);
  });

  it('rechaza fecha inválida embebida (mes 13)', () => {
    const r = validarRFC('GODE561331GR8');
    expect(r.valido).toBe(false);
    expect(r.error).toMatch(/fecha/i);
  });

  it('rechaza dígito verificador incorrecto', () => {
    const r = validarRFC('GODE561231GR9');
    expect(r.valido).toBe(false);
    expect(r.error).toMatch(/verificador/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('validarCLABE', () => {
  // ── Casos válidos ──────────────────────────────────────────────────────────
  it('acepta una CLABE válida (STP, código 646)', () => {
    expect(validarCLABE('646180157000000004')).toEqual({ valido: true, error: '' });
  });

  it('recorta espacios antes de validar', () => {
    expect(validarCLABE('  646180157000000004  ').valido).toBe(true);
  });

  // ── Casos inválidos ────────────────────────────────────────────────────────
  it('rechaza vacío', () => {
    const r = validarCLABE('');
    expect(r.valido).toBe(false);
    expect(r.error).toMatch(/obligatoria/i);
  });

  it('rechaza longitud distinta de 18', () => {
    expect(validarCLABE('12345').valido).toBe(false);
    expect(validarCLABE('6461801570000000049').valido).toBe(false);
  });

  it('rechaza si contiene caracteres no numéricos', () => {
    const r = validarCLABE('64618015700000000A');
    expect(r.valido).toBe(false);
    expect(r.error).toMatch(/18 dígitos/i);
  });

  it('rechaza código de banco inexistente', () => {
    const r = validarCLABE('999180157000000004');
    expect(r.valido).toBe(false);
    expect(r.error).toMatch(/banco/i);
  });

  it('rechaza dígito de control incorrecto', () => {
    const r = validarCLABE('646180157000000005');
    expect(r.valido).toBe(false);
    expect(r.error).toMatch(/control/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('bancoDeCLABE', () => {
  it('devuelve el nombre del banco para un código conocido', () => {
    expect(bancoDeCLABE('646180157000000004')).toBe('STP');
    expect(bancoDeCLABE('012180012345678900')).toBe('BBVA MÉXICO');
  });

  it('devuelve cadena vacía para un código desconocido', () => {
    expect(bancoDeCLABE('999180157000000004')).toBe('');
  });

  it('devuelve cadena vacía para entrada inválida', () => {
    expect(bancoDeCLABE('')).toBe('');
    expect(bancoDeCLABE('ab')).toBe('');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('BANCOS_CLABE (catálogo)', () => {
  it('incluye los bancos principales del catálogo estándar', () => {
    expect(BANCOS_CLABE['002']).toBe('BANAMEX');
    expect(BANCOS_CLABE['012']).toBe('BBVA MÉXICO');
    expect(BANCOS_CLABE['014']).toBe('SANTANDER');
    expect(BANCOS_CLABE['072']).toBe('BANORTE');
  });
});
