import { describe, it, expect } from 'vitest';
import { planEscrituraEmbarque } from './diffEmbarque';

const base = {
  id: 'E1', folio: 'VLIM-26-001', updatedAt: '2026-10-15 10:00',
  cierres: { operativo: false, pago: false, administrativo: false },
  bitacora: [{ id: 'b1', texto: 'uno' }],
  eventos: [{ id: 'e1', titulo: 'Creado' }],
  documentos: [{ id: 'd1', nombre: 'BL' }],
  descripcionCarga: 'Textiles',
};

describe('planEscrituraEmbarque (tarea 123)', () => {
  it('sin cambios no escribe nada, ni updatedAt', () => {
    const r = planEscrituraEmbarque(base, base, { ...base, updatedAt: '2026-10-15 11:00' });
    expect(r).toEqual({ cambios: {}, borrar: [] });
  });

  it('escribe solo la clave tocada y el updatedAt; no pisa lo ajeno', () => {
    const servidor = { ...base, descripcionCarga: 'Ajena', folio: 'VLIM-26-001' };
    const r = planEscrituraEmbarque(servidor, base, { ...base, folio: 'VLIM-26-002', updatedAt: 'X' });
    expect(r.cambios).toEqual({ folio: 'VLIM-26-002', updatedAt: 'X' });
    expect(r.cambios).not.toHaveProperty('descripcionCarga');
  });

  it('bitácora, eventos y documentos se fusionan por id con lo que otra persona agregó', () => {
    const servidor = {
      ...base,
      bitacora: [...base.bitacora, { id: 'b-ajena', texto: 'ajena' }],
      documentos: [...base.documentos, { id: 'd-ajeno', nombre: 'Packing' }],
    };
    const nuevo = {
      ...base, updatedAt: 'X',
      bitacora: [...base.bitacora, { id: 'b2', texto: 'mía' }],
      documentos: [...base.documentos, { id: 'd2', nombre: 'Factura' }],
    };
    const r = planEscrituraEmbarque(servidor, base, nuevo);
    expect((r.cambios.bitacora as { id: string }[]).map(x => x.id)).toEqual(['b1', 'b-ajena', 'b2']);
    expect((r.cambios.documentos as { id: string }[]).map(x => x.id)).toEqual(['d1', 'd-ajeno', 'd2']);
    expect(r.cambios).not.toHaveProperty('eventos');
  });

  it('los cierres se escriben por subclave: dos cierres a la vez sobreviven', () => {
    const servidor = { ...base, cierres: { ...base.cierres, pago: true } };
    const r = planEscrituraEmbarque(servidor, base, { ...base, updatedAt: 'X', cierres: { ...base.cierres, operativo: true } });
    expect(r.cambios).toEqual({ 'cierres.operativo': true, updatedAt: 'X' });
  });

  it('un opcional que la edición vació se pide borrar', () => {
    const anterior = { ...base, etapaOperativa: 'cargado' };
    const r = planEscrituraEmbarque(anterior, anterior, { ...base, updatedAt: 'X' });
    expect(r.borrar).toEqual(['etapaOperativa']);
  });

  it('no muta ninguna de las tres copias', () => {
    const servidor = JSON.parse(JSON.stringify(base));
    const nuevo = { ...JSON.parse(JSON.stringify(base)), bitacora: [...base.bitacora, { id: 'b2' }], updatedAt: 'X' };
    const copia = JSON.stringify([servidor, base, nuevo]);
    planEscrituraEmbarque(servidor, base, nuevo);
    expect(JSON.stringify([servidor, base, nuevo])).toBe(copia);
  });
});
