import { describe, it, expect } from 'vitest';
import { planEscrituraOC } from './diffOrdenCompra';

const doc = (id: string) => ({ id, tipo: 'factura', nombre: id });
const ant = (ocId: string, m: number) => ({ ocId, folio: ocId, moneda: 'USD', montoAplicado: m });

describe('planEscrituraOC', () => {
  it('conserva el documento que otra persona subió mientras tanto', () => {
    const r = planEscrituraOC({ documentos: [doc('a'), doc('x')] }, { documentos: [doc('a')] }, { documentos: [doc('a'), doc('b')] });
    expect((r.documentos as { id: string }[]).map(d => d.id)).toEqual(['a', 'x', 'b']);
  });
  it('«No pagar» sobrevive a una edición ajena y no se reescribe lo que no cambió', () => {
    const r = planEscrituraOC({ noPagar: true, bancoSalida: 'a' }, { noPagar: false, bancoSalida: 'a' }, { noPagar: false, bancoSalida: 'b' });
    expect(r).toEqual({ bancoSalida: 'b' });
  });
  it('quitar un anticipo no quita el que otra persona aplicó, y recalcula el saldo', () => {
    const r = planEscrituraOC(
      { monto: 1000, anticiposCruzados: [ant('A', 100), ant('B', 200)] },
      { monto: 1000, anticiposCruzados: [ant('A', 100)] },
      { anticiposCruzados: [] });
    expect(r.anticiposCruzados).toEqual([ant('B', 200)]);
    expect(r.saldoPendiente).toBe(800);
  });
  it('aplicar un anticipo suma al que otra persona aplicó', () => {
    const r = planEscrituraOC(
      { monto: 1000, anticiposCruzados: [ant('B', 200)] }, { monto: 1000, anticiposCruzados: [] },
      { anticiposCruzados: [ant('A', 100)] });
    expect((r.anticiposCruzados as { ocId: string }[]).map(a => a.ocId)).toEqual(['B', 'A']);
    expect(r.saldoPendiente).toBe(700);
  });
  it('sin cambios no escribe nada, ni updatedAt', () => {
    expect(planEscrituraOC({}, { a: 1 }, { a: 1, updatedAt: 'x' })).toEqual({});
  });
  it('anticipos vacíos → saldoPendiente null', () => {
    const r = planEscrituraOC({ monto: 10, anticiposCruzados: [ant('A', 1)] }, { anticiposCruzados: [ant('A', 1)] }, { anticiposCruzados: [] });
    expect(r.saldoPendiente).toBeNull();
  });
});
