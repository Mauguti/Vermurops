/**
 * tarifaMatching.test.ts — Tests para funciones de matching de conceptos (CC-1)
 *
 * Cubre:
 * - matchConceptByName (existente — regresión)
 * - matchConcept (nuevo — ID primero, fallback a nombre)
 * - buildConceptoMap (nuevo — Map O(1))
 */

import { describe, it, expect } from 'vitest';
import {
  matchConceptByName,
  matchConcept,
  buildConceptoMap,
  normalize,
  type ConceptoMatch,
} from '../components/tarifas/tarifaMatching';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const conceptos: ConceptoMatch[] = [
  { id: 'CON-001', nombre: 'Flete Marítimo', categoria: 'flete' },
  { id: 'CON-002', nombre: 'Maniobras Portuarias', categoria: 'maniobras' },
  { id: 'CON-003', nombre: 'Despacho Aduanal', categoria: 'despacho' },
  { id: 'CON-004', nombre: 'Seguro de Carga', categoria: 'seguro' },
  { id: 'CON-005', nombre: 'Almacenaje', categoria: 'almacenaje' },
  { id: 'CON-010', nombre: 'Flete Terrestre', categoria: 'transporte' },
];

const conceptoMap = buildConceptoMap(conceptos);

// ─── normalize ─────────────────────────────────────────────────────────────────

describe('normalize', () => {
  it('minúsculas y sin diacríticos', () => {
    expect(normalize('Flete Marítimo')).toBe('flete maritimo');
  });

  it('trim espacios', () => {
    expect(normalize('  Despacho  ')).toBe('despacho');
  });

  it('string vacío', () => {
    expect(normalize('')).toBe('');
  });
});

// ─── matchConceptByName (regresión) ────────────────────────────────────────────

describe('matchConceptByName', () => {
  it('match exacto por nombre', () => {
    const result = matchConceptByName('Flete Marítimo', conceptos);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('CON-001');
  });

  it('match exacto ignora case y diacríticos', () => {
    const result = matchConceptByName('flete maritimo', conceptos);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('CON-001');
  });

  it('match parcial — nombre del catálogo incluye query', () => {
    const result = matchConceptByName('Maniobras', conceptos);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('CON-002');
  });

  it('match parcial — query incluye nombre del catálogo', () => {
    const result = matchConceptByName('Flete Marítimo Internacional Premium', conceptos);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('CON-001');
  });

  it('sin match devuelve null', () => {
    expect(matchConceptByName('Concepto Inexistente XYZ', conceptos)).toBeNull();
  });

  it('string vacío devuelve null', () => {
    expect(matchConceptByName('', conceptos)).toBeNull();
  });

  it('nombre "Nuevo Concepto" no matchea nada', () => {
    expect(matchConceptByName('Nuevo Concepto', conceptos)).toBeNull();
  });
});

// ─── buildConceptoMap ──────────────────────────────────────────────────────────

describe('buildConceptoMap', () => {
  it('construye Map con todos los conceptos', () => {
    expect(conceptoMap.size).toBe(conceptos.length);
  });

  it('búsqueda O(1) por ID', () => {
    const result = conceptoMap.get('CON-003');
    expect(result).not.toBeUndefined();
    expect(result!.nombre).toBe('Despacho Aduanal');
  });

  it('ID inexistente devuelve undefined', () => {
    expect(conceptoMap.get('CON-999')).toBeUndefined();
  });

  it('Map vacío para lista vacía', () => {
    const emptyMap = buildConceptoMap([]);
    expect(emptyMap.size).toBe(0);
  });
});

// ─── matchConcept (nuevo — CC-1) ──────────────────────────────────────────────

describe('matchConcept', () => {
  it('match por conceptoId con Map → method "id"', () => {
    const { match, method } = matchConcept('CON-004', 'Seguro de Carga', conceptos, conceptoMap);
    expect(match).not.toBeNull();
    expect(match!.id).toBe('CON-004');
    expect(method).toBe('id');
  });

  it('match por conceptoId sin Map (scan lineal) → method "id"', () => {
    const { match, method } = matchConcept('CON-005', 'Almacenaje', conceptos);
    expect(match).not.toBeNull();
    expect(match!.id).toBe('CON-005');
    expect(method).toBe('id');
  });

  it('conceptoId tiene prioridad sobre nombre', () => {
    // conceptoId apunta a CON-001 (Flete Marítimo), nombre dice "Despacho Aduanal"
    const { match, method } = matchConcept('CON-001', 'Despacho Aduanal', conceptos, conceptoMap);
    expect(match!.id).toBe('CON-001');
    expect(match!.nombre).toBe('Flete Marítimo');
    expect(method).toBe('id');
  });

  it('fallback a nombre cuando conceptoId es undefined → method "nombre"', () => {
    const { match, method } = matchConcept(undefined, 'Almacenaje', conceptos, conceptoMap);
    expect(match).not.toBeNull();
    expect(match!.id).toBe('CON-005');
    expect(method).toBe('nombre');
  });

  it('fallback a nombre cuando conceptoId no existe en catálogo → method "nombre"', () => {
    const { match, method } = matchConcept('CON-999', 'Flete Terrestre', conceptos, conceptoMap);
    expect(match).not.toBeNull();
    expect(match!.id).toBe('CON-010');
    expect(method).toBe('nombre');
  });

  it('sin match por ID ni nombre → method null', () => {
    const { match, method } = matchConcept('CON-999', 'Concepto Fantasma', conceptos, conceptoMap);
    expect(match).toBeNull();
    expect(method).toBeNull();
  });

  it('conceptoId undefined + nombre vacío → null', () => {
    const { match, method } = matchConcept(undefined, '', conceptos, conceptoMap);
    expect(match).toBeNull();
    expect(method).toBeNull();
  });

  it('backward compat: concepto legacy sin ID matchea por nombre parcial', () => {
    const { match, method } = matchConcept(undefined, 'Maniobras', conceptos, conceptoMap);
    expect(match).not.toBeNull();
    expect(match!.id).toBe('CON-002');
    expect(method).toBe('nombre');
  });

  it('conceptoId vacío string se trata como sin ID', () => {
    const { match, method } = matchConcept('', 'Seguro de Carga', conceptos, conceptoMap);
    expect(match).not.toBeNull();
    expect(match!.id).toBe('CON-004');
    expect(method).toBe('nombre');
  });
});
