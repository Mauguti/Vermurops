/**
 * vistaConceptos.test.ts
 *
 * B3. Lo que protegen: la tabla de IVA del catálogo se GENERA con calcularIVA.
 * Si alguien la escribiera a mano y divergiera de lo que la facturación
 * aplica, el catálogo enseñaría una tasa y la factura otra — y las dos se
 * verían correctas.
 */

import { describe, it, expect } from 'vitest';
import {
  derivarTablaIVA, resumenCatalogo, pendientesDeConcepto, impactoConcepto,
} from './vistaConceptos';
import type { ConceptoVermur } from '../components/conceptos/ConceptosData';
import type { KanbanQuote } from '../components/quotes/QuotesData';

function concepto(p: Partial<ConceptoVermur> & { id: string }): ConceptoVermur {
  return {
    idSemantico: p.id, nombre: p.id, nombreOriginal: p.id,
    categoria: 'flete', cuentaContable: '', reglaIVA: 'espejo', notaIVA: '',
    aplicaImpo: true, aplicaExpo: true, aplicaOrigen: true, aplicaDestino: true,
    tieneVenta: true, tieneCosto: true, monedaDefault: 'USD',
    claveProductoSAT: '78101800', claveUnidadSAT: 'E48',
    codigosMagaya: [], ivaEnMagaya: [], activo: true, notas: '',
    fechaAlta: '2026-01-01', updatedAt: '',
    ...p,
  } as ConceptoVermur;
}

// ─── A · La tabla derivada ───────────────────────────────────────────────────

describe('A · derivarTablaIVA', () => {
  it('espejo: grava lo que ocurre en México — la regla de §4.2 exacta', () => {
    const t = derivarTablaIVA('espejo');
    const por = Object.fromEntries(t.map(r => [r.combinacion, r.tasa]));
    expect(por['Importación + destino']).toBe(16);
    expect(por['Importación + origen']).toBe(0);
    expect(por['Exportación + origen']).toBe(16);
    expect(por['Exportación + destino']).toBe(0);
  });

  it('aéreo: el split 25/75 se enseña como dos líneas, no como 4%', () => {
    const t = derivarTablaIVA('aereo_split');
    t.forEach(r => expect(r.tasaTexto).toBe('25% al 16% + 75% al 0%'));
  });

  it('terrestre: la retención del 4% viaja en el texto', () => {
    const t = derivarTablaIVA('terrestre_retencion');
    t.forEach(r => expect(r.tasaTexto).toMatch(/retención 4%/));
  });

  it('revisar: NO inventa una tasa — dice que no se puede derivar', () => {
    const t = derivarTablaIVA('revisar');
    t.forEach(r => {
      expect(r.tasa).toBeNull();
      expect(r.tasaTexto).toMatch(/revisión/i);
    });
  });

  it('siempre son las cuatro combinaciones, en el orden de §4.2', () => {
    expect(derivarTablaIVA('fijo16').map(r => r.combinacion)).toEqual([
      'Importación + destino', 'Importación + origen',
      'Exportación + origen', 'Exportación + destino',
    ]);
  });
});

// ─── B · Los contadores ──────────────────────────────────────────────────────

describe('B · resumenCatalogo', () => {
  const CATALOGO = [
    concepto({ id: 'C1' }),
    concepto({ id: 'C2', reglaIVA: 'revisar' }),
    concepto({ id: 'C3', claveProductoSAT: null, categoria: 'seguro' }),
    concepto({ id: 'C4', activo: false, categoria: 'seguro' }),
  ];

  it('cuenta total, activos, revisar y sin claves SAT', () => {
    const r = resumenCatalogo(CATALOGO);
    expect(r.total).toBe(4);
    expect(r.activos).toBe(3);
    expect(r.enRevisar).toBe(1);
    expect(r.sinClavesSAT).toBe(1);
  });

  it('agrupa por categoría, la más numerosa primero', () => {
    const r = resumenCatalogo(CATALOGO);
    expect(r.porCategoria[0]).toEqual({ categoria: 'flete', cuantos: 2 });
  });

  it('una clave SAT de puros espacios cuenta como faltante', () => {
    const r = resumenCatalogo([concepto({ id: 'C1', claveUnidadSAT: '  ' })]);
    expect(r.sinClavesSAT).toBe(1);
  });
});

describe('B · pendientesDeConcepto', () => {
  it('marca la regla en revisar y las claves faltantes por separado', () => {
    expect(pendientesDeConcepto(concepto({ id: 'C', reglaIVA: 'revisar', claveProductoSAT: null })))
      .toEqual(['regla_iva', 'claves_sat']);
    expect(pendientesDeConcepto(concepto({ id: 'C' }))).toEqual([]);
  });
});

// ─── C · El impacto de cambiar la regla ──────────────────────────────────────

describe('C · impactoConcepto', () => {
  const quote = (id: string, etapa: string, conceptoId: string): KanbanQuote => ({
    id, etapa,
    servicios: [{
      id: 's1', tipo: 'maritimo',
      conceptos: [{ id: 'c1', nombre: 'x', conceptoId, costo: 0, profit: 0, venta: 0, margen: 0, subconceptos: [], tarifas: [], proveedoresOficialIds: [] }],
      cotizacionesProveedor: [],
    }],
  } as unknown as KanbanQuote);

  it('cuenta tarifas y cotizaciones que usan el concepto, y cuáles están vivas', () => {
    const r = impactoConcepto('CON-010',
      [{ conceptoId: 'CON-010' }, { conceptoId: 'CON-010' }, { conceptoId: 'CON-999' }],
      [quote('Q1', 'negociacion', 'CON-010'), quote('Q2', 'ganada', 'CON-010'), quote('Q3', 'negociacion', 'CON-999')],
    );
    expect(r.tarifas).toBe(2);
    expect(r.cotizaciones).toBe(2);
    expect(r.cotizacionesVivas).toBe(1);   // la ganada ya no está viva
  });

  it('también encuentra el uso por la ruta B (cotizacionesProveedor)', () => {
    const q = {
      id: 'Q4', etapa: 'consolidada',
      servicios: [{ id: 's1', tipo: 'maritimo', conceptos: [], cotizacionesProveedor: [{ id: 'cp1', conceptoId: 'CON-010', seleccionada: true }] }],
    } as unknown as KanbanQuote;
    expect(impactoConcepto('CON-010', [], [q]).cotizaciones).toBe(1);
  });

  it('sin usos, todo en cero', () => {
    expect(impactoConcepto('CON-000', [], [])).toEqual({ tarifas: 0, cotizaciones: 0, cotizacionesVivas: 0 });
  });
});
