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
  normMatch,
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

// ─── normMatch ──────────────────────────────────────────────────────────────

describe('normMatch', () => {
  it('limpia guiones y puntos', () => {
    expect(normMatch('AMS-AT-DESTINATION')).toBe('ams at destination');
  });

  it('colapsa espacios dobles', () => {
    expect(normMatch('Flete   Marítimo')).toBe('flete maritimo');
  });

  it('limpia paréntesis y barras', () => {
    expect(normMatch('Warehouse (In/Out)')).toBe('warehouse in out');
  });
});

// ─── Tarea 16 · Conceptos sin catálogo desde comparativa/bandeja ────────────

describe('matchConceptByName — nombreOriginal (alias de Magaya)', () => {
  /*
   * Catálogo real: el concepto se llama "Ams" (nombre de la UI) pero en
   * Magaya era "AMS" (nombreOriginal). El proveedor escribe "AMS" y tiene
   * que empatar.
   */
  const conAlias: ConceptoMatch[] = [
    { id: 'CON-001', nombre: 'Ams', nombreOriginal: 'AMS', categoria: 'documentacion' },
    { id: 'CON-027', nombre: 'Ams At Destination', nombreOriginal: 'AMS AR DESTINATION', categoria: 'documentacion' },
    { id: 'CON-014', nombre: 'Revalidation Bl Fee', nombreOriginal: 'REVALIDATION BL FEE', categoria: 'documentacion' },
    { id: 'CON-006', nombre: 'Customs Clearance', nombreOriginal: 'CUSTOMS CLEARANCE', categoria: 'despacho' },
    { id: 'CON-012', nombre: 'Storage Fee', nombreOriginal: 'STORAGE FEE', categoria: 'almacenaje' },
    { id: 'CON-038', nombre: 'Courier Fee', nombreOriginal: 'COURIER FEE', categoria: 'otros' },
    { id: 'CON-039', nombre: 'Courrier Fee', nombreOriginal: 'COURRIER FEE', categoria: 'otros' },
    { id: 'CON-007', nombre: 'Customs Inspection', nombreOriginal: 'CUSTOMS INSPECTION', categoria: 'despacho' },
  ];

  it('matchea "AMS" por nombreOriginal', () => {
    const result = matchConceptByName('AMS', conAlias);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('CON-001');
  });

  it('matchea "ams" (minúsculas) por nombreOriginal', () => {
    const result = matchConceptByName('ams', conAlias);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('CON-001');
  });

  it('matchea "CUSTOMS CLEARANCE" (todo mayúsculas) por nombreOriginal', () => {
    const result = matchConceptByName('CUSTOMS CLEARANCE', conAlias);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('CON-006');
  });

  it('matchea "customs clearance" (todo minúsculas) por nombre normalizado', () => {
    const result = matchConceptByName('customs clearance', conAlias);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('CON-006');
  });

  it('matchea "REVALIDATION BL FEE" contra nombreOriginal', () => {
    const result = matchConceptByName('REVALIDATION BL FEE', conAlias);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('CON-014');
  });

  it('matchea "STORAGE FEE" contra nombreOriginal', () => {
    const result = matchConceptByName('STORAGE FEE', conAlias);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('CON-012');
  });

  it('nombre tiene prioridad sobre nombreOriginal', () => {
    // "Ams" es nombre de CON-001. Si alguien busca exacto "Ams", va al nombre.
    const result = matchConceptByName('Ams', conAlias);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('CON-001');
  });
});

describe('matchConceptByName — nombres con puntuación', () => {
  const conPuntuacion: ConceptoMatch[] = [
    { id: 'CON-A', nombre: 'Pat - Taxes', nombreOriginal: 'PAT - TAXES', categoria: 'despacho' },
    { id: 'CON-B', nombre: 'Bl Fee', nombreOriginal: 'BL FEE', categoria: 'documentacion' },
    { id: 'CON-C', nombre: 'Inland Freight Coordination', nombreOriginal: 'INLAND FREIGHT COORDINATION', categoria: 'transporte' },
  ];

  it('matchea "PAT-TAXES" (sin espacios alrededor del guión) contra "Pat - Taxes"', () => {
    const result = matchConceptByName('PAT-TAXES', conPuntuacion);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('CON-A');
  });

  it('matchea "PAT_TAXES" (guión bajo) contra "Pat - Taxes"', () => {
    const result = matchConceptByName('PAT_TAXES', conPuntuacion);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('CON-A');
  });

  it('"B/L FEE" (con barra) NO empata con "Bl Fee" (sin barra)', () => {
    // "B/L" → "b l" ≠ "bl". Es lo bastante distinto para no empatar
    // por normalización. El proveedor debe elegir del catálogo.
    const result = matchConceptByName('B/L FEE', conPuntuacion);
    expect(result).toBeNull();
  });

  it('"BL FEE" (sin barra) SÍ empata con "Bl Fee" por nombre normalizado', () => {
    const result = matchConceptByName('BL FEE', conPuntuacion);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('CON-B');
  });
});

describe('matchConceptByName — typos NO empatan', () => {
  const catalogo: ConceptoMatch[] = [
    { id: 'CON-THC', nombre: 'Terminal Handling Charge', nombreOriginal: 'TERMINAL HANDLING CHARGE', categoria: 'maniobras' },
    { id: 'CON-001', nombre: 'Ams', nombreOriginal: 'AMS', categoria: 'documentacion' },
    { id: 'CON-027', nombre: 'Ams At Destination', nombreOriginal: 'AMS AT DESTINATION', categoria: 'documentacion' },
  ];

  it('TERMINAI HANDLING CHARGE (typo) NO empata exacto', () => {
    // Typo real de proveedores. No debe empatar por parecido.
    const result = matchConceptByName('TERMINAI HANDLING CHARGE', catalogo);
    // Solo el partial includes podría empatarlo (y no debería: "terminai" ≠ "terminal")
    // Con exact, no empata. Con includes bidireccional la query no contiene el nombre
    // del catálogo y el nombre del catálogo no contiene la query, así que tampoco.
    expect(result).toBeNull();
  });

  it('"Ams" NO empata con "Ams At Destination" (son conceptos distintos)', () => {
    // "Ams" debe ir a CON-001, no a CON-027.
    const result = matchConceptByName('Ams', catalogo);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('CON-001');
  });
});
